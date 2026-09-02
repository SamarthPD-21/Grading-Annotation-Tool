import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/llm/client', () => ({ callGradingModel: vi.fn() }));
vi.mock('@/lib/pdf/extract', () => ({ extractTextWithPositions: vi.fn() }));
vi.mock('@/lib/llm/vision', () => ({ transcribeAnswerPdf: vi.fn() }));

import { runPipeline, result } from '../helpers/pipeline';

beforeEach(() => vi.clearAllMocks());

describe('Test Category 4: Blank Answer', () => {
  const nothingWritten = {
    rubricResults: [
      result('r1', 'MISSING', 0, { feedback: 'No response provided.', confidence: 1 }),
      result('r2', 'MISSING', 0, { feedback: 'No location stated.', confidence: 1 }),
      result('r3', 'MISSING', 0, { feedback: 'No products mentioned.', confidence: 1 }),
    ],
  };

  /** An empty script: the PDF opens, but there is no text on the page. */
  const blank = { sentences: [] as string[] };

  it('scores zero out of the paper maximum on an empty script', async () => {
    const out = await runPipeline(nothingWritten, blank);

    expect(out.totalMarks).toBe(0);
    // The paper maximum still stands — a blank answer is 0/10, not 0/0.
    expect(out.maxMarks).toBe(10);
  });

  it('returns a result for every rubric point, none of them skipped', async () => {
    const out = await runPipeline(nothingWritten, blank);

    expect(out.results).toHaveLength(3);
    expect(out.results.every((r) => r.status === 'MISSING')).toBe(true);
  });

  it('draws no evidence boxes when there is nothing to point at', async () => {
    const out = await runPipeline(nothingWritten, blank);

    expect(out.results.every((r) => r.evidenceLocation === null)).toBe(true);
  });

  it('records real provenance even for an empty script', async () => {
    const out = await runPipeline(nothingWritten, blank);

    expect(out.modelUsed).toBe('gemma-4-31b-it');
    expect(out.providerUsed).toBe('gemma');
  });
});

describe('Test Category 4b: A scan is read, not graded as blank', () => {
  const graded = {
    rubricResults: [
      result('r1', 'CORRECT', 4, { evidence: { text: 'converted into chemical energy', page: 1 } }),
      result('r2', 'MISSING', 0),
      result('r3', 'MISSING', 0),
    ],
  };
  /** Pixels on the page, no text layer — a photo or scan of handwriting. */
  const scan = { sentences: [] as string[], hasImages: true };

  it('transcribes the page instead of scoring it as an empty script', async () => {
    const out = await runPipeline(graded, scan);

    // Grading the empty text layer used to award zero and look like a legitimate result.
    expect(out.totalMarks).toBe(4);
    expect(out.textSource).toBe('ocr');
    expect(out.transcribedBy).toBe('gemini/gemini-2.5-flash');
  });

  it('draws no evidence boxes, because a transcription carries no coordinates', async () => {
    const out = await runPipeline(graded, scan);

    expect(out.results.every((r) => r.evidenceLocation === null)).toBe(true);
  });

  it('flags every point for review, since the words are a model reading of the page', async () => {
    const out = await runPipeline(graded, scan);

    expect(out.results.every((r) => r.humanReview)).toBe(true);
  });

  it('leaves a normal text PDF on the text layer, with boxes intact', async () => {
    const out = await runPipeline(graded);

    expect(out.textSource).toBe('pdf');
    expect(out.transcribedBy).toBeNull();
    expect(out.results.find((r) => r.rubricId === 'r1')?.evidenceLocation).not.toBeNull();
  });

  it('still treats a page with neither text nor images as a blank answer', async () => {
    const out = await runPipeline(
      { rubricResults: [result('r1', 'MISSING', 0)] },
      { sentences: [], hasImages: false }
    );

    expect(out.textSource).toBe('pdf');
    expect(out.totalMarks).toBe(0);
    expect(out.maxMarks).toBe(10);
  });
});
