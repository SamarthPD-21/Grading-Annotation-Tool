import Link from 'next/link';

export const revalidate = 0;

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; dot: string }> = {
    COMPLETED: { bg: 'bg-success/10', text: 'text-success', dot: 'bg-success' },
    REVIEW_REQUIRED: { bg: 'bg-warning/10', text: 'text-warning', dot: 'bg-warning' },
    FAILED: { bg: 'bg-destructive/10', text: 'text-destructive', dot: 'bg-destructive' },
    GRADING: { bg: 'bg-primary/10', text: 'text-primary', dot: 'bg-primary' },
    EXTRACTING: { bg: 'bg-primary/10', text: 'text-primary', dot: 'bg-primary' },
    UPLOADED: { bg: 'bg-muted', text: 'text-muted-foreground', dot: 'bg-muted-foreground' },
  };
  const c = config[status] || { bg: 'bg-muted', text: 'text-muted-foreground', dot: 'bg-muted-foreground' };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {status.replace(/_/g, ' ')}
    </span>
  );
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default async function SubmissionsHistoryPage() {
  let submissions: Array<{
    id: string;
    status: string;
    totalMarks: number | null;
    maxMarks: number | null;
    createdAt: string;
    paper: { name: string };
  }> = [];

  try {
    const res = await fetch(`${API_BASE}/api/submissions`, { cache: 'no-store' });
    if (res.ok) {
      submissions = await res.json();
    }
  } catch {
    submissions = [];
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground">Submission History</h1>
          <p className="text-sm text-muted-foreground mt-1">
            All evaluated submissions, scores, and review status records.
          </p>
        </div>
        <Link
          href="/upload"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold shadow-sm shadow-primary/20 hover:shadow-md hover:shadow-primary/30 hover:brightness-110 transition-all active:scale-[0.97]"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
          New Submission
        </Link>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {submissions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
            </div>
            <p className="text-sm text-muted-foreground">No submissions found.</p>
            <Link href="/upload" className="mt-2 text-xs font-semibold text-primary hover:underline">Upload your first paper →</Link>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">ID</th>
                <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Assessment</th>
                <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Score</th>
                <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Date</th>
                <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {submissions.map((sub) => (
                <tr key={sub.id} className="hover:bg-accent/40 transition-colors group">
                  <td className="px-5 py-3 font-mono text-[11px] text-muted-foreground">#{sub.id.slice(-8)}</td>
                  <td className="px-5 py-3 font-medium text-foreground">{sub.paper.name}</td>
                  <td className="px-5 py-3"><StatusBadge status={sub.status} /></td>
                  <td className="px-5 py-3 font-bold tabular-nums text-foreground">
                    {sub.totalMarks !== null && sub.maxMarks !== null ? `${sub.totalMarks}/${sub.maxMarks}` : '—'}
                  </td>
                  <td className="px-5 py-3 text-[11px] text-muted-foreground font-mono">
                    {new Date(sub.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link href={`/submissions/${sub.id}`} className="text-[11px] font-semibold text-primary hover:text-primary/80 transition-colors">
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
