import { describe, it, expect } from 'vitest';
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
