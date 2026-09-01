import { describe, it, expect } from 'vitest';
import { validateGradingResult } from '@/lib/grading/validate';
import { calculateTotal } from '@/lib/grading/scoring';
import rubric from '../fixtures/sample-rubric.json';

describe('Test Category 1: Correct Answer', () => {
  it('should award full marks when answer satisfies all rubric points', () => {
    const modelOutput = {
      rubricResults: [
        {
          rubricId: 'r1',
          status: 'CORRECT' as const,
          marksAwarded: 4.0,
          evidence: { text: 'Light dependent reactions convert light into chemical energy', page: 1 },
          feedback: 'Accurate explanation',
          correction: null,
          confidence: 0.95,
          humanReview: false,
        },
        {
          rubricId: 'r2',
          status: 'CORRECT' as const,
          marksAwarded: 2.0,
          evidence: { text: 'Occurs in the thylakoid membrane', page: 1 },
          feedback: 'Location identified',
          correction: null,
          confidence: 0.98,
          humanReview: false,
        },
        {
          rubricId: 'r3',
          status: 'CORRECT' as const,
          marksAwarded: 4.0,
          evidence: { text: 'Produces ATP and NADPH', page: 1 },
          feedback: 'Correct products identified',
          correction: null,
          confidence: 0.96,
          humanReview: false,
        },
      ],
    };

    const { total, maxMarks } = validateGradingResult(modelOutput, rubric);
    const calculatedTotal = calculateTotal(modelOutput.rubricResults);

    expect(total).toBe(10.0);
    expect(maxMarks).toBe(10.0);
    expect(calculatedTotal).toBe(10.0);
    expect(total).toBeLessThanOrEqual(maxMarks);
  });
});
