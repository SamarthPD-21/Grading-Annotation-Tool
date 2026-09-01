import { UploadForm } from '@/components/upload/UploadForm';

export default function UploadPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-foreground">New Submission</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Upload the question paper, rubric, and student answer to start AI-powered evaluation.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <UploadForm />
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0 mt-0.5">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/></svg>
          </div>
          <div>
            <p className="text-xs font-semibold text-foreground">Security &amp; Privacy</p>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
              All uploads are validated server-side. PDFs are stored locally and never shared. Rate limiting and input sanitization protect against abuse. Original files remain read-only; annotations are generated as separate documents.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
