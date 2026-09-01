import { RubricResultInput } from '@/types/grading';

export function calculateTotal(rubricResults: RubricResultInput[]): number {
  return rubricResults.reduce((sum, r) => sum + r.marksAwarded, 0);
}
