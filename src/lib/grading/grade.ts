import { callGradingModel } from '@/lib/llm/client';
import { validateGradingResult } from './validate';
import { calculateTotal } from './scoring';
import { determineReviewNeeded } from './confidence';
import { findEvidence } from '@/lib/pdf/coordinates';
import { extractTextWithPositions } from '@/lib/pdf/extract';
import { PROMPT_VERSION, ENGINE_VERSION } from '@/lib/llm/prompt';
import { RubricResultInput } from '@/types/grading';
import { EvidenceLocation } from '@/types/pdf';

export interface ProcessedRubricResult extends RubricResultInput {
  evidenceLocation: EvidenceLocation | null;
}

export async function processGradingPipeline(params: {
  submissionId: string;
  studentFilePath: string;
  questions: {
    number: number;
    text: string;
    rubricPoints: {
      id: string;
      description: string;
      maxMarks: number;
      expected: string | null;
    }[];
  }[];
}) {
  // 1. Extract text and coordinates from student answer PDF
  const extraction = await extractTextWithPositions(params.studentFilePath);
  const studentAnswerText = extraction.fullText || 'No extractable text found in student submission.';

  // 2. Map rubric points across questions
  const allRubricPoints = params.questions.flatMap((q) =>
    q.rubricPoints.map((rp) => ({
      id: rp.id,
      questionNumber: q.number,
      questionText: q.text,
      description: rp.description,
      maxMarks: rp.maxMarks,
      expected: rp.expected,
    }))
  );

  // 3. Call LLM for structured analysis
  const call = await callGradingModel({
    questionText: params.questions.map((q) => `Q${q.number}: ${q.text}`).join('\n'),
    rubric: allRubricPoints,
    studentAnswerText,
  });
  const rawModelOutput = call.result;

  // 4. Schema & Business Validation Firewall
  const validationPoints = allRubricPoints.map((rp) => ({
    id: rp.id,
    maxMarks: rp.maxMarks,
  }));
  const { total, maxMarks } = validateGradingResult(rawModelOutput, validationPoints);

  // 5. Deterministic score calculation
  const calculatedTotal = calculateTotal(rawModelOutput.rubricResults);

  // 6. Locate evidence coordinates on PDF text
  const pagesTextItems = extraction.pages.map((p) => ({
    pageNumber: p.pageNumber,
    items: p.items,
  }));

  const processedResults: ProcessedRubricResult[] = rawModelOutput.rubricResults.map((result) => {
    const evidenceLoc = findEvidence(result.evidence?.text, pagesTextItems);
    const reviewNeeded = determineReviewNeeded(result);

    return {
      ...result,
      // A paper graded by a fallback model always reaches a human: the primary model was
      // unavailable, so nobody chose this one for its grading quality.
      humanReview: reviewNeeded || call.fallbackUsed,
      evidenceLocation: evidenceLoc,
    };
  });

  return {
    totalMarks: calculatedTotal,
    maxMarks,
    modelUsed: call.model,
    providerUsed: call.provider,
    fallbackUsed: call.fallbackUsed,
    // The degraded rungs send a materially different system prompt, so provenance says so.
    promptVersion: call.structuredMode === 'strict' ? PROMPT_VERSION : `${PROMPT_VERSION}-json`,
    engineVersion: ENGINE_VERSION,
    results: processedResults,
  };
}
