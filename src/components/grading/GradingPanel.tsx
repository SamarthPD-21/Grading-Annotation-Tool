'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { FallbackNotice, PipelineFailureNotice } from './PipelineNotice';
import { AnnotationEditor } from './AnnotationEditor';

interface ExtractedPage {
  pageNumber: number;
  text: string;
  width: number;
  height: number;
}
import { RubricSidebar } from '../rubric/RubricSidebar';
import { AnnotationOverlay } from '../pdf-viewer/AnnotationOverlay';
import { PdfPageCanvas } from '../pdf-viewer/PdfPageCanvas';
import { StatusProgress } from './StatusProgress';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export interface GradingPanelProps {
  submission: {
    id: string;
    status: string;
    totalMarks: number | null;
    maxMarks: number | null;
    studentFile: string;
    errorCode: string | null;
    errorMessage: string | null;
    errorDetail?: string | null;
    paper: {
      name: string;
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
    };
    gradingRuns: {
      id: string;
      totalMarks: number | null;
      maxMarks: number | null;
      model?: string;
      provider?: string | null;
      fallbackUsed?: boolean;
      results: {
        id: string;
        rubricPointId: string;
        status: 'CORRECT' | 'PARTIAL' | 'INCORRECT' | 'MISSING';
        marksAwarded: number;
        evidenceText: string | null;
        evidencePage: number | null;
        feedback: string | null;
        correction: string | null;
        confidence: number;
        humanReview: boolean;
      }[];
    }[];
    annotations: {
      id: string;
      rubricResultId: string | null;
      page: number;
      x: number;
      y: number;
      width: number;
      height: number;
      type: 'HIGHLIGHT' | 'BOX' | 'COMMENT';
      comment: string | null;
      correction: string | null;
    }[];
  };
}

function ScoreRing({ total, max }: { total: number; max: number }) {
  const pct = max > 0 ? (total / max) * 100 : 0;
  const r = 28;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  const color = pct >= 70 ? 'var(--success)' : pct >= 40 ? 'var(--warning)' : 'var(--destructive)';

  return (
    <div className="relative w-16 h-16 flex items-center justify-center shrink-0">
      <svg width="64" height="64" viewBox="0 0 64 64" className="-rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" stroke="var(--border)" strokeWidth="4" />
        <circle
          cx="32" cy="32" r={r} fill="none"
          stroke={color} strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-sm font-extrabold tabular-nums text-foreground">{total}</span>
        <span className="text-[9px] text-muted-foreground font-medium">/{max}</span>
      </div>
    </div>
  );
}

