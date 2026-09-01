import { GradingPanel } from '@/components/grading/GradingPanel';
import { notFound } from 'next/navigation';

export const revalidate = 0;

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default async function SubmissionDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  
  let submission = null;

  try {
    const res = await fetch(`${API_BASE}/api/submissions/${id}`, { cache: 'no-store' });
    if (res.ok) {
      submission = await res.json();
    }
  } catch (err) {
    submission = null;
  }

  if (!submission) {
    notFound();
  }

  return (
    <GradingPanel
      submission={{
        ...submission,
        gradingRuns: submission.gradingRuns.map((r: any) => ({
          ...r,
          results: r.results.map((res: any) => ({
            ...res,
            status: res.status as 'CORRECT' | 'PARTIAL' | 'INCORRECT' | 'MISSING',
          })),
        })),
        annotations: submission.annotations.map((a: any) => ({
          ...a,
          type: a.type as 'HIGHLIGHT' | 'BOX' | 'COMMENT',
        })),
      }}
    />
  );
}
