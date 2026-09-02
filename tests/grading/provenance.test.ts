import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/llm/client', () => ({ callGradingModel: vi.fn() }));
vi.mock('@/lib/pdf/extract', () => ({ extractTextWithPositions: vi.fn() }));
vi.mock('@/lib/llm/vision', () => ({ transcribeAnswerPdf: vi.fn() }));
vi.mock('@/lib/pdf/coordinates', () => ({ findEvidence: vi.fn(() => null) }));

import { processGradingPipeline } from '@/lib/grading/grade';
import { callGradingModel } from '@/lib/llm/client';
import { extractTextWithPositions } from '@/lib/pdf/extract';
import { PROMPT_VERSION } from '@/lib/llm/prompt';

const QUESTIONS = [
  {
    number: 1,
    text: 'What is photosynthesis?',
    rubricPoints: [{ id: 'rp-1', description: 'Light to chemical energy', maxMarks: 2, expected: null }],
  },
];

const MODEL_RESULT = {
  rubricResults: [
    {
      rubricId: 'rp-1',
      status: 'CORRECT' as const,
      marksAwarded: 2,
      evidence: { text: 'converts light energy', page: 1 },
      feedback: 'Correct.',
      correction: null,
      confidence: 0.95,
      humanReview: false,
    },
  ],
};

function run() {
  return processGradingPipeline({
    submissionId: 'sub-1',
    studentFilePath: '/tmp/answer.pdf',
    questions: QUESTIONS,
  });
}

beforeEach(() => {
  (extractTextWithPositions as unknown as Mock).mockResolvedValue({
    fullText: 'Photosynthesis converts light energy into chemical energy.',
    pages: [],
  });
});

describe('grading provenance', () => {
  it('records the model that actually answered, not a constant', async () => {
    vi.mocked(callGradingModel).mockResolvedValue({
      result: MODEL_RESULT,
      provider: 'gemma',
      model: 'gemma-4-31b-it',
      structuredMode: 'json_object',
      fallbackUsed: true,
      attempts: [],
    });

    const output = await run();

    expect(output.modelUsed).toBe('gemma-4-31b-it');
    expect(output.providerUsed).toBe('gemma');
    // A degraded rung sends a different system prompt, so provenance must say so.
    expect(output.promptVersion).toBe(`${PROMPT_VERSION}-json`);
  });

  it('flags every result for human review when a fallback model graded the paper', async () => {
    vi.mocked(callGradingModel).mockResolvedValue({
      result: MODEL_RESULT,
      provider: 'gemma',
      model: 'gemma-4-31b-it',
      structuredMode: 'json_object',
      fallbackUsed: true,
      attempts: [],
    });

    const output = await run();

    expect(output.fallbackUsed).toBe(true);
    expect(output.results.every((r) => r.humanReview)).toBe(true);
  });

  it('leaves the review flag alone on a confident primary-model run', async () => {
    vi.mocked(callGradingModel).mockResolvedValue({
      result: MODEL_RESULT,
      provider: 'gemini',
      model: 'gemini-3.7-flash',
      structuredMode: 'strict',
      fallbackUsed: false,
      attempts: [],
    });

    const output = await run();

    expect(output.modelUsed).toBe('gemini-3.7-flash');
    expect(output.promptVersion).toBe(PROMPT_VERSION);
    expect(output.results.some((r) => r.humanReview)).toBe(false);
  });
});
