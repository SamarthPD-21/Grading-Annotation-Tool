import { prisma } from '@/lib/db/prisma';
import {
  generateAnnotatedPdf,
  MarkSummary,
  MarkSummaryPoint,
  MarkSummaryQuestion,
} from '@/lib/pdf/annotate';
import { sanitizeString } from '@/lib/security/sanitize';

export async function createAnnotation(data: {
  submissionId: string;
  rubricResultId?: string | null;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  type: string;
  comment?: string | null;
  correction?: string | null;
}) {
  return prisma.annotation.create({
    data: {
      submissionId: data.submissionId,
      rubricResultId: data.rubricResultId || null,
      page: data.page,
      x: data.x,
      y: data.y,
      width: data.width,
      height: data.height,
      type: data.type,
      comment: data.comment || null,
      correction: data.correction || null,
    },
  });
}

export interface AnnotationPatch {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  comment?: string | null;
  correction?: string | null;
}

/**
 * Whitelists what a client may change. The HTTP layer used to hand `req.body` straight to
 * Prisma, which let a caller rewrite `submissionId`, `page`, `type` or even `id`.
 */
export function parseAnnotationPatch(body: unknown): AnnotationPatch {
  if (!body || typeof body !== 'object') {
    throw new Error('INVALID_PATCH: Request body must be an object.');
  }
  const input = body as Record<string, unknown>;
  const patch: AnnotationPatch = {};

  for (const key of ['x', 'y', 'width', 'height'] as const) {
    if (input[key] === undefined) continue;
    const value = Number(input[key]);
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`INVALID_PATCH: ${key} must be a non-negative number.`);
    }
    patch[key] = value;
  }

  for (const key of ['comment', 'correction'] as const) {
    if (input[key] === undefined) continue;
    if (input[key] === null) {
      patch[key] = null;
      continue;
    }
    if (typeof input[key] !== 'string') {
      throw new Error(`INVALID_PATCH: ${key} must be a string or null.`);
    }
    patch[key] = sanitizeString(input[key] as string, 2000);
  }

  if (Object.keys(patch).length === 0) {
    throw new Error('INVALID_PATCH: No editable fields supplied.');
  }

  return patch;
}

export async function updateAnnotation(id: string, patch: AnnotationPatch) {
  return prisma.annotation.update({
    where: { id },
    data: patch,
  });
}

export async function deleteAnnotation(id: string) {
  return prisma.annotation.delete({
    where: { id },
  });
}

/** Rows written before per-line rects existed fall back to their single union box. */
function parseRects(raw: string | null): { x: number; y: number; width: number; height: number }[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

export async function exportAnnotatedPdfService(submissionId: string): Promise<string> {
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: {
      annotations: true,
      paper: {
        include: {
          questions: { include: { rubricPoints: true }, orderBy: { number: 'asc' } },
        },
      },
      gradingRuns: {
        orderBy: { attempt: 'desc' },
        take: 1,
        include: { results: { include: { rubricPoint: true } } },
      },
    },
  });

  if (!submission) {
    throw new Error(`Submission ${submissionId} not found`);
  }

  const run = submission.gradingRuns[0];

  // Exporting an ungraded paper produces a bare copy of the student's own PDF, which reads
  // as though grading ran and found nothing. Refuse instead, and say why.
  if (!run || run.results.length === 0) {
    throw new Error(
      'NOT_GRADED: This submission has no grading results yet, so there is nothing to ' +
        'annotate. Run grading first, then export.'
    );
  }

  const resultByPointId = new Map(run.results.map((r) => [r.rubricPointId, r]));
  const resultById = new Map(run.results.map((r) => [r.id, r]));

  // Stable "Q1.2" labels, matching the markers drawn on the on-screen overlay.
  const labelByResultId = new Map<string, string>();
  for (const question of submission.paper.questions) {
    question.rubricPoints.forEach((rp, index) => {
      const result = resultByPointId.get(rp.id);
      if (result) labelByResultId.set(result.id, `${question.number}.${index + 1}`);
    });
  }

  const annotations = submission.annotations.map((a) => {
    const result = a.rubricResultId ? resultById.get(a.rubricResultId) : undefined;
    return {
      page: a.page,
      x: a.x,
      y: a.y,
      width: a.width,
      height: a.height,
      rects: parseRects(a.rects),
      type: a.type as 'HIGHLIGHT' | 'BOX' | 'COMMENT',
      status: result?.status ?? null,
      label: result ? labelByResultId.get(result.id) ?? null : null,
      comment: a.comment,
      correction: a.correction,
    };
  });

  // The note a marker edited on an annotation is the authoritative wording for that point.
  // Now that the page carries only a marker, the report is where those edits have to show.
  const annotationByResultId = new Map(
    submission.annotations
      .filter((a) => a.rubricResultId)
      .map((a) => [a.rubricResultId as string, a])
  );

  // Grouped by question so the report reads like a marked script rather than a flat list.
  const questions: MarkSummaryQuestion[] = submission.paper.questions.map((q) => {
    const points: MarkSummaryPoint[] = q.rubricPoints.map((rp, index) => {
      const r = resultByPointId.get(rp.id);
      const note = r ? annotationByResultId.get(r.id) : undefined;
      return {
        label: `${q.number}.${index + 1}`,
        description: rp.description,
        expected: rp.expected,
        status: r?.status ?? 'MISSING',
        marksAwarded: r?.marksAwarded ?? 0,
        maxMarks: rp.maxMarks,
        evidence: r?.evidenceText ?? null,
        feedback: note?.comment ?? r?.feedback ?? null,
        correction: note?.correction ?? r?.correction ?? null,
        confidence: r?.confidence ?? null,
        humanReview: r?.humanReview ?? false,
      };
    });

    return {
      number: q.number,
      text: q.text,
      earned: points.reduce((sum, p) => sum + p.marksAwarded, 0),
      max: points.reduce((sum, p) => sum + p.maxMarks, 0),
      points,
    };
  });

  const summary: MarkSummary = {
    paperName: submission.paper.name,
    submissionId,
    totalMarks: run.totalMarks ?? 0,
    maxMarks: run.maxMarks ?? 0,
    model: run.provider ? `${run.provider}/${run.model}` : run.model,
    gradedAt: run.completedAt,
    needsReview: run.results.some((r) => r.humanReview),
    questions,
  };

  return generateAnnotatedPdf(submission.studentFile, submissionId, annotations, summary);
}
