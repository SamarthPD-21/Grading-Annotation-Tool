import { PDFDocument, PDFFont, PDFPage, RGB, rgb, StandardFonts } from 'pdf-lib';
import fs from 'fs';
import { getGeneratedFilePath } from '@/lib/storage/files';

export interface AnnotationItem {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'HIGHLIGHT' | 'BOX' | 'COMMENT';
  /** One rect per line of the quote; falls back to the single x/y/width/height box. */
  rects?: { x: number; y: number; width: number; height: number }[] | null;
  /** Rubric status, so the box is coloured the same way the on-screen overlay is. */
  status?: string | null;
  label?: string | null;
  comment?: string | null;
  correction?: string | null;
}

export interface MarkSummaryPoint {
  label: string;
  description: string;
  /** The marking scheme's model answer for this point. */
  expected?: string | null;
  status: string;
  marksAwarded: number;
  maxMarks: number;
  /** The student's own words that the mark was based on. */
  evidence?: string | null;
  feedback?: string | null;
  correction?: string | null;
  confidence?: number | null;
  humanReview?: boolean;
}

export interface MarkSummaryQuestion {
  number: number;
  text: string;
  earned: number;
  max: number;
  points: MarkSummaryPoint[];
}

export interface MarkSummary {
  paperName: string;
  submissionId: string;
  totalMarks: number;
  maxMarks: number;
  model?: string | null;
  gradedAt?: Date | null;
  needsReview: boolean;
  questions: MarkSummaryQuestion[];
}

const COLORS: Record<string, RGB> = {
  CORRECT: rgb(0.13, 0.55, 0.29),
  PARTIAL: rgb(0.78, 0.55, 0.04),
  INCORRECT: rgb(0.8, 0.17, 0.17),
  MISSING: rgb(0.42, 0.45, 0.5),
};

const INK = rgb(0.09, 0.11, 0.15);
const MUTED = rgb(0.42, 0.45, 0.5);
const RULE = rgb(0.85, 0.87, 0.9);
const PANEL = rgb(0.96, 0.97, 0.98);

const MARGIN = 48;

function colorFor(status?: string | null): RGB {
  return COLORS[status ?? ''] ?? rgb(0.2, 0.35, 0.85);
}

/** Greedy word wrap measured in the real font, so text never runs off the page. */
function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';

  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line ? line + ' ' + word : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);

    // A single word wider than the line is hard-broken rather than left to overflow.
    if (font.widthOfTextAtSize(word, size) > maxWidth) {
      let chunk = '';
      for (const ch of word) {
        if (font.widthOfTextAtSize(chunk + ch, size) > maxWidth) {
          lines.push(chunk);
          chunk = ch;
        } else {
          chunk += ch;
        }
      }
      line = chunk;
    } else {
      line = word;
    }
  }

  if (line) lines.push(line);
  return lines;
}

/** pdf-lib's standard fonts are WinAnsi-only, and student text often is not. */
function toWinAnsi(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/₹/g, 'Rs.')
    .replace(/[^\x20-\xFF]/g, '?');
}

function drawAnnotation(page: PDFPage, annot: AnnotationItem, font: PDFFont, bold: PDFFont): void {
  const { width: pageWidth, height: pageHeight } = page.getSize();
  const color = colorFor(annot.status);

  // Draw one rect per line of the quote. A single union box spans the gaps between lines,
  // covering unrelated content and colliding with neighbouring quotes.
  const boxes =
    annot.rects && annot.rects.length > 0
      ? annot.rects
      : [{ x: annot.x, y: annot.y, width: annot.width, height: annot.height }];

  for (const box of boxes) {
    // Stored coordinates use a top-left origin; PDF space is bottom-left.
    const boxY = pageHeight - box.y - box.height;

    if (annot.type === 'HIGHLIGHT') {
      page.drawRectangle({
        x: box.x,
        y: boxY,
        width: box.width,
        height: box.height,
        color,
        opacity: 0.18,
        borderColor: color,
        borderWidth: 1,
      });
    } else {
      // BOX and COMMENT both get an outline. COMMENT previously drew nothing at all,
      // leaving its correction floating with no indication of what it referred to.
      page.drawRectangle({
        x: box.x,
        y: boxY,
        width: box.width,
        height: box.height,
        borderColor: color,
        borderWidth: 1.5,
        opacity: 0,
      });
    }
  }

  // Only a marker goes on the page — "1.2" ties the box to that rubric point in the report.
  // The feedback and correction used to be written beside every box, which buried the
  // student's own work under marker commentary; they live in the report instead.
  if (!annot.label) return;

  const first = boxes[0];
  const markerY = pageHeight - first.y - first.height;
  const size = 7.5;
  const textWidth = bold.widthOfTextAtSize(toWinAnsi(annot.label), size);
  const chipW = textWidth + 7;
  const chipH = size + 4;

  // Sit in the left margin where there is room, otherwise just above the line. Either way
  // the marker never covers what the student wrote.
  const inMargin = first.x - chipW - 3 >= 2;
  const chipX = inMargin ? first.x - chipW - 3 : Math.min(first.x, pageWidth - chipW - 2);
  const chipY = inMargin
    ? markerY + (first.height - chipH) / 2
    : Math.min(markerY + first.height + 1.5, pageHeight - chipH - 2);

  page.drawRectangle({
    x: chipX,
    y: chipY,
    width: chipW,
    height: chipH,
    color,
    opacity: 0.9,
  });
  page.drawText(toWinAnsi(annot.label), {
    x: chipX + 3.5,
    y: chipY + 3,
    size,
    font: bold,
    color: rgb(1, 1, 1),
  });
}

