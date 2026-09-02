'use client';

import { useEffect, useRef, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export interface AnnotationCoords {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AnnotationOverlayProps extends AnnotationCoords {
  id: string;
  rubricResultId?: string | null;
  type: 'HIGHLIGHT' | 'BOX' | 'COMMENT';
  /** CORRECT / PARTIAL / INCORRECT / MISSING — drives the colour. */
  status?: string | null;
  label?: string | null;
  comment?: string | null;
  correction?: string | null;
  /**
   * Rendered px per PDF point. Stored coords are in PDF-point space, so without this the
   * boxes land wherever the raw numbers happen to fall.
   */
  scale: number;
  isSelected?: boolean;
  /** Another annotation is selected — fade back so the chosen one stands out. */
  isDimmed?: boolean;
  onSelect?: () => void;
  onUpdate?: (id: string, newCoords: AnnotationCoords) => void;
  onDelete?: (id: string) => void;
}

// Rubric points routinely cite the same sentences, so several boxes stack on one line.
// Fills are kept light — at heavier alpha the overlaps compound into an opaque slab and the
// student's words underneath stop being readable.
const STATUS_STYLES: Record<string, { box: string; dot: string }> = {
  CORRECT: { box: 'border-success/70 bg-success/[0.08]', dot: 'bg-success' },
  PARTIAL: { box: 'border-warning/70 bg-warning/[0.08]', dot: 'bg-warning' },
  INCORRECT: { box: 'border-destructive/70 bg-destructive/[0.08]', dot: 'bg-destructive' },
  MISSING: { box: 'border-muted-foreground/70 bg-muted-foreground/[0.08]', dot: 'bg-muted-foreground' },
};

const FALLBACK_STYLE = { box: 'border-primary/70 bg-primary/[0.08]', dot: 'bg-primary' };

export function AnnotationOverlay({
  id,
  x,
  y,
  width,
  height,
  type,
  status,
  label,
  comment,
  correction,
  scale,
  isSelected,
  isDimmed,
  onSelect,
  onUpdate,
  onDelete,
}: AnnotationOverlayProps) {
  // Position is owned by the parent, so there is no local copy to fall out of sync when a
  // re-grade replaces every annotation. Dragging pushes each step up via onUpdate.
  const coords: AnnotationCoords = { x, y, width, height };
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const dragStart = useRef({ mouseX: 0, mouseY: 0, x: 0, y: 0 });
  // Written by the move handler and read on mouseup, which would otherwise PATCH the
  // position captured when the drag began.
  const latestCoords = useRef(coords);

  // Listeners live on window, not the box: a drag faster than the render loop leaves the
  // element behind, and element-scoped handlers then miss the mouseup and stick.
  useEffect(() => {
    if (!isDragging) return;

    const onMove = (e: MouseEvent) => {
      const dx = (e.clientX - dragStart.current.mouseX) / scale;
      const dy = (e.clientY - dragStart.current.mouseY) / scale;
      const next = {
        ...latestCoords.current,
        x: Math.max(0, dragStart.current.x + dx),
        y: Math.max(0, dragStart.current.y + dy),
      };
      latestCoords.current = next;
      onUpdate?.(id, next);
    };

    const onUp = async () => {
      setIsDragging(false);
      try {
        await fetch(`${API_BASE}/api/annotations/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(latestCoords.current),
        });
      } catch (err) {
        console.error('Failed to update annotation overlay position:', err);
      }
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isDragging, scale, id, onUpdate]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onSelect?.();
    latestCoords.current = coords;
    dragStart.current = { mouseX: e.clientX, mouseY: e.clientY, x: coords.x, y: coords.y };
    setIsDragging(true);
  };

  const handleDeleteClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete?.(id);
    try {
      await fetch(`${API_BASE}/api/annotations/${id}`, { method: 'DELETE' });
    } catch (err) {
      console.error('Failed to delete annotation:', err);
    }
  };

  const style = STATUS_STYLES[status ?? ''] ?? FALLBACK_STYLE;
  const showDetail = (isSelected || isHovered) && (comment || correction);

  return (
    <div
      onMouseDown={handleMouseDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`absolute rounded-[3px] border ${style.box} ${
        type === 'HIGHLIGHT' ? '' : 'border-dashed'
      } ${isDragging ? 'cursor-grabbing' : 'cursor-grab'} ${
        isSelected
          ? 'ring-2 ring-primary ring-offset-1 ring-offset-card z-30'
          : isHovered
          ? 'z-20 brightness-125'
          : 'z-10'
      } ${isDimmed && !isHovered ? 'opacity-25' : 'opacity-100'} ${
        isDragging ? '' : 'transition-all duration-150'
      }`}
      style={{
        left: `${coords.x * scale}px`,
        top: `${coords.y * scale}px`,
        width: `${Math.max(coords.width * scale, 8)}px`,
        height: `${Math.max(coords.height * scale, 8)}px`,
      }}
    >
      {/* Marker sits outside the box so it never covers the student's words, and appears on
          demand only: rubric points routinely cite overlapping sentences, so always-on
          markers stack into an unreadable pile at the same coordinates. */}
      {label && (isSelected || isHovered) && (
        <span
          className={`absolute -left-1.5 -top-2 z-10 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold text-white shadow-sm ${style.dot}`}
        >
          {label}
        </span>
      )}

      {isSelected && (
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={handleDeleteClick}
          title="Delete annotation"
          className="absolute -right-2 -top-2 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground shadow hover:brightness-110"
        >
          ✕
        </button>
      )}

      {showDetail && (
        <div className="pointer-events-none absolute left-0 top-full z-40 mt-1.5 w-max max-w-xs rounded-lg border border-border bg-popover p-2.5 text-[11px] leading-relaxed shadow-xl">
          {comment && (
            <p className="text-popover-foreground">
              <span className="font-bold uppercase tracking-wide text-muted-foreground">Feedback </span>
              {comment}
            </p>
          )}
          {correction && (
            <p className={comment ? 'mt-1.5 border-t border-border pt-1.5' : ''}>
              <span className="font-bold uppercase tracking-wide text-warning">Correction </span>
              <span className="text-popover-foreground">{correction}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