export function GradingPanel({ submission: initialSubmission }: GradingPanelProps) {
  const [submission, setSubmission] = useState(initialSubmission);
  const [selectedRubricId, setSelectedRubricId] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState(initialSubmission.annotations);
  const [isRegrading, setIsRegrading] = useState(false);
  const [extractedPages, setExtractedPages] = useState<ExtractedPage[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoadingText, setIsLoadingText] = useState(true);
  const [missingFile, setMissingFile] = useState(false);
  const [mobileTab, setMobileTab] = useState<'rubric' | 'canvas'>('canvas');
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  // Rendered page geometry, reported by the canvas once pdf.js has drawn the page.
  const [pageRender, setPageRender] = useState<{ scale: number; pageCount: number } | null>(null);
  // Rendered width of the page sheet, measured so PDF-point coords can be scaled to px.
  const pageRef = useRef<HTMLDivElement | null>(null);
  const [renderedWidth, setRenderedWidth] = useState(0);

  const latestRun = submission.gradingRuns?.[0];
  const selectedResult = latestRun?.results?.find((r) => r.rubricPointId === selectedRubricId);
  const resultById = useMemo(
    () => new Map((latestRun?.results ?? []).map((r) => [r.id, r])),
    [latestRun]
  );
  // Stable "Q1.2"-style labels so a box on the page ties back to a sidebar row.
  const labelByResultId = useMemo(() => {
    const map = new Map<string, string>();
    for (const q of submission.paper?.questions ?? []) {
      q.rubricPoints.forEach((rp, i) => {
        const res = latestRun?.results?.find((r) => r.rubricPointId === rp.id);
        if (res) map.set(res.id, `${q.number}.${i + 1}`);
      });
    }
    return map;
  }, [submission.paper, latestRun]);

  // Poll for status updates if submission is in progress
  const isProcessing = ['UPLOADED', 'EXTRACTING', 'GRADING', 'VALIDATING', 'ANNOTATING'].includes(submission.status);

  const fetchSubmissionData = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/submissions/${submission.id}`);
      if (res.ok) {
        const updated = await res.json();
        setSubmission(updated);
        if (updated.annotations) setAnnotations(updated.annotations);
      }
    } catch (err) {
      console.error('Failed to poll submission status:', err);
    }
  }, [submission.id]);

  useEffect(() => {
    if (!isProcessing) return;
    const interval = setInterval(fetchSubmissionData, 3000);
    return () => clearInterval(interval);
  }, [isProcessing, fetchSubmissionData]);

  // Fetch extracted PDF text for dynamic rendering
  useEffect(() => {
    async function loadExtractedText() {
      try {
        setIsLoadingText(true);
        const res = await fetch(`${API_BASE}/api/submissions/${submission.id}/text`);
        if (res.ok) {
          const data = await res.json();
          setMissingFile(!!data.missingFile);
          if (data.pages && data.pages.length > 0) {
            setExtractedPages(data.pages);
          }
        }
      } catch (err) {
        console.error('Failed to load extracted PDF text:', err);
      } finally {
        setIsLoadingText(false);
      }
    }
    loadExtractedText();
  }, [submission.id]);

  const handleReGrade = async () => {
    try {
      setIsRegrading(true);
      await fetch(`${API_BASE}/api/submissions/${submission.id}/grade`, { method: 'POST' });
      await fetchSubmissionData();
    } catch (err) {
      console.error('Failed to trigger re-grade:', err);
    } finally {
      setIsRegrading(false);
    }
  };

  // Fetched rather than window.open'd so a failure surfaces in the UI instead of dumping a
  // JSON error blob into a new tab (or being swallowed by a popup blocker).
  const handleExportClick = async () => {
    setExportError(null);
    setIsExporting(true);
    try {
      const res = await fetch(`${API_BASE}/api/submissions/${submission.id}/export`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Export failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `annotated-${submission.id.slice(-8)}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  const activePage = extractedPages.find((p) => p.pageNumber === currentPage);
  const activePageText = activePage?.text || '';

  // The canvas reports the true renderedWidth / pageWidthInPoints ratio once it has drawn
  // the page. Anything derived from the text layout would be a guess.
  const scale = pageRender?.scale ?? 1;
  const canRenderPdf = !missingFile && !pdfError;
  const pageCount = pageRender?.pageCount ?? extractedPages.length ?? 1;

  const handlePageRendered = useCallback(
    (info: { scale: number; pageCount: number }) => {
      setPageRender((prev) =>
        prev && prev.scale === info.scale && prev.pageCount === info.pageCount ? prev : info
      );
    },
    []
  );

  useEffect(() => {
    const el = pageRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setRenderedWidth(entry.contentRect.width));
    observer.observe(el);
    setRenderedWidth(el.clientWidth);
    return () => observer.disconnect();
  }, [isLoadingText]);

  // Jump to the page an annotation lives on when its rubric row is selected, otherwise
  // selecting a point on page 3 silently highlights nothing.
  const selectRubricPoint = useCallback(
    (rubricPointId: string) => {
      setSelectedRubricId(rubricPointId);
      setMobileTab('canvas');
      const result = latestRun?.results?.find((r) => r.rubricPointId === rubricPointId);
      const annot = result && annotations.find((a) => a.rubricResultId === result.id);
      if (annot?.page) setCurrentPage(annot.page);
    },
    [latestRun, annotations]
  );

  const selectedAnnotation = selectedResult
    ? annotations.find((a) => a.rubricResultId === selectedResult.id) ?? null
    : null;

  const annotationsOnPage = annotations.filter((a) => (a.page || 1) === currentPage);
  const annotationsElsewhere = annotations.length - annotationsOnPage.length;

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Top Header Card */}
      <div className="rounded-xl border border-border bg-card p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            {submission.paper?.name || 'Assessment'}
          </p>
          <h1 className="text-xl font-extrabold tracking-tight text-foreground mt-1">
            Evaluation <span className="font-mono text-muted-foreground text-base">#{submission.id.slice(-6)}</span>
          </h1>
          <StatusProgress status={submission.status} errorCode={submission.errorCode} />
        </div>

        <div className="flex flex-wrap items-center gap-3 sm:gap-4 shrink-0">
          {submission.totalMarks !== null && submission.maxMarks !== null && (
            <ScoreRing total={submission.totalMarks} max={submission.maxMarks} />
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={handleReGrade}
              disabled={isRegrading || isProcessing}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-card text-foreground text-xs font-semibold hover:bg-accent transition-all disabled:opacity-40"
              title="Re-run AI evaluation pipeline"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={isRegrading || isProcessing ? 'animate-spin' : ''}><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>
              {isProcessing ? 'Grading…' : 'Re-Grade'}
            </button>

            <button
              onClick={handleExportClick}
              disabled={isExporting}
              title="Download an annotated copy with a marks summary"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold shadow-sm shadow-primary/20 hover:shadow-md hover:shadow-primary/30 hover:brightness-110 transition-all active:scale-[0.97] cursor-pointer disabled:opacity-50"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
              {isExporting ? 'Exporting…' : 'Export PDF'}
            </button>
          </div>

          {exportError && (
            <p className="w-full text-right text-[11px] text-destructive">{exportError}</p>
          )}
        </div>
      </div>

      {/* A failed run keeps whatever the last successful run produced, rather than
          replacing the whole page with an error. */}
      {submission.errorMessage && (
        <PipelineFailureNotice
          errorCode={submission.errorCode}
          errorMessage={submission.errorMessage}
          errorDetail={submission.errorDetail}
          hasPreviousResults={(latestRun?.results?.length ?? 0) > 0}
          onReGrade={handleReGrade}
          isReGrading={isRegrading || isProcessing}
        />
      )}

      {/* The run succeeded, but not on the model we asked for — say so. */}
      {!submission.errorMessage && latestRun?.fallbackUsed && (
        <FallbackNotice
          provider={latestRun.provider}
          model={latestRun.model ?? 'unknown model'}
          onReGrade={handleReGrade}
          isReGrading={isRegrading || isProcessing}
        />
      )}

      {/* Mobile Tab Toggle */}
      <div className="lg:hidden flex border-b border-border">
        <button
          onClick={() => setMobileTab('canvas')}
          className={`flex-1 py-2.5 text-xs font-semibold border-b-2 text-center transition-colors ${
            mobileTab === 'canvas' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'
          }`}
        >
          📄 Student Canvas
        </button>
        <button
          onClick={() => setMobileTab('rubric')}
          className={`flex-1 py-2.5 text-xs font-semibold border-b-2 text-center transition-colors ${
            mobileTab === 'rubric' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'
          }`}
        >
          📋 Rubric Evaluation ({latestRun?.results?.length || 0})
        </button>
      </div>

      {/* Main Split Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Rubric Sidebar */}
        <div className={`lg:col-span-4 rounded-xl border border-border bg-card p-4 sm:p-5 ${mobileTab === 'rubric' ? 'block' : 'hidden lg:block'}`}>
          <RubricSidebar
            questions={submission.paper?.questions || []}
            results={latestRun?.results || []}
            selectedRubricPointId={selectedRubricId}
            onSelectRubricPoint={selectRubricPoint}
            isGraded={(latestRun?.results?.length ?? 0) > 0}
          />
        </div>

        {/* Right: PDF Workspace */}
        <div className={`lg:col-span-8 space-y-5 ${mobileTab === 'canvas' ? 'block' : 'hidden lg:block'}`}>
          {/* Document Canvas */}
          <div className="rounded-xl border border-border bg-background p-4 sm:p-5 min-h-[500px] relative overflow-hidden">
            <div className="w-full flex items-center justify-between gap-3 text-[10px] text-muted-foreground mb-4 pb-2 border-b border-border">
              <span className="font-semibold uppercase tracking-wider shrink-0">Student Answer Canvas</span>

              {/* Page Controls — always shown, so the page count is visible even for a
                  single-page document. */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="px-1.5 rounded hover:bg-accent disabled:opacity-30 disabled:hover:bg-transparent"
                  aria-label="Previous page"
                >
                  ◀
                </button>
                <span className="font-mono text-foreground font-medium tabular-nums">
                  Page {currentPage} of {pageCount}
                </span>
                <button
                  disabled={currentPage >= pageCount}
                  onClick={() => setCurrentPage((p) => Math.min(pageCount, p + 1))}
                  className="px-1.5 rounded hover:bg-accent disabled:opacity-30 disabled:hover:bg-transparent"
                  aria-label="Next page"
                >
                  ▶
                </button>
              </div>

              <span className="hidden sm:flex items-center gap-2 shrink-0">
                {annotationsOnPage.length > 0 && (
                  <span className="font-semibold text-foreground tabular-nums">
                    {annotationsOnPage.length} on this page
                  </span>
                )}
                {annotationsElsewhere > 0 && (
                  <span className="tabular-nums">+{annotationsElsewhere} elsewhere</span>
                )}
                <span className="text-muted-foreground/70">Drag to reposition</span>
              </span>
            </div>

            {/* The rendered PDF page. Overlays are positioned against this element, so its
                width is what defines the PDF-point -> px scale. */}
            <div className="w-full max-w-2xl mx-auto">
              <div className="flex justify-between items-center text-[10px] text-muted-foreground font-mono mb-1.5 px-0.5">
                <span>Page {currentPage}</span>
                <span>#{submission.id.slice(-8)}</span>
              </div>

              <div
                ref={pageRef}
                className="relative w-full bg-card rounded-lg shadow-lg border border-border overflow-hidden"
                onMouseDown={() => setSelectedRubricId(null)}
              >
                {canRenderPdf ? (
                  <PdfPageCanvas
                    fileUrl={`${API_BASE}/api/submissions/${submission.id}/file`}
                    pageNumber={currentPage}
                    containerWidth={renderedWidth}
                    onRendered={handlePageRendered}
                    onError={setPdfError}
                  />
                ) : (
                  /* Text fallback. Overlays are deliberately NOT drawn here: their
                     coordinates describe the PDF page, and on re-flowed text they would
                     point at whatever happens to sit at those offsets. */
                  <div className="p-5 sm:p-6 min-h-[420px] text-xs sm:text-sm leading-relaxed">
                    {isLoadingText ? (
                      <div className="space-y-3 py-4" aria-label="Loading document">
                        {[...Array(8)].map((_, i) => (
                          <div
                            key={i}
                            className="h-3 rounded animate-shimmer"
                            style={{ width: `${[95, 88, 92, 70, 96, 84, 90, 55][i]}%` }}
                          />
                        ))}
                      </div>
                    ) : activePageText ? (
                      <>
                        <p className="mb-3 text-[11px] text-warning">
                          Showing extracted text because the PDF could not be displayed
                          {pdfError ? ` (${pdfError})` : ''}. Evidence highlights are hidden
                          here — open the exported PDF to see them in place.
                        </p>
                        <div className="whitespace-pre-wrap font-sans text-muted-foreground">
                          {activePageText}
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-16 text-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground/50"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>
                        <p className="text-xs font-semibold text-foreground">
                          {missingFile ? 'Original PDF is not on disk' : 'Nothing to display'}
                        </p>
                        <p className="text-[11px] text-muted-foreground max-w-xs">
                          {missingFile
                            ? 'The upload could not be found, so the answer and its highlights cannot be shown.'
                            : 'This page has no extractable text — it may be a scan or an image.'}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Evidence overlays, only over the real page where the coordinates hold. */}
                {canRenderPdf &&
                  annotationsOnPage.map((annot) => {
                  const result = annot.rubricResultId ? resultById.get(annot.rubricResultId) : undefined;
                  return (
                    <AnnotationOverlay
                      key={annot.id}
                      id={annot.id}
                      rubricResultId={annot.rubricResultId}
                      x={annot.x}
                      y={annot.y}
                      width={annot.width}
                      height={annot.height}
                      type={annot.type}
                      status={result?.status}
                      label={result ? labelByResultId.get(result.id) : null}
                      comment={annot.comment}
                      correction={annot.correction}
                      scale={scale}
                      isSelected={selectedResult ? annot.rubricResultId === selectedResult.id : false}
                      onSelect={() => {
                        if (result) setSelectedRubricId(result.rubricPointId);
                      }}
                      onUpdate={(id, newCoords) => {
                        setAnnotations((prev) =>
                          prev.map((a) => (a.id === id ? { ...a, ...newCoords } : a))
                        );
                      }}
                      onDelete={(id) => {
                        setAnnotations((prev) => prev.filter((a) => a.id !== id));
                      }}
                      />
                    );
                  })}
              </div>
            </div>
          </div>

          {/* Feedback Detail Card */}
          {selectedResult && (
            <div className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-4 animate-fade-in">
              <div className="flex items-center justify-between pb-3 border-b border-border">
                <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
                  Feedback Detail
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-primary/10 text-primary font-semibold tabular-nums">
                    {(selectedResult.confidence * 100).toFixed(0)}% confidence
                  </span>
                </h3>
                {selectedResult.humanReview && (
                  <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-warning/10 text-warning">
                    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>
                    Flagged for Review
                  </span>
                )}
              </div>

              {selectedResult.evidenceText && (
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">Evidence</div>
                  <blockquote className="p-3 bg-muted/50 rounded-lg border-l-2 border-primary text-xs font-mono italic text-foreground/80">
                    &ldquo;{selectedResult.evidenceText}&rdquo;
                  </blockquote>
                  {!annotations.some((a) => a.rubricResultId === selectedResult.id) && (
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      This quote could not be matched to a position in the document, so it has no
                      box on the page.
                    </p>
                  )}
                </div>
              )}

              {selectedResult.feedback && (
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">AI Explanation</div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {selectedResult.feedback}
                  </p>
                </div>
              )}

              {selectedAnnotation && (
                <AnnotationEditor
                  key={selectedAnnotation.id}
                  annotation={selectedAnnotation}
                  onSaved={(id, patch) =>
                    setAnnotations((prev) =>
                      prev.map((a) => (a.id === id ? { ...a, ...patch } : a))
                    )
                  }
                />
              )}

              {selectedResult.correction && (
                <div className="p-3 bg-destructive/5 rounded-lg border border-destructive/15 text-xs">
                  <span className="font-bold text-destructive">Suggested Correction: </span>
                  <span className="text-foreground/80">{selectedResult.correction}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
