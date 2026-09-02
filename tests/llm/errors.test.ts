import { describe, it, expect } from 'vitest';
import {
  LLMError,
  LLMErrorCode,
  classifyLLMError,
  condenseProviderMessage,
  toSubmissionError,
} from '@/lib/llm/errors';

function apiError(message: string, status?: number, extra: Record<string, unknown> = {}) {
  return Object.assign(new Error(message), { status, ...extra });
}

describe('classifyLLMError', () => {
  const cases: Array<[string, unknown, LLMErrorCode, boolean]> = [
    ['OpenAI credit exhaustion', apiError('429 You have no credits remaining.', 429), 'LLM_QUOTA_EXCEEDED', true],
    ['Google quota exhaustion', apiError('RESOURCE_EXHAUSTED: quota exceeded'), 'LLM_QUOTA_EXCEEDED', true],
    ['invalid key', apiError('401 Incorrect API key provided', 401), 'LLM_AUTH_ERROR', true],
    ['permission denied', apiError('PERMISSION_DENIED', 403), 'LLM_AUTH_ERROR', true],
    ['unknown model', apiError('404 model not found', 404), 'LLM_MODEL_UNAVAILABLE', true],
    ['upstream outage', apiError('503 Service Unavailable', 503), 'LLM_UNAVAILABLE', true],
    ['dropped connection', apiError('ECONNRESET'), 'LLM_UNAVAILABLE', true],
    // The SDK's APIConnectionError has name 'Error' and no status, so only the message and
    // class name identify it. Regression guard: this used to fall through to LLM_UNKNOWN.
    ['SDK connection failure', apiError('Connection error.'), 'LLM_UNAVAILABLE', true],
    ['undici fetch failure', apiError('fetch failed'), 'LLM_UNAVAILABLE', true],
    ['request timeout', apiError('Request timed out'), 'LLM_TIMEOUT', true],
    ['generic bad request', apiError('400 context_length_exceeded', 400), 'LLM_BAD_REQUEST', false],
    ['unrecognised failure', apiError('something odd happened'), 'LLM_UNKNOWN', true],
  ];

  it.each(cases)('maps %s', (_label, error, expectedCode, expectedFailover) => {
    const classified = classifyLLMError(error, { id: 'gemini', model: 'gemini-3.7-flash' });

    expect(classified.code).toBe(expectedCode);
    expect(classified.failover).toBe(expectedFailover);
    expect(classified.provider).toBe('gemini');
    expect(classified.model).toBe('gemini-3.7-flash');
  });

  it('marks a response_format rejection as recoverable by stepping down the ladder', () => {
    const classified = classifyLLMError(
      apiError("400 Invalid value for 'response_format': json_schema is not supported", 400)
    );

    expect(classified.code).toBe('LLM_MODEL_UNAVAILABLE');
    expect(classified.schemaRejection).toBe(true);
    expect(classified.failover).toBe(true);
  });

  it('does not flag a generic 400 as a schema rejection', () => {
    expect(classifyLLMError(apiError('400 context_length_exceeded', 400)).schemaRejection).toBe(false);
  });

  it('passes an existing LLMError through unchanged', () => {
    const original = new LLMError('LLM_REFUSAL', 'refused', { failover: false });

    expect(classifyLLMError(original)).toBe(original);
  });
});

describe('toSubmissionError', () => {
  it('surfaces the LLM error code and carries every provider tried as structured detail', () => {
    const error = new LLMError('LLM_QUOTA_EXCEEDED', '429 quota exceeded', {
      provider: 'gemini',
      model: 'gemini-3.7-flash',
      attempts: [
        { provider: 'gemini', model: 'gemini-3.7-flash', code: 'LLM_QUOTA_EXCEEDED', message: '429 quota exceeded' },
        { provider: 'gemma', model: 'gemma-4-31b-it', code: 'LLM_QUOTA_EXCEEDED', message: '429 quota exceeded' },
      ],
    });

    const { errorCode, errorMessage, errorDetail } = toSubmissionError(error);

    expect(errorCode).toBe('LLM_QUOTA_EXCEEDED');
    expect(errorMessage).toContain('all 2 providers failed');

    const detail = JSON.parse(errorDetail!);
    expect(detail.attempts.map((a: { model: string }) => a.model)).toEqual([
      'gemini-3.7-flash',
      'gemma-4-31b-it',
    ]);
    expect(detail.remedy).toMatch(/quota/i);
  });

  it('synthesises a single attempt when the chain never got started', () => {
    const { errorDetail } = toSubmissionError(
      new LLMError('LLM_NOT_CONFIGURED', 'No AI provider is configured.')
    );

    const detail = JSON.parse(errorDetail!);
    expect(detail.attempts).toHaveLength(1);
    expect(detail.attempts[0].code).toBe('LLM_NOT_CONFIGURED');
    expect(detail.remedy).toMatch(/GEMINI_API_KEY/);
  });

  it('splits the validation firewall sentinels into a real code and message', () => {
    const { errorCode, errorMessage } = toSubmissionError(
      new Error('INVALID_MARKS: Marks awarded (5) for rubric rp-1 exceeds bounds [0, 3]')
    );

    expect(errorCode).toBe('INVALID_MARKS');
    expect(errorMessage).toBe('Marks awarded (5) for rubric rp-1 exceeds bounds [0, 3]');
  });

  it('still buckets genuine non-LLM failures as GRADING_PIPELINE_ERROR', () => {
    expect(toSubmissionError(new Error('Could not read PDF'))).toEqual({
      errorCode: 'GRADING_PIPELINE_ERROR',
      errorMessage: 'Could not read PDF',
      errorDetail: null,
    });
  });
});

describe('condenseProviderMessage', () => {
  const googleQuota =
    '429 [{"error":{"code":429,"message":"You exceeded your current quota, please check ' +
    'your plan and billing details.","status":"RESOURCE_EXHAUSTED","details":[{"@type":' +
    '"type.googleapis.com/google.rpc.QuotaFailure","violations":[{"quotaValue":"20"}]}]}}]';

  it('pulls the sentence out of a JSON error envelope', () => {
    const out = condenseProviderMessage(googleQuota);

    expect(out).toBe('You exceeded your current quota, please check your plan and billing details.');
    expect(out).not.toContain('quotaValue');
    expect(out).not.toContain('{');
  });

  it('keeps a plain vendor message as-is', () => {
    const plain = '429 You have no credits remaining.';
    expect(condenseProviderMessage(plain)).toBe(plain);
  });

  it('caps anything still too long for a banner', () => {
    const out = condenseProviderMessage('word '.repeat(200), 60);
    expect(out.length).toBeLessThanOrEqual(60);
    expect(out.endsWith('…')).toBe(true);
  });

  it('never returns empty, even for a bare payload', () => {
    expect(condenseProviderMessage('{"a":1}').length).toBeGreaterThan(0);
  });
});
