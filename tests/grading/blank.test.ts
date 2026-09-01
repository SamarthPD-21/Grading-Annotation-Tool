import { describe, it, expect } from 'vitest';
import { validateGradingResult } from '@/lib/grading/validate';
import rubric from '../fixtures/sample-rubric.json';

describe('Test Category 4: Blank Answer', () => {
  it('should mark all points MISSING with 0 marks when student answer is blank', () => {
    const modelOutput = {
      rubricResults: [
        {
          rubricId: 'r1',
          status: 'MISSING' as const,
          marksAwarded: 0.0,
          evidence: null,
          feedback: 'No response provided for light reaction explanation',
          correction: 'Provide detailed light dependent reaction explanation',
          confidence: 1.0,
          humanReview: false,
        },
        {
          rubricId: 'r2',
          status: 'MISSING' as const,
          marksAwarded: 0.0,
          evidence: null,
          feedback: 'No location stated',
          correction: 'Thylakoid membrane',
          confidence: 1.0,
          humanReview: false,
        },
        {
          rubricId: 'r3',
          status: 'MISSING' as const,
          marksAwarded: 0.0,
          evidence: null,
          feedback: 'No products mentioned',
          correction: 'ATP and NADPH',
          confidence: 1.0,
          humanReview: false,
        },
      ],
    };

    const { total } = validateGradingResult(modelOutput, rubric);
    expect(total).toBe(0.0);
    expect(modelOutput.rubricResults.every((r) => r.status === 'MISSING')).toBe(true);
  });
});
