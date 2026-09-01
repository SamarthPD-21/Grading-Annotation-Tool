'use client';

export interface RubricSidebarProps {
  questions: {
    id: string;
    number: number;
    text: string;
    maxMarks: number;
    rubricPoints: {
      id: string;
      description: string;
      maxMarks: number;
      expected: string | null;
    }[];
  }[];
  results: {
    id: string;
    rubricPointId: string;
    status: 'CORRECT' | 'PARTIAL' | 'INCORRECT' | 'MISSING';
    marksAwarded: number;
    feedback: string | null;
    correction: string | null;
    confidence: number;
    humanReview: boolean;
  }[];
  selectedRubricPointId: string | null;
  onSelectRubricPoint: (rubricPointId: string) => void;
}

const STATUS_CONFIG = {
  CORRECT: { bg: 'bg-success', icon: '✓' },
  PARTIAL: { bg: 'bg-warning', icon: '~' },
  INCORRECT: { bg: 'bg-destructive', icon: '✗' },
  MISSING: { bg: 'bg-muted-foreground', icon: '—' },
};

export function RubricSidebar({
  questions,
  results,
  selectedRubricPointId,
  onSelectRubricPoint,
}: RubricSidebarProps) {
  const resultMap = new Map(results.map((r) => [r.rubricPointId, r]));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between pb-3 border-b border-border">
        <h2 className="text-sm font-bold text-foreground">Rubric Evaluation</h2>
        <span className="text-[10px] text-muted-foreground font-medium">Click to locate</span>
      </div>

      <div className="space-y-5 overflow-y-auto max-h-[calc(100vh-280px)] pr-1">
        {questions.map((q) => (
          <div key={q.id} className="space-y-2">
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Q{q.number} · {q.maxMarks} marks
            </div>

            <div className="space-y-1.5">
              {q.rubricPoints.map((rp) => {
                const res = resultMap.get(rp.id);
                const isSelected = selectedRubricPointId === rp.id;
                const sc = res ? STATUS_CONFIG[res.status] : STATUS_CONFIG.MISSING;

                return (
                  <button
                    key={rp.id}
                    onClick={() => onSelectRubricPoint(rp.id)}
                    className={`w-full text-left p-3 rounded-lg border transition-all cursor-pointer ${
                      isSelected
                        ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20'
                        : 'border-border bg-card hover:border-border/80 hover:bg-accent/30'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0 ${sc.bg}`}
                        >
                          {sc.icon}
                        </span>
                        <span className="text-[13px] font-medium text-foreground line-clamp-2">
                          {rp.description}
                        </span>
                      </div>
                      <span className="text-[11px] font-bold whitespace-nowrap px-1.5 py-0.5 rounded bg-muted text-foreground tabular-nums">
                        {res ? `${res.marksAwarded}/${rp.maxMarks}` : `0/${rp.maxMarks}`}
                      </span>
                    </div>

                    {res?.feedback && (
                      <p className="text-[11px] text-muted-foreground mt-1.5 line-clamp-2 pl-6">
                        {res.feedback}
                      </p>
                    )}

                    {res?.humanReview && (
                      <div className="mt-1.5 pl-6 flex items-center gap-1 text-[10px] font-semibold text-warning">
                        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>
                        Flagged for Review
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
