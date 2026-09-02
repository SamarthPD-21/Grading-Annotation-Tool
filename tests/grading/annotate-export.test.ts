import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { generateAnnotatedPdf, AnnotationItem, MarkSummary } from '@/lib/pdf/annotate';
import { parseAnnotationPatch } from '@/services/annotation.service';

let workDir: string;
let originalPath: string;
let originalBytes: Buffer;

beforeAll(async () => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gradesense-'));
  process.env.UPLOAD_DIR = workDir;

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([612, 792]);
  page.drawText('The student answer goes here.', { x: 72, y: 700, size: 12, font });
  doc.addPage([612, 792]);

  originalPath = path.join(workDir, 'original.pdf');
  await fs.promises.writeFile(originalPath, await doc.save());
  originalBytes = fs.readFileSync(originalPath);
});

afterAll(() => {
  fs.rmSync(workDir, { recursive: true, force: true });
});

const ANNOTATIONS: AnnotationItem[] = [
  {
    page: 1,
    x: 72,
    y: 80,
    width: 200,
    height: 16,
    type: 'HIGHLIGHT',
    status: 'CORRECT',
    label: '1.1',
    comment: 'Correctly identifies the closed circuit.',
    correction: null,
  },
  {
    page: 2,
    x: 72,
    y: 120,
    width: 180,
    height: 16,
    type: 'BOX',
    status: 'INCORRECT',
    label: '1.2',
    comment: 'The ammeter is described in parallel.',
    correction: 'An ammeter must be connected in series.',
  },
];

const SUMMARY: MarkSummary = {
  paperName: 'Physics Paper 1',
  submissionId: 'sub-test',
  totalMarks: 1,
  maxMarks: 2,
  model: 'gemma/gemma-4-31b-it',
  gradedAt: new Date('2026-01-01T00:00:00Z'),
  needsReview: true,
  questions: [
    {
      number: 1,
      text: 'Describe how a simple electric circuit works.',
      earned: 1,
      max: 2,
      points: [
        {
          label: '1.1',
          description: 'Identifies the closed circuit',
          expected: 'A closed loop lets current flow.',
          status: 'CORRECT',
          marksAwarded: 1,
          maxMarks: 1,
          evidence: 'The battery, switch and bulb are connected in a loop.',
          feedback: 'Correctly identifies the closed path.',
          correction: null,
          confidence: 1,
          humanReview: false,
        },
        {
          label: '1.2',
          description: 'Places the ammeter in series',
          expected: 'An ammeter is connected in series.',
          status: 'INCORRECT',
          marksAwarded: 0,
          maxMarks: 1,
          evidence: 'I connected the ammeter across the bulb.',
          feedback: 'The ammeter is described in parallel.',
          correction: 'An ammeter must be connected in series.',
          confidence: 0.9,
          humanReview: true,
        },
      ],
    },
  ],
};

describe('annotated PDF export', () => {
  it('writes a copy and never touches the original', async () => {
    const out = await generateAnnotatedPdf(originalPath, 'sub-test', ANNOTATIONS, SUMMARY);

    expect(out).not.toBe(originalPath);
    expect(fs.existsSync(out)).toBe(true);
    // The spec requires the original answer paper to survive untouched.
    expect(fs.readFileSync(originalPath).equals(originalBytes)).toBe(true);
  });

  it('appends a marks summary rather than only drawing boxes', async () => {
    const out = await generateAnnotatedPdf(originalPath, 'sub-summary', ANNOTATIONS, SUMMARY);
    const annotated = await PDFDocument.load(fs.readFileSync(out));

    expect(annotated.getPageCount()).toBeGreaterThan(2);
  });

  it('produces no summary pages when the submission has not been graded', async () => {
    const out = await generateAnnotatedPdf(originalPath, 'sub-nosummary', ANNOTATIONS, null);
    const annotated = await PDFDocument.load(fs.readFileSync(out));

    expect(annotated.getPageCount()).toBe(2);
  });

  it('regenerates on every call so edited annotations are reflected', async () => {
    const first = await generateAnnotatedPdf(originalPath, 'sub-edit', ANNOTATIONS, null);
    const firstSize = fs.statSync(first).size;

    const edited = await generateAnnotatedPdf(
      originalPath,
      'sub-edit',
      [{ ...ANNOTATIONS[0], comment: 'A much longer replacement note '.repeat(6) }],
      null
    );

    expect(edited).toBe(first);
    expect(fs.statSync(edited).size).not.toBe(firstSize);
  });

  it('survives text outside the WinAnsi range instead of throwing', async () => {
    await expect(
      generateAnnotatedPdf(
        originalPath,
        'sub-unicode',
        [{ ...ANNOTATIONS[0], comment: 'Equilibrium at ₹30 — “as shown” … ✓' }],
        { ...SUMMARY, paperName: 'Economics — ₹ pricing' }
      )
    ).resolves.toBeTruthy();
  });

  it('clamps an out-of-range page onto a real page', async () => {
    await expect(
      generateAnnotatedPdf(originalPath, 'sub-oob', [{ ...ANNOTATIONS[0], page: 99 }], null)
    ).resolves.toBeTruthy();
  });
});

