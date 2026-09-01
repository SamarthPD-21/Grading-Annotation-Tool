import { RubricResultInput } from '@/types/grading';

export function determineReviewNeeded(result: RubricResultInput): boolean {
  if (result.humanReview) {
    return true;
  }
  if (result.confidence < 0.7) {
    return true;
  }
  if (!result.evidence || !result.evidence.text) {
    return true;
  }
  if (result.status === 'PARTIAL') {
    return true;
  }
  return false;
}
