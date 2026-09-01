import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getGradingDispatcher } from '@/lib/queue/grading';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: submissionId } = await params;

    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
    });

    if (!submission) {
      return NextResponse.json({ error: 'SUBMISSION_NOT_FOUND' }, { status: 404 });
    }

    const dispatcher = getGradingDispatcher();
    await dispatcher.enqueue(submissionId);

    return NextResponse.json({
      submissionId,
      status: 'QUEUED',
      message: 'Grading job queued successfully',
    });
  } catch (error) {
    console.error('Error queuing grading job:', error);
    return NextResponse.json(
      { error: 'FAILED_TO_QUEUE_GRADING', message: String(error) },
      { status: 500 }
    );
  }
}
