export type SubmissionStatus =
  | 'UPLOADED'
  | 'EXTRACTING'
  | 'READY'
  | 'GRADING'
  | 'VALIDATING'
  | 'ANNOTATING'
  | 'COMPLETED'
  | 'REVIEW_REQUIRED'
  | 'FAILED';

export type RubricStatus = 'CORRECT' | 'PARTIAL' | 'INCORRECT' | 'MISSING';

export type AnnotationType = 'HIGHLIGHT' | 'BOX' | 'COMMENT';

export interface RubricResultInput {
  rubricId: string;
  status: RubricStatus;
  marksAwarded: number;
  evidence: {
    text: string;
    page: number | null;
  } | null;
  feedback: string | null;
  correction: string | null;
  confidence: number;
  humanReview: boolean;
}

export interface LLMGradingOutput {
  rubricResults: RubricResultInput[];
}

export interface ValidatedGradingResult {
  total: number;
  maxMarks: number;
  results: RubricResultInput[];
}
