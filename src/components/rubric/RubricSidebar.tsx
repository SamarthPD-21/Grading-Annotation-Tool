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
  /** False before a run has produced results, so ungraded reads as ungraded, not as zero. */
  isGraded?: boolean;
}

const STATUS_CONFIG = {
  CORRECT: { dot: 'bg-success', text: 'text-success', icon: '✓', label: 'Correct' },
  PARTIAL: { dot: 'bg-warning', text: 'text-warning', icon: '~', label: 'Partial' },
  INCORRECT: { dot: 'bg-destructive', text: 'text-destructive', icon: '✗', label: 'Incorrect' },
  MISSING: { dot: 'bg-muted-foreground', text: 'text-muted-foreground', icon: '–', label: 'Missing' },
};

const UNGRADED = {
  dot: 'bg-transparent border border-dashed border-muted-foreground/50',
  text: 'text-muted-foreground',
  icon: '',
  label: 'Not graded',
};

export function RubricSidebar({
  questions,
  results,
  selectedRubricPointId,
  onSelectRubricPoint,
  isGraded = true,
}: RubricSidebarProps) {
  const resultMap = new Map(results.map((r) => [r.rubricPointId, r]));
  const graded = isGraded && results.length > 0;

  const totals = questions.map((q) => {
    const earned = q.rubricPoints.reduce(
      (sum, rp) => sum + (resultMap.get(rp.id)?.marksAwarded ?? 0),
      0
    );
    return { earned, max: q.rubricPoints.reduce((s, rp) => s + rp.maxMarks, 0) };
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-border">
        <h2 className="text-sm font-bold text-foreground">Rubric Evaluation</h2>
        <span className="text-[10px] text-muted-foreground font-medium">
          {graded ? 'Click to locate' : 'Awaiting grading'}
        </span>
      </div>

      {!graded && (
        <p className="text-[11px] text-muted-foreground leading-relaxed rounded-lg border border-dashed border-border p-2.5">
          This paper has not been graded yet, so no marks have been awarded. The rubric below is
          the marking scheme read from the uploaded paper.
        </p>
      )}

      <div className="space-y-4 overflow-y-auto max-h-[calc(100vh-13rem)] pr-1">
        {questions.map((q, qi) => {
          const { earned, max } = totals[qi];
          const pct = max > 0 ? (earned / max) * 100 : 0;

          return (
            <section key={q.id} className="space-y-1.5">
              <header className="flex items-baseline justify-between gap-2 sticky top-0 bg-card/95 backdrop-blur-sm py-1 z-10">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Q{q.number}
                </span>
                {graded ? (
                  <span className="flex items-center gap-1.5">
                    <span className="h-1 w-12 rounded-full bg-muted overflow-hidden">
                      <span
                        className="block h-full rounded-full bg-primary transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </span>
                    <span className="text-[11px] font-bold tabular-nums text-foreground">
                      {earned}/{max}
                    </span>
                  </span>
                ) : (
                  <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
                    {max} marks
                  </span>
                )}
              </header>

              <p className="text-[11px] text-muted-foreground line-clamp-2 leading-snug">{q.text}</p>

              <ul className="space-y-1">
                {q.rubricPoints.map((rp, i) => {
                  const res = resultMap.get(rp.id);
                  const cfg = res ? STATUS_CONFIG[res.status] : UNGRADED;
                  const isSelected = selectedRubricPointId === rp.id;

                  return (
                    <li key={rp.id}>
                      <button
                        onClick={() => onSelectRubricPoint(rp.id)}
                        title={rp.description}
                        className={`w-full text-left px-2.5 py-2 rounded-lg border transition-all cursor-pointer ${
                          isSelected
                            ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                            : 'border-transparent bg-muted/30 hover:bg-accent/40'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <span
                            className={`mt-px w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0 ${cfg.dot}`}
                          >
                            {cfg.icon}
                          </span>

                          <span className="min-w-0 flex-1">
                            <span className="flex items-baseline gap-1.5">
                              <span className="text-[10px] font-bold tabular-nums text-muted-foreground shrink-0">
                                {q.number}.{i + 1}
                              </span>
                              <span className="text-[12px] font-medium text-foreground line-clamp-2 leading-snug">
                                {rp.description}
                              </span>
                            </span>

                            {res?.feedback && (
                              <span className="block text-[11px] text-muted-foreground mt-1 line-clamp-2 leading-snug">
                                {res.feedback}
                              </span>
                            )}
                          </span>

                          {/* Ungraded shows a dash, never "0/n" — a zero the model never awarded
                              reads as a real mark and is impossible to tell apart. */}
                          <span
                            className={`text-[11px] font-bold whitespace-nowrap px-1.5 py-0.5 rounded tabular-nums shrink-0 ${
                              res ? 'bg-muted text-foreground' : 'text-muted-foreground'
                            }`}
                          >
                            {res ? `${res.marksAwarded}/${rp.maxMarks}` : `—/${rp.maxMarks}`}
                          </span>
                        </div>

                        {res?.humanReview && (
                          <span className="mt-1.5 ml-6 flex items-center gap-1 text-[10px] font-semibold text-warning">
                            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>
                            Review
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