/** Minimal flowing-text cursor with automatic page breaks. */
class Report {
  private page: PDFPage;
  private y: number;
  readonly width: number;

  constructor(
    private doc: PDFDocument,
    private font: PDFFont,
    private bold: PDFFont
  ) {
    this.page = doc.addPage();
    const { width, height } = this.page.getSize();
    this.width = width;
    this.y = height - MARGIN;
  }

  get contentWidth() {
    return this.width - MARGIN * 2;
  }

  get cursor() {
    return this.y;
  }

  current() {
    return this.page;
  }

  break() {
    this.page = this.doc.addPage();
    this.y = this.page.getSize().height - MARGIN;
  }

  need(space: number) {
    if (this.y - space < MARGIN) this.break();
  }

  gap(amount: number) {
    this.y -= amount;
  }

  /** Wrapped paragraph. `indent` shifts both the left edge and the wrap width. */
  text(
    content: string,
    opts: {
      size?: number;
      bold?: boolean;
      color?: RGB;
      indent?: number;
      gap?: number;
      maxLines?: number;
    } = {}
  ) {
    const size = opts.size ?? 9;
    const font = opts.bold ? this.bold : this.font;
    const indent = opts.indent ?? 0;
    let lines = wrapText(toWinAnsi(content), font, size, this.contentWidth - indent);
    if (opts.maxLines && lines.length > opts.maxLines) {
      lines = lines.slice(0, opts.maxLines);
      lines[lines.length - 1] += ' ...';
    }

    for (const line of lines) {
      this.need(size + 4);
      this.page.drawText(line, {
        x: MARGIN + indent,
        y: this.y,
        size,
        font,
        color: opts.color ?? INK,
      });
      this.y -= size + 3;
    }
    this.y -= opts.gap ?? 0;
  }

  /** A label/value pair on one flowing block, e.g. "Model answer  <text>". */
  labelled(label: string, value: string, color: RGB, indent: number) {
    this.need(24);
    this.page.drawText(toWinAnsi(label), {
      x: MARGIN + indent,
      y: this.y,
      size: 7,
      font: this.bold,
      color,
    });
    this.y -= 10;
    this.text(value, { size: 8.5, color: MUTED, indent: indent + 8, gap: 3 });
  }

  rule(color = RULE) {
    this.need(10);
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: this.width - MARGIN, y: this.y },
      thickness: 0.6,
      color,
    });
    this.y -= 10;
  }

  panel(height: number, color = PANEL) {
    this.need(height + 6);
    this.page.drawRectangle({
      x: MARGIN - 8,
      y: this.y - height + 12,
      width: this.contentWidth + 16,
      height,
      color,
    });
  }

  chip(text: string, color: RGB, indent: number) {
    this.need(16);
    const size = 7.5;
    const w = this.bold.widthOfTextAtSize(text, size) + 10;
    this.page.drawRectangle({
      x: MARGIN + indent,
      y: this.y - 2.5,
      width: w,
      height: 12,
      color,
      opacity: 0.14,
      borderColor: color,
      borderWidth: 0.6,
    });
    this.page.drawText(text, {
      x: MARGIN + indent + 5,
      y: this.y + 0.5,
      size,
      font: this.bold,
      color,
    });
    return w;
  }

  inlineRight(text: string, color: RGB, size = 9) {
    const w = this.bold.widthOfTextAtSize(text, size);
    this.page.drawText(text, {
      x: this.width - MARGIN - w,
      y: this.y,
      size,
      font: this.bold,
      color,
    });
  }
}

