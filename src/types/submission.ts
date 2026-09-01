import { SubmissionStatus, RubricStatus, AnnotationType } from '@prisma/client';

export interface SubmissionWithDetails {
  id: string;
  paperId: string;
  studentFile: string;
  status: SubmissionStatus;
  totalMarks: number | null;
  maxMarks: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
  paper: {
    id: string;
    name: string;
    questions: {
      id: string;
      number: number;
      text: string;
      maxMarks: number;
      rubricPoints: {
        id: string;
        description: string;
        maxMarks: number;
        expected: string | null;
      }[];
    }[];
  };
  gradingRuns: {
    id: string;
    attempt: number;
    totalMarks: number | null;
    maxMarks: number | null;
    status: SubmissionStatus;
    createdAt: Date;
    results: {
      id: string;
      rubricPointId: string;
      status: RubricStatus;
      marksAwarded: number;
      evidenceText: string | null;
      evidencePage: number | null;
      evidenceBBox: unknown;
      feedback: string | null;
      correction: string | null;
      confidence: number;
      humanReview: boolean;
    }[];
  }[];
  annotations: {
    id: string;
    rubricResultId: string | null;
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
    type: AnnotationType;
    comment: string | null;
    correction: string | null;
  }[];
}
