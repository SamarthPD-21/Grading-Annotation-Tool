import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';
import { GradingResultSchema, GradingResultSchemaType } from './schema';
import { PaperStructure, PaperStructureSchema } from './paperSchema';
import { SYSTEM_PROMPT, PAPER_EXTRACTION_PROMPT, jsonOutputInstruction } from './prompt';
import {
  ProviderConfig,
  ProviderId,
  StructuredMode,
  getClientFor,
  getProviderChain,
} from './providers';
import { AttemptRecord, LLMError, classifyLLMError, condenseProviderMessage } from './errors';

export interface RubricPromptItem {
  id: string;
  questionNumber: number;
  questionText: string;
  description: string;
  maxMarks: number;
  expected?: string | null;
}

export interface StructuredCall<T> {
  result: T;
  provider: ProviderId;
  /** The model that actually answered — not necessarily the chain's first entry. */
  model: string;
  /** The structured-output rung that succeeded. */
  structuredMode: StructuredMode;
  fallbackUsed: boolean;
  /** Every failed attempt, for diagnostics. */
  attempts: AttemptRecord[];
}

export type GradingModelCall = StructuredCall<GradingResultSchemaType>;

const LADDER: StructuredMode[] = ['strict', 'json_object', 'text'];

interface Task<T> {
  system: string;
  user: string;
  schema: z.ZodType<T>;
  /** Name given to the JSON schema in the strict-mode request. */
  schemaName: string;
}

/**
 * Walks `str` from `openPos` (which must be a `{`) tracking brace depth and
 * respecting JSON string boundaries.  Returns the index of the matching `}`,
 * or -1 if the object is never closed.
 *
 * This is O(n) and handles:
 * - Nested `{}` and `[]`
 * - Braces inside quoted strings (`"feedback": "use {curly} braces"`)
 * - Escaped characters inside strings (`\"`, `\\`)
 */
