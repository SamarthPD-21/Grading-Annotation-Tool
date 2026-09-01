'use client';

import { useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export interface EditableAnnotation {
  id: string;
  comment: string | null;
  correction: string | null;
}

/**
 * Edits the note printed on the annotated PDF for one evidence box. This is the spec's
 * "change an annotation" — it persists straight to the annotation row, so nothing is
 * re-graded and the marks are untouched.
 *
 * The caller must key this on the annotation id: selecting a different rubric point should
 * load that annotation's note, which a remount gives us without a state-sync effect.
 */
export function AnnotationEditor({
  annotation,
  onSaved,
}: {
  annotation: EditableAnnotation;
  onSaved: (id: string, patch: { comment: string | null; correction: string | null }) => void;
}) {
  const [comment, setComment] = useState(annotation.comment ?? '');
  const [correction, setCorrection] = useState(annotation.correction ?? '');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const dirty =
    comment !== (annotation.comment ?? '') || correction !== (annotation.correction ?? '');

  const save = async () => {
    setStatus('saving');
    setError(null);
    const patch = {
      comment: comment.trim() ? comment.trim() : null,
      correction: correction.trim() ? correction.trim() : null,
    };

    try {
      const res = await fetch(`${API_BASE}/api/annotations/${annotation.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Save failed (${res.status})`);
      }
      onSaved(annotation.id, patch);
      setStatus('saved');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  };

  const reset = () => {
    setComment(annotation.comment ?? '');
    setCorrection(annotation.correction ?? '');
    setStatus('idle');
    setError(null);
  };

  const field =
    'w-full rounded-lg border border-border bg-background px-2.5 py-2 text-xs text-foreground ' +
    'placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30 resize-y';

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Annotation note
        </span>
        <span className="text-[10px] text-muted-foreground">Printed on the exported PDF</span>
      </div>

      <label className="block space-y-1">
        <span className="text-[10px] font-semibold text-muted-foreground">Feedback</span>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={2}
          maxLength={2000}
          placeholder="What the student did here…"
          className={field}
        />
      </label>

      <label className="block space-y-1">
        <span className="text-[10px] font-semibold text-muted-foreground">Correction</span>
        <textarea
          value={correction}
          onChange={(e) => setCorrection(e.target.value)}
          rows={2}
          maxLength={2000}
          placeholder="What it should have said…"
          className={field}
        />
      </label>

      <div className="flex items-center gap-2">
        <button
          onClick={save}
          disabled={!dirty || status === 'saving'}
          className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:brightness-110 transition-all disabled:opacity-40 active:scale-[0.97]"
        >
          {status === 'saving' ? 'Saving…' : 'Save note'}
        </button>
        {dirty && (
          <button
            onClick={reset}
            className="px-3 py-1.5 rounded-lg border border-border text-muted-foreground text-xs font-semibold hover:bg-accent transition-all"
          >
            Cancel
          </button>
        )}
        {status === 'saved' && !dirty && (
          <span className="text-[11px] font-semibold text-success">Saved — marks unchanged</span>
        )}
        {status === 'error' && <span className="text-[11px] text-destructive">{error}</span>}
      </div>
    </div>
  );
}
