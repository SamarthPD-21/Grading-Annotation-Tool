import { prisma } from '@/lib/db/prisma';

export async function createSubmission(paperId: string, studentFile: string) {
  return prisma.submission.create({
    data: {
      paperId,
      studentFile,
      status: 'UPLOADED',
    },
  });
}

export async function getSubmissionWithDetails(id: string) {
  return prisma.submission.findUnique({
    where: { id },
    include: {
      paper: {
        include: {
          questions: {
            include: {
              rubricPoints: true,
            },
          },
        },
      },
      gradingRuns: {
        orderBy: { attempt: 'desc' },
        include: {
          results: {
            include: {
              rubricPoint: true,
            },
          },
        },
      },
      annotations: {
        orderBy: { createdAt: 'asc' },
      },
    },
  });
}

export async function listSubmissions() {
  return prisma.submission.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      paper: true,
      gradingRuns: {
        orderBy: { attempt: 'desc' },
        take: 1,
      },
    },
  });
}

export async function updateSubmissionStatus(
  id: string,
  status: string,
  errorInfo?: { errorCode?: string; errorMessage?: string }
) {
  return prisma.submission.update({
    where: { id },
    data: {
      status,
      errorCode: errorInfo?.errorCode ?? null,
      errorMessage: errorInfo?.errorMessage ?? null,
    },
  });
}
