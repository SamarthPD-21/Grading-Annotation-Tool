import { PDFDocument, PDFFont, PDFPage, rgb, StandardFonts } from 'pdf-lib';
import fs from 'fs';
import { getGeneratedFilePath } from '@/lib/storage/files';

export interface AnnotationItem {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'HIGHLIGHT' | 'BOX' | 'COMMENT';
  /** Rubric status, so the box is coloured the same way the on-screen overlay is. */
  status?: string | null;
  label?: string | null;
  comment?: string | null;
  correction?: string | null;
}

export interface MarkSummaryRow {
  label: string;
  description: string;
  status: string;
  marksAwarded: number;
  maxMarks: number;
  feedback?: string | null;
}

export interface MarkSummary {
  paperName: string;
  submissionId: string;
  totalMarks: number;
  maxMarks: number;
  model?: string | null;
  gradedAt?: Date | null;
  needsReview: boolean;
  rows: MarkSummaryRow[];
}

const COLORS: Record<string, ReturnType<typeof rgb>> = {
  CORRECT: rgb(0.13, 0.6, 0.3),
  PARTIAL: rgb(0.85, 0.6, 0.05),
  INCORRECT: rgb(0.85, 0.18, 0.18),
  MISSING: rgb(0.45, 0.45, 0.5),
};

const INK = rgb(0.1, 0.12, 0.16);
const MUTED = rgb(0.42, 0.45, 0.5);
const RULE = rgb(0.8, 0.82, 0.85);

function colorFor(status?: string | null) {
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

/** pdf-lib throws on characters outside WinAnsi, which student text can easily contain. */
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
  // Stored coordinates use a top-left origin; PDF space is bottom-left.
  const pdfY = pageHeight - annot.y - annot.height;
  const color = colorFor(annot.status);

  if (annot.type === 'HIGHLIGHT') {
    page.drawRectangle({
      x: annot.x,
      y: pdfY,
      width: annot.width,
      height: annot.height,
      color,
      opacity: 0.2,
      borderColor: color,
      borderWidth: 1,
    });
  } else {
    // BOX and COMMENT both get an outline. COMMENT previously drew nothing at all, leaving
    // its correction floating with no indication of what it referred to.
    page.drawRectangle({
      x: annot.x,
      y: pdfY,
      width: annot.width,
      height: annot.height,
      borderColor: color,
      borderWidth: 1.5,
      opacity: 0,
    });
  }

  if (annot.label) {
    page.drawText(toWinAnsi(annot.label), {
      x: annot.x,
      y: pdfY + annot.height + 2,
      size: 7,
      font: bold,
      color,
    });
  }

  const parts: string[] = [];
  // Both are kept — the old export dropped the feedback whenever a correction existed.
  if (annot.comment) parts.push('Feedback: ' + annot.comment);
  if (annot.correction) parts.push('Correction: ' + annot.correction);
  if (parts.length === 0) return;

  const size = 7.5;
  const maxWidth = Math.max(120, Math.min(pageWidth - annot.x - 24, 320));
  const lines = parts.flatMap((p) => wrapText(toWinAnsi(p), font, size, maxWidth)).slice(0, 6);

  let cursorY = pdfY - 9;
  for (const line of lines) {
    if (cursorY < 12) break; // Stop at the bottom margin rather than drawing off-page.
    page.drawText(line, { x: annot.x, y: cursorY, size, font, color });
    cursorY -= size + 1.5;
  }
}

/** Appends a marks summary — the teacher-facing record of how the score was reached. */
function drawSummaryPages(
  pdfDoc: PDFDocument,
  summary: MarkSummary,
  font: PDFFont,
  bold: PDFFont
): void {
  let page = pdfDoc.addPage();
  const { width, height } = page.getSize();
  const margin = 48;
  const maxWidth = width - margin * 2;
  let y = height - margin;

  const ensureRoom = (needed: number) => {
    if (y < margin + needed) {
      page = pdfDoc.addPage();
      y = page.getSize().height - margin;
    }
  };

  const block = (
    text: string,
    size: number,
    f: PDFFont,
    color = INK,
    gap = 6,
    indent = 0
  ) => {
    for (const l of wrapText(toWinAnsi(text), f, size, maxWidth - indent)) {
      ensureRoom(24);
      page.drawText(l, { x: margin + indent, y, size, font: f, color });
      y -= size + 3;
    }
    y -= gap;
  };

  block('Grading Summary', 20, bold, INK, 4);
  block(summary.paperName, 11, font, MUTED, 2);
  block('Submission ' + summary.submissionId, 8, font, MUTED, 10);

  const pct = summary.maxMarks > 0 ? (summary.totalMarks / summary.maxMarks) * 100 : 0;
  block(
    'Score: ' + summary.totalMarks + ' / ' + summary.maxMarks + '  (' + pct.toFixed(1) + '%)',
    15,
    bold,
    INK,
    8
  );

  if (summary.needsReview) {
    block(
      'Flagged for human review - check these marks before releasing them.',
      9,
      bold,
      COLORS.PARTIAL,
      8
    );
  }

  ensureRoom(24);
  page.drawLine({
    start: { x: margin, y: y + 4 },
    end: { x: width - margin, y: y + 4 },
    thickness: 0.5,
    color: RULE,
  });
  y -= 12;

  block('Marks by rubric point', 11, bold, INK, 6);

  for (const row of summary.rows) {
    ensureRoom(60);
    const head =
      (row.label ? row.label + '  ' : '') +
      row.marksAwarded +
      '/' +
      row.maxMarks +
      '  ' +
      row.status;
    page.drawText(toWinAnsi(head), { x: margin, y, size: 9, font: bold, color: colorFor(row.status) });
    y -= 12;

    block(row.description, 8.5, font, INK, 2, 12);
    if (row.feedback) {
      block(row.feedback, 8, font, MUTED, 2, 12);
    }
    y -= 6;
  }

  const provenance = [
    summary.model ? 'Graded by ' + summary.model : null,
    summary.gradedAt ? summary.gradedAt.toISOString() : null,
  ]
    .filter(Boolean)
    .join(' - ');

  if (provenance) {
    ensureRoom(30);
    page.drawText(toWinAnsi(provenance), { x: margin, y, size: 7.5, font, color: MUTED });
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
