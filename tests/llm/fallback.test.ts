import { describe, it, expect, beforeEach, vi } from 'vitest';

interface CompletionParams {
  model: string;
  response_format?: unknown;
  messages: Array<{ role: string; content: string }>;
}
type Mode = 'parse' | 'create';
type Handler = (params: CompletionParams) => unknown;

/** Per-model handlers registered by each test, keyed `${model}:${mode}`. */
const handlers = new Map<string, Handler>();

function respond(model: string, mode: Mode, handler: Handler) {
  handlers.set(`${model}:${mode}`, handler);
}

function dispatch(mode: Mode, params: CompletionParams) {
  const handler = handlers.get(`${params.model}:${mode}`);
  if (!handler) {
    throw Object.assign(new Error(`404 model not found: ${params.model} (${mode})`), { status: 404 });
  }
  return handler(params);
}

const constructorCalls: Array<{ apiKey?: string; baseURL?: string }> = [];

vi.mock('openai', () => {
  class MockOpenAI {
    chat = {
      completions: {
        parse: vi.fn(async (params: CompletionParams) => dispatch('parse', params)),
        create: vi.fn(async (params: CompletionParams) => dispatch('create', params)),
      },
    };

    constructor(opts: { apiKey?: string; baseURL?: string }) {
      constructorCalls.push(opts);
    }
  }

  return { default: MockOpenAI };
});

import { callGradingModel } from '@/lib/llm/client';
import { LLMError } from '@/lib/llm/errors';
import { resetProviderClients } from '@/lib/llm/providers';

const GOOD_RESULT = {
  rubricResults: [
    {
      rubricId: 'rp-1',
      status: 'CORRECT' as const,
      marksAwarded: 2,
      evidence: { text: 'plants convert light energy', page: 1 },
      feedback: 'Correct.',
      correction: null,
      confidence: 0.9,
      humanReview: false,
    },
  ],
};

const INPUT = {
  questionText: 'Q1: What is photosynthesis?',
  rubric: [],
  studentAnswerText: 'Plants convert light energy into chemical energy.',
};

const parsedOk = () => ({ choices: [{ message: { parsed: GOOD_RESULT, refusal: null } }] });
const contentOk = (content: string) => ({ choices: [{ message: { content, refusal: null } }] });

const quota = (msg = '429 You have no credits remaining.') =>
  Object.assign(new Error(msg), { status: 429 });

beforeEach(() => {
  handlers.clear();
  constructorCalls.length = 0;
  resetProviderClients();
  vi.restoreAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});

  process.env.GEMINI_API_KEY = 'g-key';
  delete process.env.OPENAI_API_KEY;
  // Pinned rather than relying on the default order: these tests are about what happens
  // when the primary fails, not about which provider leads (see providers.test.ts).
  process.env.LLM_PROVIDER_CHAIN = 'gemini,gemma';
  delete process.env.GEMINI_MODEL;
  delete process.env.GEMMA_MODEL;
  delete process.env.GEMMA_STRUCTURED_MODE;
});

