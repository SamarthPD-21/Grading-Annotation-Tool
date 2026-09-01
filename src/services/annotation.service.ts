import { prisma } from '@/lib/db/prisma';
import { generateAnnotatedPdf, MarkSummary } from '@/lib/pdf/annotate';
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

export async function exportAnnotatedPdfService(submissionId: string): Promise<string> {
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: {
      annotations: true,
      paper: { include: { questions: { include: { rubricPoints: true }, orderBy: { number: 'asc' } } } },
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

  // Stable "Q1.2" labels, matching the markers drawn on the on-screen overlay.
  const labelByResultId = new Map<string, string>();
  for (const question of submission.paper.questions) {
    question.rubricPoints.forEach((rp, index) => {
      const result = run?.results.find((r) => r.rubricPointId === rp.id);
      if (result) labelByResultId.set(result.id, `${question.number}.${index + 1}`);
    });
  }

  const resultById = new Map((run?.results ?? []).map((r) => [r.id, r]));

  const annotations = submission.annotations.map((a) => {
    const result = a.rubricResultId ? resultById.get(a.rubricResultId) : undefined;
    return {
      page: a.page,
      x: a.x,
      y: a.y,
      width: a.width,
      height: a.height,
      type: a.type as 'HIGHLIGHT' | 'BOX' | 'COMMENT',
      status: result?.status ?? null,
      label: result ? labelByResultId.get(result.id) ?? null : null,
      comment: a.comment,
      correction: a.correction,
    };
  });

  // The exported copy is the teacher's record, so it carries the marks, not just the boxes.
  const summary: MarkSummary | null = run
    ? {
        paperName: submission.paper.name,
        submissionId,
        totalMarks: run.totalMarks ?? 0,
        maxMarks: run.maxMarks ?? 0,
        model: run.provider ? `${run.provider}/${run.model}` : run.model,
        gradedAt: run.completedAt,
        needsReview: run.results.some((r) => r.humanReview),
        rows: run.results.map((r) => ({
          label: labelByResultId.get(r.id) ?? '',
          description: r.rubricPoint.description,
          status: r.status,
          marksAwarded: r.marksAwarded,
          maxMarks: r.rubricPoint.maxMarks,
          feedback: r.correction ? `${r.feedback ?? ''} Correction: ${r.correction}`.trim() : r.feedback,
        })),
      }
    : null;

  return generateAnnotatedPdf(submission.studentFile, submissionId, annotations, summary);
}
