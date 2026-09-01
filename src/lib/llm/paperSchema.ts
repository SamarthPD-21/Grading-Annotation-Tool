import { z } from 'zod';

/**
 * Shape of a question paper + marking rubric extracted from the uploaded PDFs.
 * `expected` is the model answer for that rubric point, and is what the grader compares
 * the student's words against.
 */
export const PaperStructureSchema = z.object({
  questions: z.array(
    z.object({
      number: z.number().int().positive(),
      text: z.string(),
      maxMarks: z.number(),
      rubricPoints: z.array(
        z.object({
          description: z.string(),
          maxMarks: z.number(),
          expected: z.string().nullable(),
        })
      ),
    })
  ),
});

export type PaperStructure = z.infer<typeof PaperStructureSchema>;
