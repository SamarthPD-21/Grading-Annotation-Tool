import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/llm/client', () => ({ callGradingModel: vi.fn() }));
vi.mock('@/lib/pdf/extract', () => ({ extractTextWithPositions: vi.fn() }));
vi.mock('@/lib/llm/vision', () => ({ transcribeAnswerPdf: vi.fn() }));

import { GradingResultSchema } from '@/lib/llm/schema';
import { validateGradingResult } from '@/lib/grading/validate';
import { runPipeline, result, QUESTIONS } from '../helpers/pipeline';

beforeEach(() => vi.clearAllMocks());

const POINTS = QUESTIONS[0].rubricPoints.map((p) => ({ id: p.id, maxMarks: p.maxMarks }));

describe('Test Category 6: Malformed Model Output', () => {
  it('rejects bad enums, wrong types and out-of-range confidence at the schema layer', () => {
    const parsed = GradingResultSchema.safeParse({
      rubricResults: [
        { rubricId: 'r1', status: 'INVALID_STATUS_ENUM', marksAwarded: 'five', confidence: 2.5 },
      ],
    });

    expect(parsed.success).toBe(false);
  });

  it.each([
    ['missing rubricResults', {}],
    ['rubricResults not an array', { rubricResults: {} }],
    ['null payload', null],
    ['a bare string', 'sorry, I could not grade this'],
    ['result missing required fields', { rubricResults: [{ rubricId: 'r1' }] }],
    [
      'negative confidence',
      { rubricResults: [{ ...result('r1', 'CORRECT', 1), confidence: -0.2 }] },
    ],
  ])('rejects %s', (_label, payload) => {
    expect(GradingResultSchema.safeParse(payload).success).toBe(false);
  });
});

describe('Test Category 6b: Incomplete Model Output', () => {
  it('rejects a rubric id the paper does not contain', () => {
    // A truncated or hallucinated response can name points that are not on this paper.
    const strayId = { rubricResults: [result('r_not_on_this_paper', 'CORRECT', 1)] };

    expect(() => validateGradingResult(strayId, POINTS)).toThrow('UNKNOWN_RUBRIC_ID');
  });

  it('does not invent marks for rubric points the model omitted', async () => {
    // The model answered 1 of 3 points. The run must not silently score the other two.
    const out = await runPipeline({
      rubricResults: [
        result('r1', 'CORRECT', 4, {
          evidence: { text: 'Light energy is absorbed by chlorophyll', page: 1 },
        }),
      ],
    });

    expect(out.results).toHaveLength(1);
    // Marks reflect only what was actually assessed...
    expect(out.totalMarks).toBe(4);
    // ...while the paper maximum stays the full rubric, so the shortfall is visible.
    expect(out.maxMarks).toBe(10);
    expect(out.totalMarks).toBeLessThan(out.maxMarks);
  });

  it('treats an empty result set as unassessed rather than as full marks', async () => {
    const out = await runPipeline({ rubricResults: [] });

    expect(out.results).toHaveLength(0);
    expect(out.totalMarks).toBe(0);
    expect(out.maxMarks).toBe(10);
  });
});
