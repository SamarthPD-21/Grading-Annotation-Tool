import { TextItem, EvidenceLocation, BoundingBox } from '@/types/pdf';

function normalizeText(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Splits matched items into one rectangle per visual line.
 *
 * Text items carry no line number, so a line break is inferred from a vertical step larger
 * than half a glyph height. Each line then gets a rect bounding only its own words.
 */
function lineRectsOf(matched: TextItem[]): BoundingBox[] {
  const sorted = [...matched].sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: TextItem[][] = [];

  for (const item of sorted) {
    const current = lines[lines.length - 1];
    const reference = current?.[0];
    const sameLine =
      reference !== undefined && Math.abs(item.y - reference.y) <= Math.max(reference.height, item.height) * 0.5;

    if (sameLine) current.push(item);
    else lines.push([item]);
  }

  return lines.map((line) => {
    let minX = line[0].x;
    let minY = line[0].y;
    let maxX = line[0].x + line[0].width;
    let maxY = line[0].y + line[0].height;

    for (const item of line) {
      minX = Math.min(minX, item.x);
      minY = Math.min(minY, item.y);
      maxX = Math.max(maxX, item.x + item.width);
      maxY = Math.max(maxY, item.y + item.height);
    }

    return {
      x: minX,
      y: minY,
      width: Math.max(MIN_W, maxX - minX),
      height: Math.max(MIN_H, maxY - minY),
    };
  });
}

/**
 * Smallest rect we will emit. Shared by the union box and the per-line rects so a
 * single-line quote produces identical geometry for both.
 */
const MIN_W = 8;
const MIN_H = 8;

/** Union rectangle over every matched text item. */
function boundsOf(matched: TextItem[]): BoundingBox {
  let minX = matched[0].x;
  let minY = matched[0].y;
  let maxX = matched[0].x + matched[0].width;
  let maxY = matched[0].y + matched[0].height;

  for (const item of matched) {
    minX = Math.min(minX, item.x);
    minY = Math.min(minY, item.y);
    maxX = Math.max(maxX, item.x + item.width);
    maxY = Math.max(maxY, item.y + item.height);
  }

  return {
    x: minX,
    y: minY,
    width: Math.max(MIN_W, maxX - minX),
    height: Math.max(MIN_H, maxY - minY),
  };
}

/**
 * The page's text as one normalized string, plus a map from each character back to the text
 * item it came from. Searching the flattened string means item boundaries stop mattering —
 * a quote can span any number of items, and one item can hold the whole quote.
 */
function flattenPage(items: TextItem[]): { text: string; owner: number[] } {
  let text = '';
  const owner: number[] = [];

  items.forEach((item, index) => {
    const norm = normalizeText(item.text);
    for (let i = 0; i < norm.length; i++) owner.push(index);
    text += norm;
  });

  return { text, owner };
}

/**
 * Sellers' algorithm: edit distance of `pattern` against the best-matching substring of
 * `text`. Returns the end offset of that substring and its distance. Tolerating edits is
 * what lets OCR noise ("thylakoidd", "membrne") still find its place on the page.
 */
function bestMatchEnd(pattern: string, text: string): { end: number; distance: number } {
  // Row 0 is all zeroes: the match may begin at any offset in the text.
  let prev = new Array<number>(text.length + 1).fill(0);
  let curr = new Array<number>(text.length + 1).fill(0);

  for (let i = 1; i <= pattern.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= text.length; j++) {
      const substitution = prev[j - 1] + (pattern[i - 1] === text[j - 1] ? 0 : 1);
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, substitution);
    }
    [prev, curr] = [curr, prev];
  }

  let end = 0;
  let distance = Infinity;
  for (let j = 0; j <= text.length; j++) {
    if (prev[j] < distance) {
      distance = prev[j];
      end = j;
    }
  }

  return { end, distance };
}

function reverse(str: string): string {
  return str.split('').reverse().join('');
}

export function findEvidence(
  evidenceText: string | null | undefined,
  pagesTextItems: { pageNumber: number; items: TextItem[] }[]
): EvidenceLocation | null {
  if (!evidenceText || !evidenceText.trim()) {
    return null;
  }

  const needle = normalizeText(evidenceText);
  if (!needle) {
    return null;
  }

  // A quote may be paraphrased or carry OCR noise, but it should still be mostly the same
  // characters. Beyond this budget we are no longer looking at the same sentence.
  const maxDistance = Math.max(2, Math.floor(needle.length * 0.25));

  for (const page of pagesTextItems) {
    const items = page.items;
    if (!items || items.length === 0) continue;

    const { text, owner } = flattenPage(items);
    if (!text) continue;

    let start: number;
    let end: number;

    const exact = text.indexOf(needle);
    if (exact !== -1) {
      start = exact;
      end = exact + needle.length;
    } else {
      const forward = bestMatchEnd(needle, text);
      if (forward.distance > maxDistance) continue;

      // Run the same search backwards from the match end to pin down where it began.
      const back = bestMatchEnd(reverse(needle), reverse(text.slice(0, forward.end)));
      start = forward.end - back.end;
      end = forward.end;
    }

    if (end <= start) continue;

    const matched: TextItem[] = [];
    let last = -1;
    for (let i = start; i < end && i < owner.length; i++) {
      if (owner[i] !== last) {
        last = owner[i];
        matched.push(items[last]);
      }
    }

    if (matched.length > 0) {
      return { page: page.pageNumber, bbox: boundsOf(matched), rects: lineRectsOf(matched) };
    }
  }

  // Evidence that cannot be located on the page gets no box. A guessed rectangle at a fixed
  // spot points the marker at text the model never cited, which is worse than no overlay:
  // the feedback still shows in the sidebar, just without a claim about where it lives.
  return null;
}
