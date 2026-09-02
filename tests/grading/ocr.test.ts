import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/llm/client', () => ({ callGradingModel: vi.fn() }));
vi.mock('@/lib/pdf/extract', () => ({ extractTextWithPositions: vi.fn() }));
vi.mock('@/lib/llm/vision', () => ({ transcribeAnswerPdf: vi.fn() }));

import { findEvidence } from '@/lib/pdf/coordinates';
import { runPipeline, result } from '../helpers/pipeline';

beforeEach(() => vi.clearAllMocks());

describe('Test Category 5: OCR Noise & Spelling Errors', () => {
  const noisyPage = [
    {
      pageNumber: 1,
      items: [
        { text: 'Photosynthesiss', page: 1, x: 50, y: 100, width: 100, height: 15 },
        { text: 'occurs', page: 1, x: 155, y: 100, width: 50, height: 15 },
        { text: 'inn', page: 1, x: 210, y: 100, width: 20, height: 15 },
        { text: 'thylakoidd', page: 1, x: 235, y: 100, width: 80, height: 15 },
        { text: 'membrne', page: 1, x: 320, y: 100, width: 70, height: 15 },
      ],
    },
  ];

  it('locates a quote despite doubled letters and dropped vowels', () => {
    const located = findEvidence('photosynthesis occurs in thylakoid membrane', noisyPage);

    expect(located).not.toBeNull();
    expect(located?.page).toBe(1);
    // The box spans the whole misspelled phrase, not just its first word.
    expect(located?.bbox.width).toBeGreaterThan(300);
  });

  it('still refuses a quote that is genuinely absent', () => {
    // Fuzzy matching must not degrade into matching anything.
    expect(findEvidence('mitochondria produce most cellular ATP', noisyPage)).toBeNull();
  });

  it('grades and annotates an answer whose text is misspelled', async () => {
    const out = await runPipeline(
      {
        rubricResults: [
          result('r1', 'CORRECT', 4, {
            // The model quotes clean spelling; the page holds the OCR-mangled version.
            evidence: { text: 'Photosynthesis occurs in the thylakoid membrane', page: 1 },
            feedback: 'Correct despite spelling errors.',
          }),
        ],
      },
      { sentences: ['Photosynthesiss occurss inn the thylakoidd membrne of the chloroplast.'] }
    );

    expect(out.totalMarks).toBe(4);
    // Spelling errors must not cost the student their evidence box.
    expect(out.results[0].evidenceLocation).not.toBeNull();
  });
});
