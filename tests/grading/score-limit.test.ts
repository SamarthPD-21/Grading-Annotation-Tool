import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/llm/client', () => ({ callGradingModel: vi.fn() }));
vi.mock('@/lib/pdf/extract', () => ({ extractTextWithPositions: vi.fn() }));
vi.mock('@/lib/llm/vision', () => ({ transcribeAnswerPdf: vi.fn() }));

beforeEach(() => vi.clearAllMocks());
import { validateGradingResult } from '@/lib/grading/validate';
import rubric from '../fixtures/sample-rubric.json';

describe('Test Category 8: Score Limits & Overflow', () => {
  it('should throw INVALID_MARKS when awarded marks exceed allowed bounds for rubric item', () => {
    const overflowItemResult = {
      rubricResults: [
        {
          rubricId: 'r1',
          status: 'CORRECT' as const,
          marksAwarded: 99.0, // Exceeds maxMarks = 4.0
          evidence: null,
          feedback: null,
          correction: null,
          confidence: 1.0,
          humanReview: false,
        },
      ],
    };

    expect(() => validateGradingResult(overflowItemResult, rubric)).toThrow('INVALID_MARKS');
  });

  it('should throw UNKNOWN_RUBRIC_ID when rubric ID is unmapped', () => {
    const unknownRubricResult = {
      rubricResults: [
        {
          rubricId: 'r_unknown_xyz',
          status: 'CORRECT' as const,
          marksAwarded: 1.0,
          evidence: null,
          feedback: null,
          correction: null,
          confidence: 1.0,
          humanReview: false,
        },
      ],
    };

    expect(() => validateGradingResult(unknownRubricResult, rubric)).toThrow('UNKNOWN_RUBRIC_ID');
  });
});

describe('Test Category 8b: Over-limit marks never reach a stored score', () => {
  it('refuses the whole run rather than emitting a score above the maximum', async () => {
    // End-to-end through processGradingPipeline: the firewall must stop this before any
    // marks are returned, so an over-max total can never be persisted or shown.
    const { runPipeline, result } = await import('../helpers/pipeline');

    await expect(
      runPipeline({
        rubricResults: [
          result('r1', 'CORRECT', 4),
          result('r2', 'CORRECT', 99), // max is 2
          result('r3', 'CORRECT', 4),
        ],
      })
    ).rejects.toThrow('INVALID_MARKS');
  });

  it('accepts marks that sit exactly on the boundary', async () => {
    const { runPipeline, result } = await import('../helpers/pipeline');

    const out = await runPipeline({
      rubricResults: [
        result('r1', 'CORRECT', 4),
        result('r2', 'CORRECT', 2),
        result('r3', 'CORRECT', 4),
      ],
    });

    expect(out.totalMarks).toBe(10);
    expect(out.totalMarks).toBe(out.maxMarks);
  });

  it('rejects negative marks as firmly as excessive ones', async () => {
    const { runPipeline, result } = await import('../helpers/pipeline');

    await expect(
      runPipeline({ rubricResults: [result('r1', 'INCORRECT', -1)] })
    ).rejects.toThrow('INVALID_MARKS');
  });
});
