import { describe, it, expect } from 'vitest';
import { GradingResultSchema } from '@/lib/llm/schema';

describe('Test Category 6: Malformed Model Output', () => {
  it('should reject malformed JSON model responses via Zod firewall', () => {
    const malformedJson = {
      rubricResults: [
        {
          rubricId: 'r1',
          status: 'INVALID_STATUS_ENUM', // Bad enum
          marksAwarded: 'five', // String instead of number
          confidence: 2.5, // > 1.0 limit
        },
      ],
    };

    const parseResult = GradingResultSchema.safeParse(malformedJson);
    expect(parseResult.success).toBe(false);
  });
});
