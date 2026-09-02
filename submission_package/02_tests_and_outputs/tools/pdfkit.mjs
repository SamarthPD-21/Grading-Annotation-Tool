/**
 * Minimal PDF writing helpers used to build the student answer scripts.
 *
 * The scripts are text PDFs on purpose: GradeSense locates evidence by searching the
 * extracted text items, so a script has to carry a real text layer for the highlight
 * coordinates to mean anything. Diagrams are drawn as vector strokes with real text
 * labels beside them, which is exactly what a scanned-and-OCR'd script would look like
 * to the pipeline.
 */
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fs from 'node:fs';
import path from 'node:path';

const A4 = [595.28, 841.89];
const MARGIN = 56;
const BODY_SIZE = 11;
const LINE_GAP = 5;

export class Script {
  constructor(meta) {
    this.meta = meta;
    this.ops = [];
  }

  heading(text) {
    this.ops.push({ kind: 'heading', text });
    return this;
  }

  para(text) {
    this.ops.push({ kind: 'para', text });
    return this;
  }

  /** A line the student struck through and rewrote — ordinary in a real script. */
  struck(text) {
    this.ops.push({ kind: 'struck', text });
    return this;
  }

  note(text) {
    this.ops.push({ kind: 'note', text });
    return this;
  }

  circuit(opts = {}) {
    this.ops.push({ kind: 'circuit', ...opts });
    return this;
  }

  supplyDemand(opts = {}) {
    this.ops.push({ kind: 'graph', ...opts });
    return this;
  }

  pageBreak() {
    this.ops.push({ kind: 'break' });
    return this;
  }

  space(h = 10) {
    this.ops.push({ kind: 'space', h });
    return this;
  }
}

function wrap(text, font, size, maxWidth) {
  const lines = [];
  for (const rawLine of text.split('\n')) {
    const words = rawLine.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

export async function renderScript(script, outPath) {
  const doc = await PDFDocument.create();
  const body = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);

  const contentWidth = A4[0] - MARGIN * 2;
  let page = null;
  let y = 0;
  let pageIndex = 0;

  const newPage = () => {
    page = doc.addPage(A4);
    pageIndex += 1;
    y = A4[1] - MARGIN;

    page.drawText('GradeSense — Student Answer Script', {
      x: MARGIN,
      y,
      size: 12,
      font: bold,
      color: rgb(0.1, 0.1, 0.15),
    });
    y -= 15;
    const id = `${script.meta.name}   ·   Roll No. ${script.meta.roll}   ·   Page ${pageIndex}`;
    page.drawText(id, { x: MARGIN, y, size: 9, font: italic, color: rgb(0.35, 0.35, 0.4) });
    y -= 8;
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: A4[0] - MARGIN, y },
      thickness: 0.7,
      color: rgb(0.75, 0.75, 0.8),
    });
    y -= 22;
  };

  const need = (h) => {
    if (!page || y - h < MARGIN + 24) newPage();
  };

  for (const op of script.ops) {
    switch (op.kind) {
      case 'break':
        newPage();
        break;

      case 'space':
        need(op.h);
        y -= op.h;
        break;

      case 'heading': {
        need(30);
        y -= 6;
        page.drawText(op.text, { x: MARGIN, y, size: 12, font: bold, color: rgb(0.08, 0.08, 0.12) });
        y -= 18;
        break;
      }

      case 'note': {
        const lines = wrap(op.text, italic, 9.5, contentWidth);
        for (const line of lines) {
          need(14);
          page.drawText(line, { x: MARGIN, y, size: 9.5, font: italic, color: rgb(0.4, 0.4, 0.45) });
          y -= 13;
        }
        y -= 4;
        break;
      }

      case 'struck': {
        const lines = wrap(op.text, body, BODY_SIZE, contentWidth);
        for (const line of lines) {
          need(BODY_SIZE + LINE_GAP);
          page.drawText(line, {
            x: MARGIN,
            y,
            size: BODY_SIZE,
            font: body,
            color: rgb(0.45, 0.45, 0.5),
          });
          const w = body.widthOfTextAtSize(line, BODY_SIZE);
          page.drawLine({
            start: { x: MARGIN, y: y + 3.5 },
            end: { x: MARGIN + w, y: y + 3.5 },
            thickness: 0.8,
            color: rgb(0.45, 0.45, 0.5),
          });
          y -= BODY_SIZE + LINE_GAP;
        }
        y -= 4;
        break;
      }

      case 'para': {
        const lines = wrap(op.text, body, BODY_SIZE, contentWidth);
        for (const line of lines) {
          need(BODY_SIZE + LINE_GAP);
          page.drawText(line, { x: MARGIN, y, size: BODY_SIZE, font: body, color: rgb(0.1, 0.1, 0.1) });
          y -= BODY_SIZE + LINE_GAP;
        }
        y -= 8;
        break;
      }

      case 'circuit': {
        need(215);
        y -= 6;
        drawCircuit(page, MARGIN, y - 195, contentWidth, body, bold, op);
        y -= 208;
        break;
      }

      case 'graph': {
        need(255);
        y -= 6;
        drawSupplyDemand(page, MARGIN, y - 235, contentWidth, body, bold, op);
        y -= 248;
        break;
      }
    }
  }

  const bytes = await doc.save();
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, bytes);
  return outPath;
}

