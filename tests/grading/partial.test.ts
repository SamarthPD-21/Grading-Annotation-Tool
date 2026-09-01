import { describe, it, expect } from 'vitest';
import { validateGradingResult } from '@/lib/grading/validate';
import { calculateTotal } from '@/lib/grading/scoring';
import { determineReviewNeeded } from '@/lib/grading/confidence';
import rubric from '../fixtures/sample-rubric.json';

describe('Test Category 2: Partial Answer', () => {
  it('should award proportional marks and flag partial answers for review', () => {
    const modelOutput = {
      rubricResults: [
        {
          rubricId: 'r1',
          status: 'CORRECT' as const,
          marksAwarded: 4.0,
          evidence: { text: 'Light dependent reactions convert solar energy', page: 1 },
          feedback: 'Accurate',
          correction: null,
          confidence: 0.9,
          humanReview: false,
        },
        {
          rubricId: 'r2',
          status: 'PARTIAL' as const,
          marksAwarded: 1.0,
          evidence: { text: 'Occurs inside the plant cell', page: 1 },
          feedback: 'Vague location provided',
          correction: 'Specify thylakoid membrane',
          confidence: 0.75,
          humanReview: true,
        },
        {
          rubricId: 'r3',
          status: 'MISSING' as const,
          marksAwarded: 0.0,
          evidence: null,
          feedback: 'ATP and NADPH not mentioned',
          correction: 'Describe ATP and NADPH synthesis',
          confidence: 0.95,
          humanReview: false,
        },
      ],
    };

    const { total, maxMarks } = validateGradingResult(modelOutput, rubric);
    const calculatedTotal = calculateTotal(modelOutput.rubricResults);

    expect(total).toBe(5.0);
    expect(maxMarks).toBe(10.0);
    expect(calculatedTotal).toBe(5.0);
    expect(determineReviewNeeded(modelOutput.rubricResults[1])).toBe(true);
  });
});
