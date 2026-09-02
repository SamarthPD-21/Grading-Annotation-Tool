import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/llm/client', () => ({ callGradingModel: vi.fn() }));
vi.mock('@/lib/pdf/extract', () => ({ extractTextWithPositions: vi.fn() }));

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
