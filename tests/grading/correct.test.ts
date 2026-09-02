import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/llm/client', () => ({ callGradingModel: vi.fn() }));
vi.mock('@/lib/pdf/extract', () => ({ extractTextWithPositions: vi.fn() }));
vi.mock('@/lib/llm/vision', () => ({ transcribeAnswerPdf: vi.fn() }));

import { runPipeline, result, QUESTIONS } from '../helpers/pipeline';

beforeEach(() => vi.clearAllMocks());

describe('Test Category 1: Fully Correct Answer', () => {
  const allCorrect = {
    rubricResults: [
      result('r1', 'CORRECT', 4, {
        evidence: { text: 'Light energy is absorbed by chlorophyll', page: 1 },
        feedback: 'Accurately explains the light dependent reactions.',
        confidence: 0.98,
      }),
      result('r2', 'CORRECT', 2, {
        evidence: { text: 'occurs in the thylakoid membrane', page: 1 },
        feedback: 'Correct location.',
        confidence: 0.99,
      }),
      result('r3', 'CORRECT', 4, {
        evidence: { text: 'produce ATP and NADPH', page: 1 },
        feedback: 'Both products named.',
        confidence: 0.97,
      }),
    ],
  };

  it('awards full marks through the real pipeline', async () => {
    const out = await runPipeline(allCorrect);

    expect(out.totalMarks).toBe(10);
    expect(out.maxMarks).toBe(10);
    expect(out.results).toHaveLength(3);
    expect(out.results.every((r) => r.status === 'CORRECT')).toBe(true);
  });

  it('never exceeds the marks available', async () => {
    const out = await runPipeline(allCorrect);

    expect(out.totalMarks).toBeLessThanOrEqual(out.maxMarks);
    // The total is the sum of the rubric points, not a number the model chose.
    const summed = out.results.reduce((s, r) => s + r.marksAwarded, 0);
    expect(out.totalMarks).toBe(summed);
    expect(out.maxMarks).toBe(QUESTIONS[0].rubricPoints.reduce((s, p) => s + p.maxMarks, 0));
  });

  it('does not flag a confident full-marks run for review', async () => {
    const out = await runPipeline(allCorrect);

    expect(out.results.some((r) => r.humanReview)).toBe(false);
  });

  it('locates each quote on the page so the marks carry evidence', async () => {
    const out = await runPipeline(allCorrect);

    expect(out.results.every((r) => r.evidenceLocation !== null)).toBe(true);
    expect(out.results[0].evidenceLocation?.page).toBe(1);
    expect(out.results[0].evidenceLocation?.bbox.width).toBeGreaterThan(0);
  });
});
