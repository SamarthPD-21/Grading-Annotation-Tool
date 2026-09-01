'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

function DropZone({
  label,
  sublabel,
  icon,
  file,
  onFile,
  required,
}: {
  label: string;
  sublabel: string;
  icon: React.ReactNode;
  file: File | null;
  onFile: (f: File | null) => void;
  required?: boolean;
}) {
  const [dragOver, setDragOver] = useState(false);
  const inputId = `file-${label.replace(/\s/g, '-').toLowerCase()}`;

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files?.[0];
      if (f && f.type === 'application/pdf') onFile(f);
    },
    [onFile]
  );

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className={`relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-6 text-center transition-all cursor-pointer
        ${dragOver ? 'border-primary bg-primary/5 scale-[1.01]' : required ? 'border-primary/30 bg-primary/[0.02]' : 'border-border bg-card hover:border-border/80'}
        ${file ? 'border-success/40 bg-success/[0.03]' : ''}`}
    >
      <input
        type="file"
        id={inputId}
        accept="application/pdf"
        className="absolute inset-0 opacity-0 cursor-pointer"
        onChange={(e) => onFile(e.target.files?.[0] || null)}
      />
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${file ? 'bg-success/10 text-success' : required ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
        {file ? (
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        ) : icon}
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">{label}{required && <span className="text-destructive ml-0.5">*</span>}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">{file ? file.name : sublabel}</p>
      </div>
    </div>
  );
}

export function UploadForm() {
  const router = useRouter();
  const [paperName, setPaperName] = useState('');
  const [questionFile, setQuestionFile] = useState<File | null>(null);
  const [rubricFile, setRubricFile] = useState<File | null>(null);
  const [studentFile, setStudentFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [step, setStep] = useState('');
  const [error, setError] = useState('');

  const handleQuestionFileSelect = (f: File | null) => {
    setQuestionFile(f);
    if (f && !paperName) {
      const cleanName = f.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' ');
      setPaperName(cleanName);
    }
  };

  const handleStudentFileSelect = (f: File | null) => {
    setStudentFile(f);
    if (f && !paperName) {
      const cleanName = f.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' ');
      setPaperName(cleanName);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentFile) { setError('Student answer PDF is required'); return; }
    // Grading is only meaningful against a real marking scheme — without one there is
    // nothing to mark the answer against.
    if (!rubricFile) { setError('Model answer / rubric PDF is required — it defines what the answer is marked against'); return; }

    const effectiveName = paperName.trim() || (questionFile?.name || studentFile.name).replace(/\.[^/.]+$/, '').replace(/_/g, ' ');

    try {
      setIsSubmitting(true);
      setError('');
      setStep('Reading question paper & rubric…');

      const paperFormData = new FormData();
      paperFormData.append('name', effectiveName);
      if (questionFile) paperFormData.append('questionFile', questionFile);
      if (rubricFile) paperFormData.append('rubricFile', rubricFile);

      const paperRes = await fetch(`${API_BASE}/api/papers`, { method: 'POST', body: paperFormData });
      if (!paperRes.ok) {
        // The server explains exactly why a rubric could not be read; show that instead of
        // a generic failure the user cannot act on.
        const body = await paperRes.json().catch(() => ({}));
        throw new Error(body.error || `Failed to read the question paper and rubric (${paperRes.status})`);
      }
      const { paperId } = await paperRes.json();

      setStep('Uploading student answer…');
      const subForm = new FormData();
      subForm.append('paperId', paperId);
      subForm.append('studentFile', studentFile);

      const subRes = await fetch(`${API_BASE}/api/submissions`, { method: 'POST', body: subForm });
      if (!subRes.ok) {
        const body = await subRes.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to create submission');
      }
      const { submissionId } = await subRes.json();

      setStep('Starting AI grading…');
      const gradeRes = await fetch(`${API_BASE}/api/submissions/${submissionId}/grade`, { method: 'POST' });
      if (!gradeRes.ok) throw new Error('Failed to queue grading');

      router.push(`/submissions/${submissionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      setIsSubmitting(false);
      setStep('');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm font-medium animate-fade-in">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
          {error}
        </div>
      )}

      {step && (
        <div className="flex items-center gap-2.5 p-3 rounded-lg bg-primary/5 border border-primary/15 text-primary text-sm font-medium animate-fade-in">
          <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin shrink-0" />
          {step}
        </div>
      )}

      <div>
        <label htmlFor="paper-name" className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Assessment Name</label>
        <input
          id="paper-name"
          type="text"
          value={paperName}
          onChange={(e) => setPaperName(e.target.value)}
          placeholder="e.g. Biology Midterm Exam 2026 (Auto-filled from file if blank)"
          className="w-full px-3.5 py-2 rounded-lg border border-input bg-card text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring/40 transition"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <DropZone
          label="Question Paper"
          sublabel="Drop PDF or click to select"
          icon={<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>}
          file={questionFile}
          onFile={handleQuestionFileSelect}
        />
        <DropZone
          label="Model Answer / Rubric"
          sublabel="Required — defines the marking scheme"
          icon={<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>}
          file={rubricFile}
          onFile={setRubricFile}
          required
        />
        <DropZone
          label="Student Answer"
          sublabel="Required — Drop PDF or click"
          icon={<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>}
          file={studentFile}
          onFile={handleStudentFileSelect}
          required
        />
      </div>

      <div className="flex justify-end pt-2">
        <button
          type="submit"
          disabled={isSubmitting || !studentFile || !rubricFile}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold shadow-sm shadow-primary/20 hover:shadow-md hover:shadow-primary/30 hover:brightness-110 transition-all active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
        >
          {isSubmitting ? (
            <>
              <div className="w-4 h-4 rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground animate-spin" />
              Processing…
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              Start Grading
            </>
          )}
        </button>
      </div>
    </form>
  );
}
