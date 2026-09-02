import { prisma } from '@/lib/db/prisma';
import { processGradingPipeline } from '@/lib/grading/grade';
import { toSubmissionError } from '@/lib/llm/errors';

export async function executeGrading(submissionId: string) {
  // Fetch submission and paper details
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
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
      gradingRuns: true,
    },
  });

  if (!submission) {
    throw new Error(`Submission ${submissionId} not found`);
  }

  const attemptNumber = submission.gradingRuns.length + 1;

  try {
    // Step 1: Update status to EXTRACTING
    await prisma.submission.update({
      where: { id: submissionId },
      data: { status: 'EXTRACTING' },
    });

    // Step 2: Execute 10-step pipeline
    await prisma.submission.update({
      where: { id: submissionId },
      data: { status: 'GRADING' },
    });

    const pipelineResult = await processGradingPipeline({
      submissionId,
      studentFilePath: submission.studentFile,
      questions: submission.paper.questions,
    });

    // Step 3: Validate & annotate status
    await prisma.submission.update({
      where: { id: submissionId },
      data: { status: 'ANNOTATING' },
    });

    // Determine overall review flag
    const hasReviewRequired = pipelineResult.results.some((r) => r.humanReview);
    const finalStatus = hasReviewRequired ? 'REVIEW_REQUIRED' : 'COMPLETED';

    // Step 4: Atomic transaction boundary
    return await prisma.$transaction(async (tx: any) => {
      // A re-grade replaces the previous run's overlays. Without this the pages accumulate
      // a duplicate box per rubric point on every attempt, and stale boxes from an older
      // run keep pointing at marks that no longer exist.
      await tx.annotation.deleteMany({ where: { submissionId } });

      // Create GradingRun
      const run = await tx.gradingRun.create({
        data: {
          submissionId,
          model: pipelineResult.modelUsed,
          provider: pipelineResult.providerUsed,
          fallbackUsed: pipelineResult.fallbackUsed,
          promptVersion: pipelineResult.promptVersion,
          gradingEngineVersion: pipelineResult.engineVersion,
          status: finalStatus,
          attempt: attemptNumber,
          totalMarks: pipelineResult.totalMarks,
          maxMarks: pipelineResult.maxMarks,
          completedAt: new Date(),
        },
      });

      // Create RubricResults and Annotations
      for (const res of pipelineResult.results) {
        const rubricResult = await tx.rubricResult.create({
          data: {
            gradingRunId: run.id,
            rubricPointId: res.rubricId,
            status: res.status,
            marksAwarded: res.marksAwarded,
            evidenceText: res.evidence?.text || null,
            evidencePage: res.evidenceLocation?.page || res.evidence?.page || 1,
            evidenceBBox: res.evidenceLocation?.bbox
              ? JSON.stringify(res.evidenceLocation.bbox)
              : null,
            feedback: res.feedback,
            correction: res.correction,
            confidence: res.confidence,
            humanReview: res.humanReview,
          },
        });

        // Create initial annotation overlay if evidence found
        if (res.evidenceLocation) {
          await tx.annotation.create({
            data: {
              submissionId,
              rubricResultId: rubricResult.id,
              page: res.evidenceLocation.page,
              x: res.evidenceLocation.bbox.x,
              y: res.evidenceLocation.bbox.y,
              width: res.evidenceLocation.bbox.width,
              height: res.evidenceLocation.bbox.height,
              type: res.status === 'CORRECT' ? 'HIGHLIGHT' : 'BOX',
              comment: res.feedback,
              correction: res.correction,
            },
          });
        }
      }

      // Update submission final marks and status
      const updatedSubmission = await tx.submission.update({
        where: { id: submissionId },
        data: {
          status: finalStatus,
          totalMarks: pipelineResult.totalMarks,
          maxMarks: pipelineResult.maxMarks,
          errorCode: null,
          errorMessage: null,
          errorDetail: null,
        },
      });

      return {
        run,
        submission: updatedSubmission,
      };
    });
  } catch (error) {
    const { errorCode, errorMessage, errorDetail } = toSubmissionError(error);
    await prisma.submission.update({
      where: { id: submissionId },
      data: {
        status: 'FAILED',
        errorCode,
        errorMessage,
        errorDetail,
      },
    });
    throw error;
  }
}