/**
 * A hand-drawn-looking series circuit. `voltmeterInSeries` reproduces the classic
 * misconception, which the marking scheme calls out as a substantive error.
 */
function drawCircuit(page, x0, y0, width, font, bold, opts) {
  const ink = rgb(0.12, 0.12, 0.35);
  const label = (t, x, y, size = 8.5, f = font) =>
    page.drawText(t, { x, y, size, font: f, color: rgb(0.12, 0.12, 0.2) });
  const wire = (x1, y1, x2, y2) =>
    page.drawLine({
      start: { x: x1, y: y1 },
      end: { x: x2, y: y2 },
      thickness: 1.1,
      color: ink,
    });

  const left = x0 + 40;
  const right = x0 + Math.min(width - 40, 400);
  const bottom = y0 + 40;
  const top = y0 + 150;

  page.drawText(opts.caption ?? 'Fig 1 — Circuit diagram', {
    x: x0,
    y: y0 + 172,
    size: 9.5,
    font: bold,
    color: rgb(0.25, 0.25, 0.3),
  });

  // Top wire, broken for the switch and the resistor.
  wire(left, top, left + 70, top);
  // switch
  wire(left + 70, top, left + 100, top + 12);
  page.drawCircle({ x: left + 70, y: top, size: 2.2, color: ink });
  page.drawCircle({ x: left + 105, y: top, size: 2.2, color: ink });
  label('Switch (S)', left + 62, top + 18);
  wire(left + 105, top, left + 160, top);
  // resistor as a box
  page.drawRectangle({
    x: left + 160,
    y: top - 7,
    width: 46,
    height: 14,
    borderColor: ink,
    borderWidth: 1.1,
  });
  label('Resistor R', left + 158, top + 12);
  wire(left + 206, top, right, top);

  // Right wire down to the bulb
  wire(right, top, right, bottom + 55);
  page.drawCircle({ x: right, y: bottom + 40, size: 15, borderColor: ink, borderWidth: 1.1 });
  wire(right - 10.6, bottom + 29.4, right + 10.6, bottom + 50.6);
  wire(right + 10.6, bottom + 29.4, right - 10.6, bottom + 50.6);
  label('Bulb', right + 20, bottom + 44);
  wire(right, bottom + 25, right, bottom);

  // Bottom wire with the ammeter
  const ammeterX = opts.ammeterInParallel ? null : left + 200;
  if (ammeterX) {
    wire(right, bottom, ammeterX + 13, bottom);
    page.drawCircle({ x: ammeterX, y: bottom, size: 13, borderColor: ink, borderWidth: 1.1 });
    label('A', ammeterX - 3.5, bottom - 3.5, 9.5, bold);
    label('Ammeter (in series)', ammeterX - 40, bottom - 26);
    wire(ammeterX - 13, bottom, left, bottom);
  } else {
    wire(right, bottom, left, bottom);
    page.drawCircle({ x: left + 200, y: bottom - 34, size: 13, borderColor: ink, borderWidth: 1.1 });
    label('A', left + 196.5, bottom - 37.5, 9.5, bold);
    wire(left + 175, bottom, left + 175, bottom - 34);
    wire(left + 175, bottom - 34, left + 187, bottom - 34);
    wire(left + 213, bottom - 34, left + 225, bottom - 34);
    wire(left + 225, bottom - 34, left + 225, bottom);
    label('Ammeter (across the wire)', left + 150, bottom - 52);
  }

  // Left wire with the battery
  const midY = (top + bottom) / 2;
  wire(left, bottom, left, midY - 12);
  wire(left - 11, midY - 12, left + 11, midY - 12);
  wire(left - 5, midY - 5, left + 5, midY - 5);
  wire(left - 11, midY + 2, left + 11, midY + 2);
  wire(left - 5, midY + 9, left + 5, midY + 9);
  wire(left, midY + 9, left, top);
  label('Battery', left - 62, midY - 4);
  label('+', left + 15, midY + 8);
  label('-', left + 15, midY - 16);

  // Voltmeter — parallel across the bulb, or (wrongly) in series with it.
  if (opts.voltmeterInSeries) {
    page.drawCircle({ x: right, y: bottom + 78, size: 13, borderColor: ink, borderWidth: 1.1 });
    label('V', right - 3.5, bottom + 74.5, 9.5, bold);
    label('Voltmeter (in series with bulb)', right - 150, bottom + 92);
  } else {
    const vx = right - 78;
    wire(right, bottom + 58, vx, bottom + 58);
    wire(right, bottom + 22, vx, bottom + 22);
    wire(vx, bottom + 58, vx, bottom + 53);
    wire(vx, bottom + 27, vx, bottom + 22);
    page.drawCircle({ x: vx, y: bottom + 40, size: 13, borderColor: ink, borderWidth: 1.1 });
    label('V', vx - 3.5, bottom + 36.5, 9.5, bold);
    label('Voltmeter (parallel across bulb)', vx - 120, bottom + 54);
  }

  if (opts.showCurrentDirection !== false) {
    const ax = left + 250;
    wire(ax, top + 9, ax + 24, top + 9);
    wire(ax + 24, top + 9, ax + 18, top + 13);
    wire(ax + 24, top + 9, ax + 18, top + 5);
    label('conventional current I', ax - 8, top + 16);
  }
}

