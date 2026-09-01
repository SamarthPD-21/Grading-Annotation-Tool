export type LLMErrorCode =
  | 'LLM_QUOTA_EXCEEDED'
  | 'LLM_AUTH_ERROR'
  | 'LLM_MODEL_UNAVAILABLE'
  | 'LLM_TIMEOUT'
  | 'LLM_UNAVAILABLE'
  | 'LLM_BAD_REQUEST'
  | 'LLM_REFUSAL'
  | 'LLM_PARSE_ERROR'
  | 'LLM_NO_RESPONSE'
  | 'LLM_NOT_CONFIGURED'
  | 'LLM_UNKNOWN';

export interface AttemptRecord {
  provider: string;
  model: string;
  code: LLMErrorCode;
  message: string;
}

export interface LLMErrorOptions {
  provider?: string;
  model?: string;
  status?: number;
  /** Should the chain advance to the next provider? */
  failover?: boolean;
  /** Provider rejected response_format — step down the structured-output ladder. */
  schemaRejection?: boolean;
  attempts?: AttemptRecord[];
  cause?: unknown;
}

export class LLMError extends Error {
  readonly code: LLMErrorCode;
  readonly provider?: string;
  readonly model?: string;
  readonly status?: number;
  readonly failover: boolean;
  readonly schemaRejection: boolean;
  attempts: AttemptRecord[];

