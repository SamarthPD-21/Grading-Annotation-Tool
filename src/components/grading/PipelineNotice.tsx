'use client';

import { useState } from 'react';

export interface ProviderAttempt {
  provider: string;
  model: string;
  code: string;
  message: string;
}

interface ErrorDetail {
  remedy?: string | null;
  attempts?: ProviderAttempt[];
}

function parseDetail(raw?: string | null): ErrorDetail | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ErrorDetail;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

const WarningIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
    <line x1="12" x2="12" y1="9" y2="13" />
    <line x1="12" x2="12.01" y1="17" y2="17" />
  </svg>
);

const ErrorIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" x2="12" y1="8" y2="12" />
    <line x1="12" x2="12.01" y1="16" y2="16" />
  </svg>
);

/**
 * Shown when the primary model was unavailable but a later one in the chain graded anyway.
 * The run succeeded, so this is information rather than an error — but the marker still
 * needs to know a different model produced these marks.
 */
export function FallbackNotice({
  provider,
  model,
  onReGrade,
  isReGrading,
}: {
  provider?: string | null;
  model: string;
  onReGrade?: () => void;
  isReGrading?: boolean;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3.5 rounded-lg bg-warning/10 border border-warning/25 animate-fade-in">
      <div className="flex items-start gap-2.5 text-warning min-w-0 flex-1">
        <WarningIcon />
        <div className="text-sm min-w-0">
          <span className="font-bold">Graded by a fallback model. </span>
          <span className="text-foreground/80">
            The primary model was unavailable, so{' '}
            <span className="font-mono text-xs font-semibold text-warning">
              {provider ? `${provider}/${model}` : model}
            </span>{' '}
            graded this submission instead. Every rubric point is flagged for review.
          </span>
        </div>
      </div>
      {onReGrade && (
        <button
          onClick={onReGrade}
          disabled={isReGrading}
          className="shrink-0 self-start sm:self-auto px-3 py-1.5 rounded-lg border border-warning/40 text-warning text-xs font-semibold hover:bg-warning/10 transition-all disabled:opacity-40"
        >
          Retry on primary
        </button>
      )}
    </div>
  );
}

/**
 * Shown when every provider failed. Renders the per-provider breakdown rather than one
 * flattened vendor string, so it is clear what was tried and what to do next.
 */
export function PipelineFailureNotice({
  errorCode,
  errorMessage,
  errorDetail,
  hasPreviousResults,
  onReGrade,
  isReGrading,
}: {
  errorCode?: string | null;
  errorMessage: string;
  errorDetail?: string | null;
  hasPreviousResults?: boolean;
  onReGrade?: () => void;
  isReGrading?: boolean;
}) {
  const detail = parseDetail(errorDetail);
  const attempts = detail?.attempts ?? [];
  const [showAttempts, setShowAttempts] = useState(attempts.length > 0 && attempts.length <= 3);

  return (
    <div className="rounded-lg bg-destructive/10 border border-destructive/25 animate-fade-in overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-start gap-3 p-4">
        <div className="flex items-start gap-2.5 text-destructive min-w-0 flex-1">
          <ErrorIcon />
          <div className="min-w-0 space-y-1.5">
            <p className="text-sm">
              <span className="font-bold">Grading did not finish. </span>
              <span className="text-foreground/80">{errorMessage}</span>
              {errorCode && (
                <span className="ml-1.5 font-mono text-[10px] px-1.5 py-0.5 rounded bg-destructive/15 text-destructive align-middle">
                  {errorCode}
                </span>
              )}
            </p>

            {detail?.remedy && (
              <p className="text-xs text-muted-foreground leading-relaxed">{detail.remedy}</p>
            )}

            {hasPreviousResults && (
              <p className="text-xs text-muted-foreground leading-relaxed">
                The marks and annotations below are from the last run that succeeded — they have
                not been discarded.
              </p>
            )}
          </div>
        </div>

        {onReGrade && (
          <button
            onClick={onReGrade}
            disabled={isReGrading}
            className="shrink-0 self-start px-3 py-1.5 rounded-lg bg-destructive text-destructive-foreground text-xs font-semibold hover:brightness-110 transition-all disabled:opacity-40"
          >
            {isReGrading ? 'Retrying…' : 'Retry grading'}
          </button>
        )}
      </div>

      {attempts.length > 0 && (
        <div className="border-t border-destructive/15">
          <button
            onClick={() => setShowAttempts((s) => !s)}
            className="w-full flex items-center justify-between px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
          >
            <span>
              {attempts.length} provider{attempts.length === 1 ? '' : 's'} tried
            </span>
            <span className={`transition-transform ${showAttempts ? 'rotate-90' : ''}`}>›</span>
          </button>

          {showAttempts && (
            <ul className="px-4 pb-3 space-y-1.5">
              {attempts.map((a, i) => (
                <li
                  key={`${a.provider}-${a.model}-${i}`}
                  className="flex flex-col sm:flex-row sm:items-baseline gap-x-2 gap-y-0.5 text-xs"
                >
                  <span className="font-mono text-[11px] font-semibold text-foreground/90 shrink-0">
                    {a.provider}/{a.model}
                  </span>
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-destructive/15 text-destructive shrink-0 self-start">
                    {a.code}
                  </span>
                  <span className="text-muted-foreground min-w-0 break-words">{a.message}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * A scanned or handwritten answer has no text layer, so it was read by a vision model
 * first. That transcription is a second layer of interpretation and carries no
 * coordinates — saying so is the difference between "no evidence found" and "evidence
 * cannot be located here".
 */
export function TranscriptionNotice({ transcribedBy }: { transcribedBy?: string | null }) {
  return (
    <div className="flex items-start gap-2.5 p-3.5 rounded-lg bg-primary/5 border border-primary/20 animate-fade-in">
      <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5 text-primary">
        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
      <div className="text-sm min-w-0">
        <span className="font-bold text-primary">Read from a scan. </span>
        <span className="text-foreground/80">
          This answer had no selectable text, so it was transcribed
          {transcribedBy ? (
            <>
              {' '}by <span className="font-mono text-xs font-semibold text-primary">{transcribedBy}</span>
            </>
          ) : (
            ' by a vision model'
          )}{' '}
          before grading. Marks are based on that transcription, and evidence cannot be
          highlighted on the page — check the wording against the original before releasing
          the marks.
        </span>
      </div>
    </div>
  );
}
