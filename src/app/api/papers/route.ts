import { NextRequest, NextResponse } from 'next/server';
import { createPaperFromUpload } from '@/services/paper.service';
import { toSubmissionError } from '@/lib/llm/errors';
import { sanitizeString, validatePdfFile } from '@/lib/security/sanitize';

async function toUpload(file: File | null) {
  if (!file) return null;
  return { buffer: Buffer.from(await file.arrayBuffer()), originalname: file.name };
}

/**
 * Mirror of the Express `POST /api/papers`. Both delegate to the same service so the two
 * entry points cannot drift — this route previously carried its own hardcoded sample rubric.
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const name = sanitizeString((formData.get('name') as string) || 'Untitled Assessment', 100);
    const questionFile = formData.get('questionFile') as File | null;
    const rubricFile = formData.get('rubricFile') as File | null;
    const questionsJson = formData.get('questions') as string | null;

    for (const file of [questionFile, rubricFile]) {
      if (!file) continue;
      const check = validatePdfFile({ name: file.name, type: file.type, size: file.size });
      if (!check.valid) {
        return NextResponse.json({ error: check.error }, { status: 400 });
      }
    }

    let questions = null;
    if (questionsJson) {
      try {
        questions = JSON.parse(questionsJson);
      } catch {
        return NextResponse.json({ error: 'questions must be valid JSON' }, { status: 400 });
      }
    }

    const paper = await createPaperFromUpload({
      name,
      questionFile: await toUpload(questionFile),
      rubricFile: await toUpload(rubricFile),
      questions,
    });

    return NextResponse.json({ paperId: paper.id, paper }, { status: 201 });
  } catch (error) {
    console.error('Error creating paper:', error);
    const { errorCode, errorMessage } = toSubmissionError(error);
    const isInput =
      errorCode.startsWith('RUBRIC_') ||
      errorCode === 'LLM_BAD_REQUEST' ||
      errorCode === 'LLM_PARSE_ERROR';
    return NextResponse.json({ error: errorMessage, errorCode }, { status: isInput ? 422 : 500 });
  }
}
