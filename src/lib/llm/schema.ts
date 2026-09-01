import { z } from 'zod';

export const GradingResultSchema = z.object({
  rubricResults: z.array(
    z.object({
      rubricId: z.string(),
      status: z.enum(['CORRECT', 'PARTIAL', 'INCORRECT', 'MISSING']),
      marksAwarded: z.number(),
      evidence: z
        .object({
          text: z.string(),
          page: z.number().int().positive().nullable(),
        })
        .nullable(),
      feedback: z.string().nullable(),
      correction: z.string().nullable(),
      confidence: z.number().min(0).max(1),
      humanReview: z.boolean(),
    })
  ),
});

export type GradingResultSchemaType = z.infer<typeof GradingResultSchema>;
