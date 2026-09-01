import { LLMGradingOutput } from '@/types/grading';

export interface RubricValidationPoint {
  id: string;
  maxMarks: number;
}

export function validateGradingResult(
  result: LLMGradingOutput,
  rubricPoints: RubricValidationPoint[]
): { total: number; maxMarks: number } {
  const rubricMap = new Map(rubricPoints.map((r) => [r.id, r]));

  let total = 0;

  for (const item of result.rubricResults) {
    const rule = rubricMap.get(item.rubricId);
    if (!rule) {
      throw new Error(`UNKNOWN_RUBRIC_ID: Rubric ID ${item.rubricId} is not part of this paper`);
    }

    if (item.marksAwarded < 0 || item.marksAwarded > rule.maxMarks) {
      throw new Error(
        `INVALID_MARKS: Marks awarded (${item.marksAwarded}) for rubric ${item.rubricId} exceeds bounds [0, ${rule.maxMarks}]`
      );
    }

    total += item.marksAwarded;
  }

  const maxMarks = rubricPoints.reduce((sum, r) => sum + r.maxMarks, 0);

  if (total > maxMarks + 0.001) {
    throw new Error(`TOTAL_EXCEEDS_MAXIMUM: Calculated total (${total}) exceeds paper maximum (${maxMarks})`);
  }

  return { total, maxMarks };
}