function findMatchingBrace(str: string, openPos: number): number {
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = openPos; i < str.length; i++) {
    const ch = str[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (ch === '\\' && inString) {
      escape = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }

  return -1;
}

/**
 * Reasoning-style models (Gemma among them) prefix their answer with a scratchpad. That
 * prose regularly contains a brace — e.g. ``Evidence object: `{ "text": "...", "page": 1 }` ``
 * — and if we lock onto the first `{` in the response we parse the example instead of the
 * real payload. Stripping the block first removes the whole class of failure.
 */
/**
 * Control characters a model can leak into string values, which make JSON.parse fail.
 * Built from a string literal so the escapes survive editing (raw bytes here do not).
 * Tab, newline and carriage return are deliberately kept.
 */
const CONTROL_CHARS = new RegExp(
  '[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]',
  'g'
);

function stripReasoning(content: string): string {
  let out = content;
  for (const tag of ['thought', 'think', 'reasoning', 'scratchpad']) {
    // Closed blocks first, then an unclosed opener (a truncated preamble).
    out = out.replace(new RegExp(String.raw`<${tag}>[\s\S]*?</${tag}>`, 'gi'), ' ');
    out = out.replace(new RegExp(String.raw`^[\s\S]*?<${tag}>`, 'i'), ' ');
  }
  return out.replace(/```(?:json)?/gi, ' ').trim();
}

/**
 * Extracts and validates a JSON object from an LLM's free-text completion.
 *
 * Every `{` is treated as a candidate start: we balance-match it, parse it, and check it
 * against the schema, returning the first candidate that actually validates. Taking the
 * first brace on faith is what let a brace inside prose masquerade as the answer.
 */
function parseLooseJson<T>(content: string, task: Task<T>, config: ProviderConfig): T {
  const cleaned = stripReasoning(content);

  const fail = (why: string, cause?: unknown): never => {
    throw new LLMError('LLM_PARSE_ERROR', why, {
      provider: config.id,
      model: config.model,
      cause,
    });
  };

  const attempt = (raw: string): T | null => {
    let candidate: unknown;
    try {
      candidate = JSON.parse(raw);
    } catch {
      try {
        candidate = JSON.parse(
          raw
            .replace(CONTROL_CHARS, '')
            .replace(/,\s*([}\]])/g, '$1')
        );
      } catch {
        return null;
      }
    }
    const parsed = task.schema.safeParse(candidate);
    return parsed.success ? parsed.data : null;
  };

  let searchFrom = cleaned.indexOf('{');
  if (searchFrom === -1) {
    fail('Model response contained no JSON object');
  }

  let sawObject = false;
  let lastSchemaMiss: string | null = null;

  while (searchFrom !== -1) {
    const close = findMatchingBrace(cleaned, searchFrom);
    if (close !== -1) {
      sawObject = true;
      const raw = cleaned.slice(searchFrom, close + 1);
      const ok = attempt(raw);
      if (ok !== null) return ok;

      try {
        const shape = task.schema.safeParse(JSON.parse(raw));
        if (!shape.success) lastSchemaMiss = shape.error.message;
      } catch {
        /* not JSON at all — keep looking */
      }
    }
    searchFrom = cleaned.indexOf('{', searchFrom + 1);
  }

  if (!sawObject) {
    fail('Model response contained an unclosed JSON object');
  }
  return fail(
    `No JSON object in the model response matched the ${task.schemaName} schema` +
      (lastSchemaMiss ? `: ${lastSchemaMiss}` : '')
  );
}

/** One HTTP call, at one rung of the ladder. */
async function callOnce<T>(
  config: ProviderConfig,
  mode: StructuredMode,
  task: Task<T>
): Promise<T> {
  const client = getClientFor(config);

  const refusalOf = (refusal: string) =>
    new LLMError('LLM_REFUSAL', `Model refused the request: ${refusal}`, {
      provider: config.id,
      model: config.model,
      failover: false,
    });

  const noResponse = (why: string) =>
    new LLMError('LLM_NO_RESPONSE', why, { provider: config.id, model: config.model });

  if (mode === 'strict') {
    const completion = await client.chat.completions.parse({
      model: config.model,
      temperature: config.temperature,
      messages: [
        { role: 'system', content: task.system },
        { role: 'user', content: task.user },
      ],
      response_format: zodResponseFormat(task.schema, task.schemaName),
    });

    const choice = completion.choices[0];
    if (!choice || !choice.message) throw noResponse('Model returned no choices');
    if (choice.message.refusal) throw refusalOf(choice.message.refusal);
    if (!choice.message.parsed) {
      throw new LLMError('LLM_PARSE_ERROR', 'Failed to parse structured output', {
        provider: config.id,
        model: config.model,
      });
    }

    return choice.message.parsed as T;
  }

  const completion = await client.chat.completions.create({
    model: config.model,
    temperature: config.temperature,
    messages: [
      { role: 'system', content: `${task.system}\n\n${jsonOutputInstruction(task.schema)}` },
      { role: 'user', content: task.user },
    ],
    ...(mode === 'json_object' ? { response_format: { type: 'json_object' as const } } : {}),
  });

  const choice = completion.choices[0];
  if (!choice || !choice.message) throw noResponse('Model returned no choices');
  if (choice.message.refusal) throw refusalOf(choice.message.refusal);
  if (!choice.message.content) throw noResponse('Model returned an empty message');

  return parseLooseJson(choice.message.content, task, config);
}

/**
 * Walks the structured-output ladder within a single provider, stepping down only when the
 * provider explicitly rejects the response format.
 */
async function callProvider<T>(
  config: ProviderConfig,
  task: Task<T>
): Promise<{ result: T; structuredMode: StructuredMode }> {
  const modes = LADDER.slice(LADDER.indexOf(config.structuredMode));
  let lastError: LLMError | undefined;

  for (const mode of modes) {
    try {
      const result = await callOnce(config, mode, task);
      return { result, structuredMode: mode };
    } catch (error) {
      const classified = classifyLLMError(error, config);
      if (!classified.schemaRejection) {
        throw classified;
      }
      console.warn(
        `[llm] ${config.id}/${config.model} rejected '${mode}' structured output, stepping down`
      );
      lastError = classified;
    }
  }

  throw (
    lastError ??
    new LLMError('LLM_UNKNOWN', 'Structured-output ladder exhausted', {
      provider: config.id,
      model: config.model,
    })
  );
}

/** Walks the provider chain, falling over on quota/availability errors. */
async function callChain<T>(task: Task<T>): Promise<StructuredCall<T>> {
  const chain = getProviderChain();
  const attempts: AttemptRecord[] = [];

  for (const [index, config] of chain.entries()) {
    try {
      const { result, structuredMode } = await callProvider(config, task);

      if (index > 0) {
        console.warn(
          `[llm] fell back to ${config.id}/${config.model} after ${attempts.length} failure(s)`
        );
      }

      return {
        result,
        provider: config.id,
        model: config.model,
        structuredMode,
        fallbackUsed: index > 0,
        attempts,
      };
    } catch (error) {
      const classified = classifyLLMError(error, config);
      attempts.push({
        provider: config.id,
        model: config.model,
        code: classified.code,
        message: condenseProviderMessage(classified.message),
      });

      if (!classified.failover) {
        classified.attempts = attempts;
        throw classified;
      }
    }
  }

  const primary = attempts[0];
  throw new LLMError(primary.code, primary.message, {
    provider: primary.provider,
    model: primary.model,
    attempts,
  });
}

export async function callGradingModel(input: {
  questionText: string;
  rubric: RubricPromptItem[];
  studentAnswerText: string;
}): Promise<GradingModelCall> {
  return callChain({
    system: SYSTEM_PROMPT,
    schema: GradingResultSchema,
    schemaName: 'grading_result',
    user: `
Question:
${input.questionText}

Rubric Points:
${JSON.stringify(input.rubric, null, 2)}

Student Answer:
${input.studentAnswerText}
`.trim(),
  });
}

export async function extractPaperStructure(input: {
  questionPaperText: string | null;
  rubricText: string | null;
}): Promise<StructuredCall<PaperStructure>> {
  const sections: string[] = [];
  if (input.questionPaperText?.trim()) {
    sections.push(`Question Paper:\n${input.questionPaperText.trim()}`);
  }
  if (input.rubricText?.trim()) {
    sections.push(`Model Answer and Marking Rubric:\n${input.rubricText.trim()}`);
  }

  if (sections.length === 0) {
    throw new LLMError(
      'LLM_BAD_REQUEST',
      'No readable text was found in the uploaded question paper or rubric.',
      { failover: false }
    );
  }

  return callChain({
    system: PAPER_EXTRACTION_PROMPT,
    schema: PaperStructureSchema,
    schemaName: 'paper_structure',
    user: sections.join('\n\n---\n\n'),
  });
}