/**
 * A teacher-facing marking report: the score, and for every rubric point what the scheme
 * expected, what the student actually wrote, and why the mark was awarded.
 */
function drawSummaryPages(
  pdfDoc: PDFDocument,
  summary: MarkSummary,
  font: PDFFont,
  bold: PDFFont
): void {
  const r = new Report(pdfDoc, font, bold);
  const pct = summary.maxMarks > 0 ? (summary.totalMarks / summary.maxMarks) * 100 : 0;

  r.text('Grading Report', { size: 20, bold: true, gap: 2 });
  r.text(summary.paperName, { size: 10.5, color: MUTED, gap: 1 });
  r.text('Submission ' + summary.submissionId, { size: 7.5, color: MUTED, gap: 10 });

  // Score band
  r.panel(30);
  r.text(
    summary.totalMarks + ' / ' + summary.maxMarks + '   (' + pct.toFixed(1) + '%)',
    { size: 17, bold: true, gap: 4 }
  );

  if (summary.needsReview) {
    r.text('Flagged for human review - confirm these marks before releasing them.', {
      size: 8.5,
      bold: true,
      color: COLORS.PARTIAL,
      gap: 4,
    });
  }
  r.rule();

  for (const q of summary.questions) {
    r.need(70);
    r.text('Question ' + q.number, { size: 12, bold: true, gap: 0 });
    // Drawn after the heading so it sits on the same baseline as the heading text.
    r.gap(14);
    r.inlineRight(q.earned + ' / ' + q.max, INK, 11);
    r.gap(-14);

    r.text(q.text, { size: 8.5, color: MUTED, gap: 6, maxLines: 4 });

    for (const p of q.points) {
      r.need(60);
      const color = colorFor(p.status);

      const chipWidth = r.chip(p.status, color, 0);
      r.inlineRight(p.marksAwarded + ' / ' + p.maxMarks, color, 9);
      r.gap(16);

      r.text(p.label + '  ' + p.description, { size: 9, bold: true, indent: 0, gap: 4 });

      if (p.expected) {
        r.labelled('MODEL ANSWER', p.expected, MUTED, 8);
      }
      if (p.evidence) {
        r.labelled('STUDENT WROTE', '"' + p.evidence + '"', MUTED, 8);
      }
      if (p.feedback) {
        r.labelled('WHY THIS MARK', p.feedback, color, 8);
      }
      if (p.correction) {
        r.labelled('CORRECTION', p.correction, COLORS.INCORRECT, 8);
      }
      if (!p.expected && !p.evidence && !p.feedback && !p.correction) {
        r.text('No evidence was located for this point.', {
          size: 8,
          color: MUTED,
          indent: 8,
          gap: 3,
        });
      }

      // Silence an unused-value warning while keeping chip()'s width contract meaningful.
      void chipWidth;
      r.gap(6);
    }

    r.rule();
  }

  const provenance = [
    summary.model ? 'Graded by ' + summary.model : null,
    summary.gradedAt ? summary.gradedAt.toISOString() : null,
  ]
    .filter(Boolean)
    .join('  -  ');

  if (provenance) {
    r.text(provenance, { size: 7.5, color: MUTED });
  }
}

/**
 * Writes an annotated COPY. The original upload is only ever read — see README §2E.
 */
export async function generateAnnotatedPdf(
  originalPdfPath: string,
  submissionId: string,
  annotations: AnnotationItem[],
  summary?: MarkSummary | null
): Promise<string> {
  const originalBytes = await fs.promises.readFile(originalPdfPath);
  const pdfDoc = await PDFDocument.load(originalBytes);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pages = pdfDoc.getPages();

  for (const annot of annotations) {
    const pageIndex = Math.max(0, Math.min(annot.page - 1, pages.length - 1));
    drawAnnotation(pages[pageIndex], annot, font, bold);
  }

  if (summary) {
    drawSummaryPages(pdfDoc, summary, font, bold);
  }

  // Object streams make pdf.js (which this app also uses to render the viewer) reject the
  // cross-reference table, so write the more conservative plain form.
  const modifiedBytes = await pdfDoc.save({ useObjectStreams: false });
  const outputPath = getGeneratedFilePath(submissionId);
  await fs.promises.writeFile(outputPath, modifiedBytes);
  return outputPath;
}
