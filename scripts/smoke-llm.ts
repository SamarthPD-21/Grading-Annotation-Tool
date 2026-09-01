/**
 * Manual smoke test against the live provider APIs. Makes real API calls.
 *
 *   npm run smoke:llm -- --list     List models on each configured base URL
 *   npm run smoke:llm               Run the full chain against a tiny rubric
 *   npm run smoke:llm -- gemma      Force one provider, walking its whole mode ladder
 */
import OpenAI from 'openai';
import { callGradingModel, RubricPromptItem } from '../src/lib/llm/client';
import { classifyLLMError } from '../src/lib/llm/errors';
import {
  ProviderConfig,
  ProviderId,
  getClientFor,
  getProviderChain,
  getProviderConfig,
} from '../src/lib/llm/providers';

// Next.js loads .env for the app; a bare tsx script does not.
try {
  process.loadEnvFile('.env');
} catch {
  console.warn('[smoke] no .env found — relying on the ambient environment');
}

const RUBRIC: RubricPromptItem[] = [
  {
    id: 'rp-1',
    questionNumber: 1,
    questionText: 'What is photosynthesis?',
    description: 'States that plants convert light energy into chemical energy',
    maxMarks: 2,
    expected: 'Plants convert light energy into chemical energy.',
  },
  {
    id: 'rp-2',
    questionNumber: 1,
    questionText: 'What is photosynthesis?',
    description: 'Names carbon dioxide and water as the inputs',
    maxMarks: 1,
    expected: 'Carbon dioxide and water.',
  },
];

const STUDENT_ANSWER =
  'Photosynthesis is how plants turn sunlight into chemical energy stored as sugar. ' +
  'They take in carbon dioxide from the air.';

const QUESTION_TEXT = 'Q1: What is photosynthesis?';

async function listModels(config: ProviderConfig) {
  const client: OpenAI = getClientFor(config);
  const page = await client.models.list();
  const ids = page.data.map((m) => m.id);
  const present = ids.includes(config.model) || ids.includes(`models/${config.model}`);
  console.log(`\n${config.id} (${config.baseURL ?? 'api.openai.com'})`);
  console.log(`  configured model : ${config.model} ${present ? '✓ found' : '✗ NOT FOUND'}`);
  console.log(`  ${ids.length} models available`);
  const related = ids.filter((id) => /flash|gemma|gpt-4o-mini/i.test(id)).slice(0, 15);
  if (related.length) {
    console.log(`  related          : ${related.join(', ')}`);
  }
}

async function gradeWith(chainOverride?: ProviderId) {
  if (chainOverride) {
    process.env.LLM_PROVIDER_CHAIN = chainOverride;
  }

  const chain = getProviderChain();
  console.log(`\nchain: ${chain.map((c) => `${c.id}/${c.model}[${c.structuredMode}]`).join(' → ')}`);

  const startedAt = Date.now();
  const call = await callGradingModel({
    questionText: QUESTION_TEXT,
    rubric: RUBRIC,
    studentAnswerText: STUDENT_ANSWER,
  });

  console.log(`\n✓ graded by ${call.provider}/${call.model}`);
  console.log(`  structured mode : ${call.structuredMode}`);
  console.log(`  fallback used   : ${call.fallbackUsed}`);
  console.log(`  latency         : ${Date.now() - startedAt}ms`);
  if (call.attempts.length) {
    console.log('  failed attempts :');
    for (const a of call.attempts) {
      console.log(`    - ${a.provider}/${a.model}: [${a.code}] ${a.message}`);
    }
  }
  console.log(`  result          : ${JSON.stringify(call.result, null, 2)}`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--list')) {
    for (const id of ['gemini', 'gemma', 'openai'] as ProviderId[]) {
      const config = getProviderConfig(id);
      if (!process.env[config.apiKeyEnv]) {
        console.log(`\n${config.id}: skipped (${config.apiKeyEnv} not set)`);
        continue;
      }
      try {
        await listModels(config);
      } catch (error) {
        const e = classifyLLMError(error, config);
        console.log(`\n${config.id}: [${e.code}] ${e.message}`);
      }
    }
    return;
  }

  const only = args.find((a) => !a.startsWith('-')) as ProviderId | undefined;
  await gradeWith(only);
}

main().catch((error) => {
  const e = classifyLLMError(error);
  console.error(`\n✗ [${e.code}] ${e.message}`);
  if (e.attempts.length) {
    for (const a of e.attempts) {
      console.error(`    - ${a.provider}/${a.model}: [${a.code}] ${a.message}`);
    }
  }
  process.exit(1);
});
