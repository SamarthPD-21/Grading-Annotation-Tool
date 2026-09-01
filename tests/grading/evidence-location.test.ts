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
