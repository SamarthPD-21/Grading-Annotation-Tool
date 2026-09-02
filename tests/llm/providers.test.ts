import { describe, it, expect, beforeEach } from 'vitest';
import { getProviderChain, resetProviderClients } from '@/lib/llm/providers';
import { LLMError } from '@/lib/llm/errors';

describe('provider chain resolution', () => {
  beforeEach(() => {
    resetProviderClients();
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.GROQ_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.MISTRAL_API_KEY;
    delete process.env.LLM_PROVIDER_CHAIN;
    delete process.env.GEMINI_MODEL;
    delete process.env.GEMMA_MODEL;
    delete process.env.OPENAI_MODEL;
    delete process.env.GROQ_MODEL;
    delete process.env.OPENROUTER_MODEL;
    delete process.env.MISTRAL_MODEL;
    delete process.env.GEMMA_STRUCTURED_MODE;
  });

  it('drops providers whose API key is not configured', () => {
    process.env.GEMINI_API_KEY = 'g-key';

    const chain = getProviderChain();

    expect(chain.map((c) => c.id)).toEqual(['gemma', 'gemini']);
  });

  it('keeps an OpenAI-only install working untouched', () => {
    process.env.OPENAI_API_KEY = 'o-key';

    const chain = getProviderChain();

    expect(chain.map((c) => c.id)).toEqual(['openai']);
    expect(chain[0].model).toBe('gpt-4o-mini');
    expect(chain[0].baseURL).toBeUndefined();
  });

  it('leads with gemma, the provider with real free quota, then gemini then openai', () => {
    process.env.GEMINI_API_KEY = 'g-key';
    process.env.OPENAI_API_KEY = 'o-key';

    expect(getProviderChain().map((c) => `${c.id}/${c.model}`)).toEqual([
      'gemma/gemma-4-31b-it',
      'gemini/gemini-3.7-flash',
      'openai/gpt-4o-mini',
    ]);
  });

  it('honours an explicit chain order', () => {
    process.env.GEMINI_API_KEY = 'g-key';
    process.env.OPENAI_API_KEY = 'o-key';
    process.env.LLM_PROVIDER_CHAIN = 'openai, gemma';

    expect(getProviderChain().map((c) => c.id)).toEqual(['openai', 'gemma']);
  });

  it('supports explicit model targeting syntax like gemini/gemini-2.5-flash', () => {
    process.env.GEMINI_API_KEY = 'g-key';
    process.env.LLM_PROVIDER_CHAIN = 'gemini/gemini-2.5-flash, gemini/gemini-2.0-flash, gemma';

    const chain = getProviderChain();
    expect(chain.map((c) => `${c.id}/${c.model}`)).toEqual([
      'gemini/gemini-2.5-flash',
      'gemini/gemini-2.0-flash',
      'gemma/gemma-4-31b-it',
    ]);
  });

  it('supports Groq, OpenRouter, and Mistral providers', () => {
    process.env.GROQ_API_KEY = 'groq-key';
    process.env.OPENROUTER_API_KEY = 'or-key';
    process.env.MISTRAL_API_KEY = 'mis-key';
    process.env.LLM_PROVIDER_CHAIN = 'groq, openrouter, mistral';

    const chain = getProviderChain();
    expect(chain.map((c) => `${c.id}/${c.model}`)).toEqual([
      'groq/llama-3.3-70b-versatile',
      'openrouter/google/gemini-2.0-flash-lite:free',
      'mistral/mistral-small-latest',
    ]);
  });

  it('ignores unknown ids and dedupes repeats', () => {
    process.env.GEMINI_API_KEY = 'g-key';
    process.env.LLM_PROVIDER_CHAIN = 'gemini,claude,gemini,gemma';

    expect(getProviderChain().map((c) => c.id)).toEqual(['gemini', 'gemma']);
  });

  it('reads model overrides at call time, not import time', () => {
    process.env.GEMINI_API_KEY = 'g-key';
    process.env.GEMINI_MODEL = 'gemini-flash-latest';
    process.env.LLM_PROVIDER_CHAIN = 'gemini';

    expect(getProviderChain()[0].model).toBe('gemini-flash-latest');
  });

  it('starts gemma one rung down the ladder, overridable by env', () => {
    process.env.GEMINI_API_KEY = 'g-key';
    process.env.LLM_PROVIDER_CHAIN = 'gemma';
    expect(getProviderChain()[0].structuredMode).toBe('json_object');

    process.env.GEMMA_STRUCTURED_MODE = 'strict';
    expect(getProviderChain()[0].structuredMode).toBe('strict');
  });

  it('throws LLM_NOT_CONFIGURED when no key is set at all', () => {
    expect(() => getProviderChain()).toThrow(LLMError);
    try {
      getProviderChain();
    } catch (error) {
      expect((error as LLMError).code).toBe('LLM_NOT_CONFIGURED');
      expect((error as LLMError).message).toMatch(/GEMINI_API_KEY/);
    }
  });
});
