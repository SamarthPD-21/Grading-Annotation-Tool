import { SubmissionStatus } from '@/types/grading';

const STAGES: { key: SubmissionStatus; label: string }[] = [
  { key: 'UPLOADED', label: 'Upload' },
  { key: 'EXTRACTING', label: 'Extract' },
  { key: 'GRADING', label: 'Grade' },
  { key: 'ANNOTATING', label: 'Annotate' },
  { key: 'COMPLETED', label: 'Complete' },
];

const ORDER = ['UPLOADED', 'EXTRACTING', 'READY', 'GRADING', 'VALIDATING', 'ANNOTATING', 'COMPLETED', 'REVIEW_REQUIRED'];

/** Maps an error code back to the stage that raised it, so only that one turns red. */
function failedStageFor(errorCode?: string | null): SubmissionStatus {
  if (!errorCode) return 'GRADING';
  if (errorCode.startsWith('LLM_')) return 'GRADING';
  if (['UNKNOWN_RUBRIC_ID', 'INVALID_MARKS', 'TOTAL_EXCEEDS_MAXIMUM'].includes(errorCode)) {
    return 'GRADING';
  }
  return 'EXTRACTING';
}

export function StatusProgress({ status, errorCode }: { status: string; errorCode?: string | null }) {
  const failedStage = status === 'FAILED' ? failedStageFor(errorCode) : null;

  const getStageState = (stageKey: SubmissionStatus) => {
    if (failedStage) {
      // Stages before the failure genuinely did complete — showing them as failed hides
      // where the pipeline actually stopped.
      const failedIndex = ORDER.indexOf(failedStage);
      const stageIndex = ORDER.indexOf(stageKey);
      if (stageIndex < failedIndex) return 'completed';
      if (stageIndex === failedIndex) return 'failed';
      return 'pending';
    }

    if (status === 'REVIEW_REQUIRED' && stageKey === 'COMPLETED') return 'completed';

    const currentIndex = ORDER.indexOf(status);
    const stageIndex = ORDER.indexOf(stageKey);

    if (currentIndex > stageIndex) return 'completed';
    if (currentIndex === stageIndex) return 'current';
    return 'pending';
  };

  return (
    <div className="flex items-center gap-1 py-2">
      {STAGES.map((s, idx) => {
        const state = getStageState(s.key);
        return (
          <div key={s.key} className="flex items-center gap-1">
            <div className="flex items-center gap-1">
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${
                  state === 'completed'
                    ? 'bg-success text-white'
                    : state === 'current'
                    ? 'bg-primary text-primary-foreground ring-2 ring-primary/20 animate-pulse-subtle'
                    : state === 'failed'
                    ? 'bg-destructive text-destructive-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {state === 'completed' ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                ) : state === 'failed' ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/></svg>
                ) : (
                  idx + 1
                )}
              </div>
              <span
                className={`text-[10px] font-semibold hidden sm:inline ${
                  state === 'current'
                    ? 'text-primary'
                    : state === 'completed'
                    ? 'text-foreground'
                    : 'text-muted-foreground'
                }`}
              >
                {s.label}
              </span>
            </div>
            {idx < STAGES.length - 1 && (
              <div
                className={`h-px w-4 rounded ${
                  state === 'completed' ? 'bg-success' : 'bg-border'
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
