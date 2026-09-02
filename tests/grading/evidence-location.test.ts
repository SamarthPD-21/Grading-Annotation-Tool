import { describe, it, expect } from 'vitest';
import { findEvidence } from '@/lib/pdf/coordinates';
import { TextItem } from '@/types/pdf';

const items: TextItem[] = [
  { text: 'Photosynthesis', page: 1, x: 72, y: 120, width: 90, height: 12 },
  { text: 'converts', page: 1, x: 166, y: 120, width: 50, height: 12 },
  { text: 'light', page: 1, x: 220, y: 120, width: 28, height: 12 },
];

const pages = [{ pageNumber: 1, items }];

describe('findEvidence', () => {
  it('returns a bbox spanning every matched text item', () => {
    const located = findEvidence('Photosynthesis converts light', pages);

    expect(located).not.toBeNull();
    expect(located!.page).toBe(1);
    expect(located!.bbox.x).toBe(72);
    expect(located!.bbox.y).toBe(120);
    // Spans from the first item's left edge to the last item's right edge.
    expect(located!.bbox.width).toBe(220 + 28 - 72);
  });

  it('returns null when the quote cannot be located, rather than a guessed box', () => {
    // A fixed fallback rectangle points the marker at text the model never cited, which
    // reads as a confident claim about the wrong part of the page.
    expect(findEvidence('a sentence that is nowhere in the document', pages)).toBeNull();
  });

  it('returns null for empty or missing evidence', () => {
    expect(findEvidence(null, pages)).toBeNull();
    expect(findEvidence('   ', pages)).toBeNull();
    expect(findEvidence('anything', [])).toBeNull();
  });
});

describe('a wrapped quote is drawn per line, not as one block', () => {
  const line = (words: string[], y: number): TextItem[] =>
    words.map((w, i) => ({ text: w, page: 1, x: 51 + i * 60, y, width: 55, height: 12 }));

  const threeLines = [
    {
      pageNumber: 1,
      items: [
        ...line(['The', 'ammeter', 'measures'], 100),
        ...line(['current', 'and', 'is'], 114),
        ...line(['connected', 'in', 'series'], 128),
      ],
    },
  ];

  it('returns one rect per line of the quote', () => {
    const located = findEvidence('The ammeter measures current and is connected in series', threeLines);

    expect(located!.rects).toHaveLength(3);
    expect(located!.rects.map((r) => r.y)).toEqual([100, 114, 128]);
  });

  it('keeps each rect to a single line height', () => {
    const located = findEvidence('The ammeter measures current and is connected in series', threeLines);

    // The union box is 40pt tall; no individual rect may be.
    expect(located!.bbox.height).toBeGreaterThan(30);
    expect(located!.rects.every((r) => r.height <= 14)).toBe(true);
  });

  it('leaves the gaps between lines uncovered', () => {
    const located = findEvidence('The ammeter measures current and is connected in series', threeLines);

    // This is what stops a multi-line highlight swallowing a diagram sitting between lines.
    const covered = located!.rects.reduce((sum, r) => sum + r.height, 0);
    const spanned = located!.bbox.height;
    expect(covered).toBeLessThan(spanned);
  });

  it('gives a single-line quote exactly one rect matching its box', () => {
    const located = findEvidence('The ammeter measures', threeLines);

    expect(located!.rects).toHaveLength(1);
    expect(located!.rects[0]).toEqual(located!.bbox);
  });
});
