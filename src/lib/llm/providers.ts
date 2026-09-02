import OpenAI from 'openai';
import { LLMError } from './errors';

export type ProviderId = 'gemini' | 'gemma' | 'openai' | 'groq' | 'openrouter' | 'mistral';

/** Structured-output rungs, strongest first. */
export type StructuredMode = 'strict' | 'json_object' | 'text';

export type ApiKeyEnv =
  | 'GEMINI_API_KEY'
  | 'OPENAI_API_KEY'
  | 'GROQ_API_KEY'
  | 'OPENROUTER_API_KEY'
  | 'MISTRAL_API_KEY';

export interface ProviderConfig {
  id: ProviderId;
  model: string;
  apiKeyEnv: ApiKeyEnv;
  /** undefined => the SDK default (api.openai.com) */
  baseURL?: string;
  structuredMode: StructuredMode;
  temperature: number;
}

export const GOOGLE_OPENAI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/';
export const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
export const MISTRAL_BASE_URL = 'https://api.mistral.ai/v1';

export const DEFAULT_PROVIDER_CHAIN = 'gemma,gemini,groq,openrouter,mistral,openai';

const PROVIDER_IDS: ProviderId[] = ['gemini', 'gemma', 'openai', 'groq', 'openrouter', 'mistral'];
const STRUCTURED_MODES: StructuredMode[] = ['strict', 'json_object', 'text'];

function isProviderId(value: string): value is ProviderId {
  return (PROVIDER_IDS as string[]).includes(value);
}

function structuredModeFromEnv(value: string | undefined, fallback: StructuredMode): StructuredMode {
  return value && (STRUCTURED_MODES as string[]).includes(value) ? (value as StructuredMode) : fallback;
}

export function getProviderConfig(id: ProviderId, customModel?: string): ProviderConfig {
  switch (id) {
    case 'gemini':
      return {
        id,
        model: customModel || process.env.GEMINI_MODEL || 'gemini-3.7-flash',
        apiKeyEnv: 'GEMINI_API_KEY',
        baseURL: GOOGLE_OPENAI_BASE_URL,
        structuredMode: 'strict',
        temperature: 0,
      };
    case 'gemma':
      return {
        id,
        model: customModel || process.env.GEMMA_MODEL || 'gemma-4-31b-it',
        apiKeyEnv: 'GEMINI_API_KEY',
        baseURL: GOOGLE_OPENAI_BASE_URL,
        structuredMode: structuredModeFromEnv(process.env.GEMMA_STRUCTURED_MODE, 'json_object'),
        temperature: 0,
      };
    case 'groq':
      return {
        id,
        model: customModel || process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
        apiKeyEnv: 'GROQ_API_KEY',
        baseURL: GROQ_BASE_URL,
        structuredMode: 'json_object',
        temperature: 0,
      };
    case 'openrouter':
      return {
        id,
        model: customModel || process.env.OPENROUTER_MODEL || 'google/gemini-2.0-flash-lite:free',
        apiKeyEnv: 'OPENROUTER_API_KEY',
        baseURL: OPENROUTER_BASE_URL,
        structuredMode: 'json_object',
        temperature: 0,
      };
    case 'mistral':
      return {
        id,
        model: customModel || process.env.MISTRAL_MODEL || 'mistral-small-latest',
        apiKeyEnv: 'MISTRAL_API_KEY',
        baseURL: MISTRAL_BASE_URL,
        structuredMode: 'json_object',
        temperature: 0,
      };
    case 'openai':
      return {
        id,
        model: customModel || process.env.OPENAI_MODEL || 'gpt-4o-mini',
        apiKeyEnv: 'OPENAI_API_KEY',
        structuredMode: 'strict',
        temperature: 0,
      };
  }
}

/**
 * Ordered list of providers to try. Providers whose API key is unset are dropped.
 * Supports syntax like "gemma, gemini, gemini/gemini-2.5-flash, groq, openrouter, openai"
 */
export function getProviderChain(): ProviderConfig[] {
  const rawRequested = (process.env.LLM_PROVIDER_CHAIN || DEFAULT_PROVIDER_CHAIN)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const configs: ProviderConfig[] = [];

  for (const item of rawRequested) {
    const parts = item.split('/');
    const providerStr = parts[0].toLowerCase();
    const modelStr = parts.slice(1).join('/');

    if (isProviderId(providerStr)) {
      const cfg = getProviderConfig(providerStr, modelStr || undefined);
      if (process.env[cfg.apiKeyEnv]) {
        configs.push(cfg);
      }
    }
  }

  // Deduplicate by provider id + model combination
  const chain: ProviderConfig[] = [];
  const seen = new Set<string>();
  for (const cfg of configs) {
    const key = `${cfg.id}:${cfg.model}`;
    if (!seen.has(key)) {
      seen.add(key);
      chain.push(cfg);
    }
  }

  if (chain.length === 0) {
    throw new LLMError(
      'LLM_NOT_CONFIGURED',
      'No AI provider is configured. Set GEMINI_API_KEY (covers Gemini & Gemma), GROQ_API_KEY, OPENROUTER_API_KEY, MISTRAL_API_KEY, or OPENAI_API_KEY in .env.',
      { failover: false }
    );
  }

  return chain;
}

const clients = new Map<string, OpenAI>();

export function getClientFor(config: ProviderConfig): OpenAI {
  const cacheKey = `${config.id}:${config.apiKeyEnv}`;
  const cached = clients.get(cacheKey);
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
  clients.set(cacheKey, client);
  return client;
}

export function resetProviderClients(): void {
  clients.clear();
}
