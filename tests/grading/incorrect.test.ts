import { describe, it, expect } from 'vitest';
import { validateGradingResult } from '@/lib/grading/validate';
import { calculateTotal } from '@/lib/grading/scoring';
import rubric from '../fixtures/sample-rubric.json';

describe('Test Category 3: Incorrect Answer', () => {
  it('should award 0 marks for incorrect statements and provide corrections', () => {
    const modelOutput = {
      rubricResults: [
        {
          rubricId: 'r1',
          status: 'INCORRECT' as const,
          marksAwarded: 0.0,
          evidence: { text: 'Photosynthesis is performed in mitochondria', page: 1 },
          feedback: 'Incorrect organelle stated',
          correction: 'Photosynthesis occurs in chloroplasts',
          confidence: 0.99,
          humanReview: false,
        },
        {
          rubricId: 'r2',
          status: 'INCORRECT' as const,
          marksAwarded: 0.0,
          evidence: { text: 'Occurs in cell wall', page: 1 },
          feedback: 'Incorrect membrane',
          correction: 'Occurs in thylakoid membrane',
          confidence: 0.95,
          humanReview: false,
        },
        {
          rubricId: 'r3',
          status: 'INCORRECT' as const,
          marksAwarded: 0.0,
          evidence: { text: 'Produces glucose directly in light step', page: 1 },
          feedback: 'Glucose is synthesized in Calvin cycle',
          correction: 'Light reaction yields ATP and NADPH',
          confidence: 0.92,
          humanReview: false,
        },
      ],
    };

    const { total } = validateGradingResult(modelOutput, rubric);
    expect(total).toBe(0.0);
    expect(calculateTotal(modelOutput.rubricResults)).toBe(0.0);
  });
});
