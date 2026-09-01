import { NextRequest, NextResponse } from 'next/server';
import { updateAnnotation, deleteAnnotation } from '@/services/annotation.service';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    const updated = await updateAnnotation(id, {
      x: body.x,
      y: body.y,
      width: body.width,
      height: body.height,
      comment: body.comment,
      correction: body.correction,
    });

    return NextResponse.json({ annotation: updated });
  } catch (error) {
    return NextResponse.json(
      { error: 'ANNOTATION_UPDATE_FAILED', message: String(error) },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await deleteAnnotation(id);
    return NextResponse.json({ success: true, deletedId: id });
  } catch (error) {
    return NextResponse.json(
      { error: 'ANNOTATION_DELETE_FAILED', message: String(error) },
      { status: 500 }
    );
  }
}
