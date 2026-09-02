import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/llm/client', () => ({ callGradingModel: vi.fn() }));
vi.mock('@/lib/pdf/extract', () => ({ extractTextWithPositions: vi.fn() }));
vi.mock('@/lib/llm/vision', () => ({ transcribeAnswerPdf: vi.fn() }));

import { runPipeline, result } from '../helpers/pipeline';

beforeEach(() => vi.clearAllMocks());

describe('Test Category 3: Incorrect Answer', () => {
  const wrong = {
    rubricResults: [
      result('r1', 'INCORRECT', 0, {
        evidence: { text: 'Light energy is absorbed by chlorophyll', page: 1 },
        feedback: 'States the wrong energy conversion.',
        correction: 'Light energy is converted into chemical energy, not heat.',
        confidence: 0.92,
      }),
      result('r2', 'INCORRECT', 0, {
        evidence: { text: 'thylakoid membrane', page: 1 },
        feedback: 'Names the wrong organelle structure.',
        correction: 'The light reactions occur in the thylakoid membrane.',
        confidence: 0.9,
      }),
      result('r3', 'INCORRECT', 0, {
        feedback: 'Products are wrong.',
        correction: 'The products are ATP and NADPH.',
        confidence: 0.91,
      }),
    ],
  };

  it('awards zero without failing the run', async () => {
    const out = await runPipeline(wrong);

    expect(out.totalMarks).toBe(0);
    expect(out.maxMarks).toBe(10);
    expect(out.results).toHaveLength(3);
  });

  it('gives every wrong point an actionable correction', async () => {
    const out = await runPipeline(wrong);

    expect(out.results.every((r) => r.status === 'INCORRECT')).toBe(true);
    expect(out.results.every((r) => (r.correction ?? '').length > 0)).toBe(true);
  });

  it('still anchors its evidence on the page where the quote exists', async () => {
    const out = await runPipeline(wrong);

    // A wrong answer is still marked against what the student actually wrote.
    expect(out.results.find((r) => r.rubricId === 'r1')?.evidenceLocation).not.toBeNull();
    // A point with no quote gets no box rather than a guessed one.
    expect(out.results.find((r) => r.rubricId === 'r3')?.evidenceLocation).toBeNull();
  });
});