describe('parseAnnotationPatch', () => {
  it('accepts a geometry-only move', () => {
    expect(parseAnnotationPatch({ x: 10, y: 20, width: 30, height: 40 })).toEqual({
      x: 10,
      y: 20,
      width: 30,
      height: 40,
    });
  });

  it('accepts a text-only edit and allows clearing a field', () => {
    expect(parseAnnotationPatch({ comment: 'Reworded', correction: null })).toEqual({
      comment: 'Reworded',
      correction: null,
    });
  });

  it('strips fields the client has no business setting', () => {
    // The route used to hand req.body straight to Prisma, so this was a live
    // mass-assignment hole.
    expect(
      parseAnnotationPatch({
        x: 5,
        id: 'other-id',
        submissionId: 'someone-elses',
        page: 99,
        type: 'HIGHLIGHT',
      })
    ).toEqual({ x: 5 });
  });

  it('sanitises injected markup in note text', () => {
    const patch = parseAnnotationPatch({ comment: '<script>alert(1)</script>ok' });
    expect(patch.comment).not.toContain('<script>');
  });

  it('rejects nonsense geometry and empty patches', () => {
    expect(() => parseAnnotationPatch({ x: -1 })).toThrow(/INVALID_PATCH/);
    expect(() => parseAnnotationPatch({ width: 'wide' })).toThrow(/INVALID_PATCH/);
    expect(() => parseAnnotationPatch({})).toThrow(/INVALID_PATCH/);
    expect(() => parseAnnotationPatch(null)).toThrow(/INVALID_PATCH/);
  });
});

describe('the report reads like a marked script', () => {
  it('renders enough pages to carry the per-question breakdown', async () => {
    const out = await generateAnnotatedPdf(originalPath, 'sub-report', ANNOTATIONS, SUMMARY);
    const annotated = await PDFDocument.load(fs.readFileSync(out));

    // 2 original pages + at least one report page.
    expect(annotated.getPageCount()).toBeGreaterThanOrEqual(3);
  });

  it('grows the report when a question carries more rubric detail', async () => {
    const lean = await generateAnnotatedPdf(originalPath, 'sub-lean', [], {
      ...SUMMARY,
      questions: [{ ...SUMMARY.questions[0], points: [SUMMARY.questions[0].points[0]] }],
    });
    const leanSize = fs.statSync(lean).size;

    const rich = await generateAnnotatedPdf(originalPath, 'sub-rich', [], {
      ...SUMMARY,
      questions: [
        {
          ...SUMMARY.questions[0],
          points: SUMMARY.questions[0].points.map((p) => ({
            ...p,
            expected: 'A long model answer. '.repeat(20),
            evidence: 'A long quote from the student. '.repeat(20),
          })),
        },
      ],
    });

    // The model answer and the student's words are actually written into the report, so a
    // richer rubric produces a bigger file rather than being silently dropped.
    expect(fs.statSync(rich).size).toBeGreaterThan(leanSize);
  });

  it('handles a question whose points carry no evidence at all', async () => {
    await expect(
      generateAnnotatedPdf(originalPath, 'sub-bare', [], {
        ...SUMMARY,
        questions: [
          {
            ...SUMMARY.questions[0],
            points: [
              {
                label: '1.1',
                description: 'Some point',
                expected: null,
                status: 'MISSING',
                marksAwarded: 0,
                maxMarks: 1,
                evidence: null,
                feedback: null,
                correction: null,
                confidence: null,
                humanReview: false,
              },
            ],
          },
        ],
      })
    ).resolves.toBeTruthy();
  });
});
