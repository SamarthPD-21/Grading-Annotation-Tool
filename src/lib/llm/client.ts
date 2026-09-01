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
import { AttemptRecord, LLMError, classifyLLMError } from './errors';

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

/** Pulls a JSON object out of a free-text completion, tolerating markdown fences. */
function parseLooseJson<T>(content: string, task: Task<T>, config: ProviderConfig): T {
  const unfenced = content.replace(/```(?:json)?/gi, '').trim();
  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');

  if (start === -1 || end <= start) {
    throw new LLMError('LLM_PARSE_ERROR', 'Model response contained no JSON object', {
      provider: config.id,
      model: config.model,
    });
  }

  let candidate: unknown;
  try {
    candidate = JSON.parse(unfenced.slice(start, end + 1));
  } catch (error) {
    throw new LLMError('LLM_PARSE_ERROR', `Model response was not valid JSON: ${String(error)}`, {
      provider: config.id,
      model: config.model,
      cause: error,
    });
  }

  const parsed = task.schema.safeParse(candidate);
  if (!parsed.success) {
    throw new LLMError(
      'LLM_PARSE_ERROR',
      `Model response did not match the ${task.schemaName} schema: ${parsed.error.message}`,
      { provider: config.id, model: config.model, cause: parsed.error }
    );
  }

  return parsed.data;
}

/** One HTTP call, at one rung of the ladder. */
async function callOnce<T>(
  config: ProviderConfig,
  mode: StructuredMode,
  task: Task<T>
): Promise<T> {
  const client = getClientFor(config);

  const refusalOf = (refusal: string) =>
    // A refusal is a decision about the content. Re-asking other models until one agrees
    // would launder that decision, so this never fails over.
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
 * provider explicitly rejects the response format. Costs nothing at steady state, since each
 * provider starts at the strongest rung it is known to support.
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
        message: classified.message,
      });

      if (!classified.failover) {
        classified.attempts = attempts;
        throw classified;
      }
    }
  }

  // Report the first provider's failure code: the primary provider is the one the operator
  // needs to act on, even though later providers were also tried.
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

/**
 * Turns the uploaded question paper and marking rubric into the structured questions and
 * rubric points grading runs against. Without this the app can only grade against whatever
 * rubric was hardcoded, regardless of what the teacher uploaded.
 */
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
