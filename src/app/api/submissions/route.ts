import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { saveOriginalFile } from '@/lib/storage/files';
import { createSubmission, listSubmissions } from '@/services/submission.service';

export async function GET() {
  try {
    const submissions = await listSubmissions();
    return NextResponse.json({ submissions });
  } catch (error) {
    return NextResponse.json(
      { error: 'FAILED_TO_FETCH_SUBMISSIONS', message: String(error) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const paperId = formData.get('paperId') as string;
    const studentFile = formData.get('studentFile') as File | null;

    if (!paperId) {
      return NextResponse.json({ error: 'MISSING_PAPER_ID' }, { status: 400 });
    }

    if (!studentFile) {
      return NextResponse.json({ error: 'MISSING_STUDENT_FILE' }, { status: 400 });
    }

    const paper = await prisma.paper.findUnique({ where: { id: paperId } });
    if (!paper) {
      return NextResponse.json({ error: 'PAPER_NOT_FOUND' }, { status: 404 });
    }

    const buffer = Buffer.from(await studentFile.arrayBuffer());
    const filePath = await saveOriginalFile(buffer, studentFile.name);

    const submission = await createSubmission(paperId, filePath);

    return NextResponse.json(
      {
        submissionId: submission.id,
        status: submission.status,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating submission:', error);
    return NextResponse.json(
      { error: 'FAILED_TO_CREATE_SUBMISSION', message: String(error) },
      { status: 500 }
    );
  }
}
