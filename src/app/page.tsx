import Link from 'next/link';

export const revalidate = 0;

function StatCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="group relative overflow-hidden rounded-xl border border-border bg-card p-5 transition-all hover:border-border/80 hover:shadow-lg hover:shadow-primary/5">
      <div className="absolute top-0 right-0 w-24 h-24 rounded-full opacity-[0.04] -translate-y-8 translate-x-8" style={{ background: color }} />
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-extrabold tracking-tight" style={{ color }}>{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; dot: string }> = {
    COMPLETED: { bg: 'bg-success/10', text: 'text-success', dot: 'bg-success' },
    REVIEW_REQUIRED: { bg: 'bg-warning/10', text: 'text-warning', dot: 'bg-warning' },
    FAILED: { bg: 'bg-destructive/10', text: 'text-destructive', dot: 'bg-destructive' },
    GRADING: { bg: 'bg-primary/10', text: 'text-primary', dot: 'bg-primary' },
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

export default async function DashboardPage() {
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
  } catch (err) {
    submissions = [];
  }

  const completed = submissions.filter((s) => s.status === 'COMPLETED').length;
  const review = submissions.filter((s) => s.status === 'REVIEW_REQUIRED').length;
  const failed = submissions.filter((s) => s.status === 'FAILED').length;

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Hero */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">AI-powered rubric evaluation with deterministic scoring and editable annotations.</p>
        </div>
        <Link
          href="/upload"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold shadow-sm shadow-primary/20 hover:shadow-md hover:shadow-primary/30 hover:brightness-110 transition-all active:scale-[0.97]"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
          Upload &amp; Grade
        </Link>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 stagger-children">
        <StatCard label="Total" value={submissions.length} color="var(--primary)" />
        <StatCard label="Completed" value={completed} color="var(--success)" />
        <StatCard label="Review" value={review} color="var(--warning)" />
        <StatCard label="Failed" value={failed} color="var(--destructive)" />
      </div>

      {/* Recent Submissions */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">Recent Evaluations</h2>
          <Link href="/submissions" className="text-[11px] font-semibold text-primary hover:text-primary/80 transition-colors">
            View all →
          </Link>
        </div>

        {submissions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
            </div>
            <p className="text-sm text-muted-foreground">No submissions yet.</p>
            <Link href="/upload" className="mt-2 text-xs font-semibold text-primary hover:underline">
              Upload your first paper →
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {submissions.map((sub) => (
              <Link
                key={sub.id}
                href={`/submissions/${sub.id}`}
                className="flex items-center justify-between px-5 py-3 hover:bg-accent/40 transition-colors group"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors truncate">
                    {sub.paper.name}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">
                    #{sub.id.slice(-8)} · {new Date(sub.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <span className="text-sm font-bold tabular-nums text-foreground">
                    {sub.totalMarks !== null && sub.maxMarks !== null
                      ? `${sub.totalMarks}/${sub.maxMarks}`
                      : '—'}
                  </span>
                  <StatusBadge status={sub.status} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