/** Demand/supply lines from the paper's own schedule, with optional shifted supply. */
function drawSupplyDemand(page, x0, y0, width, font, bold, opts) {
  const axis = rgb(0.15, 0.15, 0.2);
  const demandColor = rgb(0.1, 0.35, 0.75);
  const supplyColor = rgb(0.75, 0.25, 0.15);

  const plotW = Math.min(width - 90, 330);
  const plotH = 200;
  const ox = x0 + 52;
  const oy = y0 + 34;

  page.drawText(opts.caption ?? 'Fig 2 — Demand and supply', {
    x: x0,
    y: y0 + plotH + 52,
    size: 9.5,
    font: bold,
    color: rgb(0.25, 0.25, 0.3),
  });

  page.drawLine({ start: { x: ox, y: oy }, end: { x: ox, y: oy + plotH }, thickness: 1.2, color: axis });
  page.drawLine({ start: { x: ox, y: oy }, end: { x: ox + plotW, y: oy }, thickness: 1.2, color: axis });
  page.drawText('Price (Rs)', { x: ox - 46, y: oy + plotH - 4, size: 8.5, font, color: axis });
  page.drawText('Quantity', { x: ox + plotW - 40, y: oy - 22, size: 8.5, font, color: axis });

  // Axis ticks straight off the schedule in the question paper.
  const priceAt = (p) => oy + ((p - 10) / 40) * (plotH - 20) + 10;
  const qtyAt = (q) => ox + (q / 110) * (plotW - 20) + 10;
  for (const p of [10, 20, 30, 40, 50]) {
    page.drawLine({ start: { x: ox - 4, y: priceAt(p) }, end: { x: ox, y: priceAt(p) }, thickness: 1, color: axis });
    page.drawText(String(p), { x: ox - 20, y: priceAt(p) - 3, size: 7.5, font, color: axis });
  }
  for (const q of [20, 40, 60, 80, 100]) {
    page.drawLine({ start: { x: qtyAt(q), y: oy - 4 }, end: { x: qtyAt(q), y: oy }, thickness: 1, color: axis });
    page.drawText(String(q), { x: qtyAt(q) - 6, y: oy - 15, size: 7.5, font, color: axis });
  }

  const line = (x1, y1, x2, y2, color) =>
    page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 1.4, color });

  // Demand: (100,10) → (20,50). Supply: (20,10) → (100,50).
  line(qtyAt(100), priceAt(10), qtyAt(20), priceAt(50), demandColor);
  page.drawText('D', { x: qtyAt(20) - 12, y: priceAt(50) + 2, size: 9, font: bold, color: demandColor });

  line(qtyAt(20), priceAt(10), qtyAt(100), priceAt(50), supplyColor);
  page.drawText('S', { x: qtyAt(100) + 4, y: priceAt(50) - 2, size: 9, font: bold, color: supplyColor });

  const eq = opts.equilibrium ?? { price: 30, qty: 60 };
  const ex = qtyAt(eq.qty);
  const ey = priceAt(eq.price);
  page.drawCircle({ x: ex, y: ey, size: 3, color: rgb(0.1, 0.1, 0.1) });
  page.drawText(opts.equilibriumLabel ?? `E (Rs ${eq.price}, ${eq.qty} units)`, {
    x: ex + 7,
    y: ey - 3,
    size: 8.5,
    font: bold,
    color: rgb(0.1, 0.1, 0.1),
  });
  page.drawLine({ start: { x: ox, y: ey }, end: { x: ex, y: ey }, thickness: 0.6, color: rgb(0.5, 0.5, 0.55) });
  page.drawLine({ start: { x: ex, y: oy }, end: { x: ex, y: ey }, thickness: 0.6, color: rgb(0.5, 0.5, 0.55) });

  if (opts.shiftedSupply) {
    line(qtyAt(20) - 8 + 30, priceAt(10), qtyAt(100) - 50, priceAt(50), rgb(0.85, 0.5, 0.2));
    page.drawText('S1 (after cost rise)', {
      x: qtyAt(100) - 96,
      y: priceAt(50) + 4,
      size: 8,
      font: bold,
      color: rgb(0.85, 0.5, 0.2),
    });
    const nx = qtyAt(46);
    const ny = priceAt(36);
    page.drawCircle({ x: nx, y: ny, size: 3, color: rgb(0.3, 0.3, 0.3) });
    page.drawText('E1 (higher price, lower qty)', {
      x: nx - 132,
      y: ny + 6,
      size: 8,
      font,
      color: rgb(0.3, 0.3, 0.3),
    });
  }
}
