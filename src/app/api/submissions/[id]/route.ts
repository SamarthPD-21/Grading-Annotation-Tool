import { NextRequest, NextResponse } from 'next/server';
import { getSubmissionWithDetails } from '@/services/submission.service';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const submission = await getSubmissionWithDetails(id);

    if (!submission) {
      return NextResponse.json({ error: 'SUBMISSION_NOT_FOUND' }, { status: 404 });
    }

    return NextResponse.json({ submission });
  } catch (error) {
    return NextResponse.json(
      { error: 'FAILED_TO_GET_SUBMISSION', message: String(error) },
      { status: 500 }
    );
  }
}