describe('provider fallback', () => {
  it('grades on Gemini when it is healthy', async () => {
    respond('gemini-3.7-flash', 'parse', parsedOk);

    const call = await callGradingModel(INPUT);

    expect(call.provider).toBe('gemini');
    expect(call.model).toBe('gemini-3.7-flash');
    expect(call.structuredMode).toBe('strict');
    expect(call.fallbackUsed).toBe(false);
    expect(call.attempts).toEqual([]);
    expect(call.result).toEqual(GOOD_RESULT);
  });

  it('falls back to Gemma when Gemini is out of quota', async () => {
    respond('gemini-3.7-flash', 'parse', () => {
      throw quota();
    });
    respond('gemma-4-31b-it', 'create', () => contentOk(JSON.stringify(GOOD_RESULT)));

    const call = await callGradingModel(INPUT);

    expect(call.provider).toBe('gemma');
    expect(call.model).toBe('gemma-4-31b-it');
    expect(call.fallbackUsed).toBe(true);
    expect(call.attempts).toHaveLength(1);
    expect(call.attempts[0].code).toBe('LLM_QUOTA_EXCEEDED');
    expect(call.result).toEqual(GOOD_RESULT);
  });

  it('points both Google providers at the OpenAI-compatible endpoint', async () => {
    respond('gemini-3.7-flash', 'parse', parsedOk);
    await callGradingModel(INPUT);

    expect(constructorCalls[0]).toEqual({
      apiKey: 'g-key',
      baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    });
  });

  it('reports the primary provider failure when the whole chain is exhausted', async () => {
    respond('gemini-3.7-flash', 'parse', () => {
      throw quota();
    });
    respond('gemma-4-31b-it', 'create', () => {
      throw quota('429 RESOURCE_EXHAUSTED');
    });

    const error = (await callGradingModel(INPUT).catch((e) => e)) as LLMError;

    expect(error).toBeInstanceOf(LLMError);
    expect(error.code).toBe('LLM_QUOTA_EXCEEDED');
    expect(error.provider).toBe('gemini');
    expect(error.attempts.map((a) => a.model)).toEqual(['gemini-3.7-flash', 'gemma-4-31b-it']);
  });

  it('does not shop a refusal around to other providers', async () => {
    respond('gemini-3.7-flash', 'parse', () => ({
      choices: [{ message: { refusal: 'Safety policy triggered', parsed: null } }],
    }));
    const gemma = vi.fn(() => contentOk(JSON.stringify(GOOD_RESULT)));
    respond('gemma-4-31b-it', 'create', gemma);

    const error = (await callGradingModel(INPUT).catch((e) => e)) as LLMError;

    expect(error.code).toBe('LLM_REFUSAL');
    expect(gemma).not.toHaveBeenCalled();
  });

  it('does not retry a deterministic 400 on another provider', async () => {
    respond('gemini-3.7-flash', 'parse', () => {
      throw Object.assign(new Error('400 context_length_exceeded'), { status: 400 });
    });
    const gemma = vi.fn(() => contentOk(JSON.stringify(GOOD_RESULT)));
    respond('gemma-4-31b-it', 'create', gemma);

    const error = (await callGradingModel(INPUT).catch((e) => e)) as LLMError;

    expect(error.code).toBe('LLM_BAD_REQUEST');
    expect(gemma).not.toHaveBeenCalled();
  });
});

describe('structured-output ladder', () => {
  it('steps down to json_object when the model rejects json_schema', async () => {
    process.env.GEMMA_STRUCTURED_MODE = 'strict';
    process.env.LLM_PROVIDER_CHAIN = 'gemma';

    respond('gemma-4-31b-it', 'parse', () => {
      throw Object.assign(
        new Error("400 Invalid value for 'response_format': json_schema is not supported"),
        { status: 400 }
      );
    });
    respond('gemma-4-31b-it', 'create', (params) => {
      expect(params.response_format).toEqual({ type: 'json_object' });
      return contentOk(JSON.stringify(GOOD_RESULT));
    });

    const call = await callGradingModel(INPUT);

    expect(call.structuredMode).toBe('json_object');
    expect(call.result).toEqual(GOOD_RESULT);
  });

  it('steps down to plain text when json mode is also rejected', async () => {
    process.env.LLM_PROVIDER_CHAIN = 'gemma';

    let seen = 0;
    respond('gemma-4-31b-it', 'create', (params) => {
      seen += 1;
      if (params.response_format) {
        throw Object.assign(new Error('400 response_format is not supported'), { status: 400 });
      }
      return contentOk(JSON.stringify(GOOD_RESULT));
    });

    const call = await callGradingModel(INPUT);

    expect(seen).toBe(2);
    expect(call.structuredMode).toBe('text');
  });

  it('parses a fenced markdown JSON response', async () => {
    process.env.LLM_PROVIDER_CHAIN = 'gemma';
    respond('gemma-4-31b-it', 'create', () =>
      contentOk('```json\n' + JSON.stringify(GOOD_RESULT) + '\n```')
    );

    await expect(callGradingModel(INPUT)).resolves.toMatchObject({ result: GOOD_RESULT });
  });

  it('rejects schema-invalid JSON rather than grading on it', async () => {
    process.env.LLM_PROVIDER_CHAIN = 'gemma';
    respond('gemma-4-31b-it', 'create', () =>
      // confidence out of range — the zod firewall must catch this
      contentOk(JSON.stringify({ rubricResults: [{ ...GOOD_RESULT.rubricResults[0], confidence: 7 }] }))
    );

    const error = (await callGradingModel(INPUT).catch((e) => e)) as LLMError;

    expect(error.code).toBe('LLM_PARSE_ERROR');
  });
});
