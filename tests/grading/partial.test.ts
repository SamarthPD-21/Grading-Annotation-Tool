import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/llm/client', () => ({ callGradingModel: vi.fn() }));
vi.mock('@/lib/pdf/extract', () => ({ extractTextWithPositions: vi.fn() }));
vi.mock('@/lib/llm/vision', () => ({ transcribeAnswerPdf: vi.fn() }));

import { runPipeline, result } from '../helpers/pipeline';

beforeEach(() => vi.clearAllMocks());

describe('Test Category 2: Partially Correct Answer', () => {
  const partial = {
    rubricResults: [
      result('r1', 'CORRECT', 4, {
        evidence: { text: 'Light energy is absorbed by chlorophyll', page: 1 },
        feedback: 'Accurate explanation.',
        confidence: 0.96,
      }),
      // Half marks, low confidence — the case a marker most needs surfaced.
      result('r2', 'PARTIAL', 1, {
        evidence: { text: 'thylakoid membrane', page: 1 },
        feedback: 'Location named but not linked to the reaction.',
        correction: 'State that the light reactions happen in the thylakoid membrane.',
        confidence: 0.45,
      }),
      result('r3', 'MISSING', 0, { feedback: 'No products mentioned.', confidence: 0.9 }),
    ],
  };

  it('awards proportional marks rather than all-or-nothing', async () => {
    const out = await runPipeline(partial);

    expect(out.totalMarks).toBe(5);
    expect(out.maxMarks).toBe(10);
    expect(out.results.map((r) => r.status)).toEqual(['CORRECT', 'PARTIAL', 'MISSING']);
  });

  it('flags the low-confidence point for human review', async () => {
    const out = await runPipeline(partial);

    const r2 = out.results.find((r) => r.rubricId === 'r2');
    expect(r2?.humanReview).toBe(true);
    // Confident points are not swept up in the flag.
    expect(out.results.find((r) => r.rubricId === 'r1')?.humanReview).toBe(false);
  });

  it('carries a correction for the point that lost marks', async () => {
    const out = await runPipeline(partial);

    expect(out.results.find((r) => r.rubricId === 'r2')?.correction).toMatch(/thylakoid/i);
  });
});
