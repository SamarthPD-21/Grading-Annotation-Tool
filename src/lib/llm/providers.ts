import OpenAI from 'openai';
import { LLMError } from './errors';

export type ProviderId = 'gemini' | 'gemma' | 'openai';

/** Structured-output rungs, strongest first. */
export type StructuredMode = 'strict' | 'json_object' | 'text';

export interface ProviderConfig {
  id: ProviderId;
  model: string;
  apiKeyEnv: 'GEMINI_API_KEY' | 'OPENAI_API_KEY';
  /** undefined => the SDK default (api.openai.com) */
  baseURL?: string;
  structuredMode: StructuredMode;
  temperature: number;
}

export const GOOGLE_OPENAI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/';
/**
 * Gemma leads because it is free at every tier with real quota, whereas Gemini Flash's free
 * tier allows only ~20 requests/day — with Gemini first almost every paper fell back, which
 * made the "graded by a fallback model" review flag meaningless.
 */
export const DEFAULT_PROVIDER_CHAIN = 'gemma,gemini,openai';

const PROVIDER_IDS: ProviderId[] = ['gemini', 'gemma', 'openai'];
const STRUCTURED_MODES: StructuredMode[] = ['strict', 'json_object', 'text'];

function isProviderId(value: string): value is ProviderId {
  return (PROVIDER_IDS as string[]).includes(value);
}

function structuredModeFromEnv(value: string | undefined, fallback: StructuredMode): StructuredMode {
  return value && (STRUCTURED_MODES as string[]).includes(value) ? (value as StructuredMode) : fallback;
}

/**
 * Env is read here, at call time, rather than at module scope — module-level reads freeze
 * the values at import and are untestable.
 */
export function getProviderConfig(id: ProviderId): ProviderConfig {
  switch (id) {
    case 'gemini':
      return {
        id,
        model: process.env.GEMINI_MODEL || 'gemini-3.7-flash',
        apiKeyEnv: 'GEMINI_API_KEY',
        baseURL: GOOGLE_OPENAI_BASE_URL,
        structuredMode: 'strict',
        temperature: 0,
      };
    case 'gemma':
      return {
        id,
        model: process.env.GEMMA_MODEL || 'gemma-4-31b-it',
        apiKeyEnv: 'GEMINI_API_KEY',
        baseURL: GOOGLE_OPENAI_BASE_URL,
        // Starts one rung down: json_schema support for Gemma through the compat shim is
        // unconfirmed. Promote to 'strict' via GEMMA_STRUCTURED_MODE once verified.
        structuredMode: structuredModeFromEnv(process.env.GEMMA_STRUCTURED_MODE, 'json_object'),
        temperature: 0,
      };
    case 'openai':
      return {
        id,
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        apiKeyEnv: 'OPENAI_API_KEY',
        structuredMode: 'strict',
        temperature: 0,
      };
  }
}

/**
 * Ordered list of providers to try. Providers whose API key is unset are dropped, which is
 * what lets one default chain serve every configuration: an OpenAI-only install keeps
 * working untouched, and a Gemini-only install never attempts OpenAI.
 */
export function getProviderChain(): ProviderConfig[] {
  const requested = (process.env.LLM_PROVIDER_CHAIN || DEFAULT_PROVIDER_CHAIN)
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const chain = [...new Set(requested)]
    .filter(isProviderId)
    .map(getProviderConfig)
    .filter((cfg) => !!process.env[cfg.apiKeyEnv]);

  if (chain.length === 0) {
    throw new LLMError(
      'LLM_NOT_CONFIGURED',
      'No AI provider is configured. Set GEMINI_API_KEY (covers both Gemini and Gemma) ' +
        'or OPENAI_API_KEY, and make sure LLM_PROVIDER_CHAIN names a provider with a key.',
      { failover: false }
    );
  }

  return chain;
}

const clients = new Map<ProviderId, OpenAI>();

export function getClientFor(config: ProviderConfig): OpenAI {
  const cached = clients.get(config.id);
  if (cached) {
    return cached;
  }

  const apiKey = process.env[config.apiKeyEnv];
  if (!apiKey) {
    throw new LLMError(
      'LLM_NOT_CONFIGURED',
      `${config.apiKeyEnv} is not configured in environment variables`,
      { provider: config.id, model: config.model, failover: true }
    );
  }

  const client = new OpenAI({ apiKey, baseURL: config.baseURL });
  clients.set(config.id, client);
  return client;
}

/** Test helper — drops the memoised clients so a changed API key takes effect. */
export function resetProviderClients(): void {
  clients.clear();
}
