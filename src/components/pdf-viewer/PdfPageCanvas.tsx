'use client';

import { useEffect, useRef, useState } from 'react';

export interface PdfPageCanvasProps {
  fileUrl: string;
  pageNumber: number;
  /** CSS pixels available for the page; the page is scaled to fit this width. */
  containerWidth: number;
  /**
   * Reports the rendered geometry so overlays can convert PDF points to CSS pixels.
   * `scale` is renderedWidth / pageWidthInPoints.
   */
  onRendered: (info: { scale: number; width: number; height: number; pageCount: number }) => void;
  onError: (message: string) => void;
}

type PdfDocument = {
  numPages: number;
  getPage: (n: number) => Promise<PdfPage>;
  destroy: () => Promise<void>;
};

type PdfPage = {
  getViewport: (opts: { scale: number }) => { width: number; height: number };
  render: (opts: {
    canvasContext: CanvasRenderingContext2D;
    viewport: { width: number; height: number };
  }) => { promise: Promise<void>; cancel: () => void };
};

let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null;

/** Loaded once per tab; the worker is served from public/ by scripts/copy-pdf-worker.mjs. */
function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist').then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
      return lib;
    });
  }
  return pdfjsPromise;
}

/**
 * Renders one page of the real student PDF to a canvas.
 *
 * The viewer used to draw the extracted text instead. Annotation coordinates come from the
 * PDF's own coordinate space, so on a re-flowed text layout the boxes landed on unrelated
 * content — they were painted over the question prompts rather than the student's words.
 * Rendering the actual page is what makes those coordinates mean something, and it makes
 * the on-screen view match the exported PDF.
 */
export function PdfPageCanvas({
  fileUrl,
  pageNumber,
  containerWidth,
  onRendered,
  onError,
}: PdfPageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const docRef = useRef<PdfDocument | null>(null);
  const [isRendering, setIsRendering] = useState(true);

  // Kept in refs so re-renders caused by the callbacks themselves do not reload the document.
  const onRenderedRef = useRef(onRendered);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onRenderedRef.current = onRendered;
    onErrorRef.current = onError;
  });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const pdfjs = await loadPdfjs();
        const doc = (await pdfjs.getDocument({ url: fileUrl }).promise) as unknown as PdfDocument;
        if (cancelled) {
          await doc.destroy();
          return;
        }
        docRef.current = doc;
      } catch (err) {
        if (!cancelled) {
          onErrorRef.current(err instanceof Error ? err.message : 'Could not open the PDF');
        }
      }
    })();

    return () => {
      cancelled = true;
      docRef.current?.destroy().catch(() => {});
      docRef.current = null;
    };
  }, [fileUrl]);

  useEffect(() => {
    if (!containerWidth) return;

    let cancelled = false;
    let task: { promise: Promise<void>; cancel: () => void } | null = null;

    (async () => {
      // The document load above may still be in flight on the first pass.
      for (let i = 0; i < 100 && !docRef.current && !cancelled; i++) {
        await new Promise((r) => setTimeout(r, 50));
      }
      const doc = docRef.current;
      const canvas = canvasRef.current;
      if (cancelled || !doc || !canvas) return;

      try {
        setIsRendering(true);
        const page = await doc.getPage(Math.min(pageNumber, doc.numPages));
        if (cancelled) return;

        const base = page.getViewport({ scale: 1 });
        const scale = containerWidth / base.width;
        const viewport = page.getViewport({ scale });

        // Render at device resolution, then size down in CSS so text stays sharp.
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, viewport.width, viewport.height);

        task = page.render({ canvasContext: ctx, viewport });
        await task.promise;
        if (cancelled) return;

        onRenderedRef.current({
          scale,
          width: viewport.width,
          height: viewport.height,
          pageCount: doc.numPages,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // A cancelled render is expected when the page or width changes mid-flight.
        if (!cancelled && !/cancel/i.test(message)) {
          onErrorRef.current(message);
        }
      } finally {
        if (!cancelled) setIsRendering(false);
      }
    })();

    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pageNumber, containerWidth, fileUrl]);

  return (
    <>
      <canvas ref={canvasRef} className="block rounded-md" />
      {isRendering && (
        <div className="absolute inset-0 flex items-center justify-center bg-card/60">
          <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      )}
    </>
  );
}