  constructor(code: LLMErrorCode, message: string, options: LLMErrorOptions = {}) {
    super(message);
    this.name = 'LLMError';
    this.code = code;
    this.provider = options.provider;
    this.model = options.model;
    this.status = options.status;
    this.failover = options.failover ?? true;
    this.schemaRejection = options.schemaRejection ?? false;
    this.attempts = options.attempts ?? [];
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

export interface ErrorContext {
  id?: string;
  model?: string;
}

/** The union of shapes the OpenAI SDK and Google's compat shim throw. */
interface ErrorLike {
  status?: number;
  response?: { status?: number };
  message?: unknown;
  name?: unknown;
  code?: unknown;
}

/**
 * Duck-types the error rather than relying on `instanceof OpenAI.APIError`.
 * Google's OpenAI-compatible shim surfaces errors through the same SDK but with a
 * different body shape, and duck-typing keeps this trivially unit-testable.
 */
export function classifyLLMError(error: unknown, ctx: ErrorContext = {}): LLMError {
  if (error instanceof LLMError) {
    return error;
  }

  const raw = error as ErrorLike | null | undefined;
  const status: number | undefined = raw?.status ?? raw?.response?.status;
  const message = String(raw?.message ?? error);
  const name = String(raw?.name ?? '');
  const errno = String(raw?.code ?? '');

  const base: LLMErrorOptions = {
    provider: ctx.id,
    model: ctx.model,
    status,
    cause: error,
  };

  const make = (code: LLMErrorCode, extra: LLMErrorOptions = {}) =>
    new LLMError(code, message, { ...base, ...extra });

  if (status === 429 || /quota|credits|rate limit|RESOURCE_EXHAUSTED/i.test(message)) {
    return make('LLM_QUOTA_EXCEEDED');
  }

  if (status === 401 || status === 403 || /api key|API_KEY_INVALID|PERMISSION_DENIED/i.test(message)) {
    return make('LLM_AUTH_ERROR');
  }

  // Checked before the 404 branch: a schema rejection reads "... is not supported", which
  // would otherwise be mistaken for an unknown model and lose the schemaRejection flag.
  if (status === 400) {
    // A model that cannot honour structured output says so with a 400 naming the offending
    // field. That is recoverable by stepping down the mode ladder; any other 400 is
    // deterministic, so replaying it on a second provider only burns quota.
    if (/response_format|json_schema|responseSchema|strict|structured/i.test(message)) {
      return make('LLM_MODEL_UNAVAILABLE', { schemaRejection: true });
    }
    return make('LLM_BAD_REQUEST', { failover: false });
  }

  if (status === 404 || /model.*not found|is not supported/i.test(message)) {
    return make('LLM_MODEL_UNAVAILABLE');
  }

  if (status === 504 || /timeout|timed out|ETIMEDOUT/i.test(message) || errno === 'ETIMEDOUT') {
    return make('LLM_TIMEOUT');
  }

  // The SDK's APIConnectionError carries name 'Error' and no status, so the class name has
  // to be part of the haystack — matching on `name` alone silently misses every one of them.
  const className = String((raw as { constructor?: { name?: string } })?.constructor?.name ?? '');
  if (
    (typeof status === 'number' && status >= 500) ||
    /APIConnectionError|connection error|ECONNRESET|ENOTFOUND|ECONNREFUSED|EAI_AGAIN|fetch failed/i.test(
      `${className} ${name} ${message} ${errno}`
    )
  ) {
    return make('LLM_UNAVAILABLE');
  }

  return make('LLM_UNKNOWN');
}

/** Sentinel-prefixed errors thrown by the validation firewall, e.g. `INVALID_MARKS: ...`. */
const SENTINEL_PATTERN = /^([A-Z][A-Z0-9_]{4,}): ([\s\S]*)$/;

/** One actionable next step per failure kind, rather than a pasted vendor string. */
export function remedyFor(code: LLMErrorCode): string | null {
  switch (code) {
    case 'LLM_QUOTA_EXCEEDED':
      return 'Every configured provider is out of quota. Add credits, or add a provider with free quota to LLM_PROVIDER_CHAIN.';
    case 'LLM_AUTH_ERROR':
      return 'An API key was rejected. Check GEMINI_API_KEY / OPENAI_API_KEY in .env, then restart the server so it picks the new value up.';
    case 'LLM_UNAVAILABLE':
      return 'Could not reach the provider. Check network access and any proxy or firewall between this server and the provider.';
    case 'LLM_MODEL_UNAVAILABLE':
      return 'The configured model id was rejected. Verify it with `npm run smoke:llm -- --list`.';
    case 'LLM_NOT_CONFIGURED':
      return 'Set GEMINI_API_KEY (it covers both Gemini and Gemma) or OPENAI_API_KEY in .env.';
    case 'LLM_TIMEOUT':
      return 'The provider did not respond in time. Re-grading usually clears this.';
    case 'LLM_REFUSAL':
      return 'The model declined to grade this submission. It needs a human marker.';
    case 'LLM_PARSE_ERROR':
      return 'The model returned output that did not match the grading schema. Re-grading usually clears this.';
    default:
      return null;
  }
}

function humanMessage(error: LLMError): string {
  if (error.attempts.length === 0) {
    const where = error.provider ? ` (${error.provider}/${error.model})` : '';
    return `${error.message}${where}`;
  }

  const failed = error.attempts.length === 1 ? '1 provider' : `all ${error.attempts.length} providers`;
  return `Grading could not reach a working model — ${failed} failed.`;
}

export interface SubmissionError {
  errorCode: string;
  errorMessage: string;
  /** JSON blob of the per-provider attempts, so the UI can show a real breakdown. */
  errorDetail: string | null;
}

/**
 * Turns an arbitrary pipeline failure into the fields persisted on the submission, so
 * operators see something actionable instead of one opaque bucket.
 */
export function toSubmissionError(error: unknown): SubmissionError {
  if (error instanceof LLMError) {
    const detail = {
      remedy: remedyFor(error.code),
      attempts: error.attempts.length
        ? error.attempts
        : [
            {
              provider: error.provider ?? 'unknown',
              model: error.model ?? 'unknown',
              code: error.code,
              message: error.message,
            },
          ],
    };
    return {
      errorCode: error.code,
      errorMessage: humanMessage(error),
      errorDetail: JSON.stringify(detail),
    };
  }

  const errorMessage = error instanceof Error ? error.message : String(error);
  const sentinel = SENTINEL_PATTERN.exec(errorMessage);
  if (sentinel) {
    return { errorCode: sentinel[1], errorMessage: sentinel[2], errorDetail: null };
  }

  return { errorCode: 'GRADING_PIPELINE_ERROR', errorMessage, errorDetail: null };
}
