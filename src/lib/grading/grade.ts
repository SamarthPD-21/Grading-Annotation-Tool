import { callGradingModel } from '@/lib/llm/client';
import { validateGradingResult } from './validate';
import { calculateTotal } from './scoring';
import { determineReviewNeeded } from './confidence';
import { findEvidence } from '@/lib/pdf/coordinates';
import { extractTextWithPositions } from '@/lib/pdf/extract';
import { transcribeAnswerPdf } from '@/lib/llm/vision';
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
  // `fullText` always carries "--- Page N ---" markers, so it is never falsy; the old
  // `|| 'No extractable text...'` guard was dead code and a scanned answer was graded on
  // the marker alone, producing a confident zero.
  const hasText = extraction.pages.some((p) => p.text.trim().length > 0);
  const hasImages = extraction.pages.some((p) => p.hasImages);

  let studentAnswerText: string;
  let textSource: 'pdf' | 'ocr' = 'pdf';
  let transcribedBy: string | null = null;

  if (hasText) {
    studentAnswerText = extraction.fullText;
  } else if (hasImages) {
    // Pixels but no text layer: a scan or a photo of handwriting. Read it with a vision
    // model rather than grading the empty text layer, which scored every point MISSING and
    // looked exactly like a legitimate zero.
    const transcription = await transcribeAnswerPdf(params.studentFilePath);
    studentAnswerText = transcription.text;
    textSource = 'ocr';
    transcribedBy = `${transcription.provider}/${transcription.model}`;
  } else {
    studentAnswerText = 'The student answer sheet is blank — no text was written.';
  }

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
    // A transcription carries no coordinates, so there is nothing to match a quote against.
    const evidenceLoc = textSource === 'ocr' ? null : findEvidence(result.evidence?.text, pagesTextItems);
    const reviewNeeded = determineReviewNeeded(result);

    return {
      ...result,
      // A paper graded by a fallback model always reaches a human: the primary model was
      // unavailable, so nobody chose this one for its grading quality.
      humanReview: reviewNeeded || call.fallbackUsed || textSource === 'ocr',
      evidenceLocation: evidenceLoc,
    };
  });

  return {
    totalMarks: calculatedTotal,
    maxMarks,
    modelUsed: call.model,
    providerUsed: call.provider,
    textSource,
    transcribedBy,
    fallbackUsed: call.fallbackUsed,
    // The degraded rungs send a materially different system prompt, so provenance says so.
    promptVersion: call.structuredMode === 'strict' ? PROMPT_VERSION : `${PROMPT_VERSION}-json`,
    engineVersion: ENGINE_VERSION,
    results: processedResults,
  };
}
