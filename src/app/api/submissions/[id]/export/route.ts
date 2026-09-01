import { NextRequest, NextResponse } from 'next/server';
import { exportAnnotatedPdfService } from '@/services/annotation.service';
import fs from 'fs';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: submissionId } = await params;
    const outputPath = await exportAnnotatedPdfService(submissionId);

    const pdfBuffer = await fs.promises.readFile(outputPath);

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="annotated-submission-${submissionId}.pdf"`,
      },
    });
  } catch (error) {
    console.error('Error exporting annotated PDF:', error);
    return NextResponse.json(
      { error: 'EXPORT_FAILED', message: String(error) },
      { status: 500 }
    );
  }
}
