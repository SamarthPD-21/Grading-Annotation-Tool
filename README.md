# GradeSense — AI-Powered Assessment & Annotation System

GradeSense is a Next.js 16 modular monolith designed for evaluating student answer papers against structured question rubrics. It performs per-rubric grading with evidence extraction, deterministic score calculation, interactive client-side annotation editing, and exportable PDF output.

---

## 1. Stack Overview

- **Frontend**: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4
- **PDF Engine**: PDF.js (text/coordinate extraction & canvas rendering), `pdf-lib` (annotated PDF generation)
- **Backend & Database**: Express API + Next.js Route Handlers, Zod, Prisma ORM, SQLite
- **AI Engine**: Google Gemini / Gemma with OpenAI-compatible Structured Outputs, ordered provider fallback (OpenAI optional)
- **Async Processing**: BullMQ & ioredis (with fallback `LocalGradingDispatcher`)
- **Testing**: Vitest & Playwright

---

## 2. Key Architecture Decisions

### A. Modular Monolith Design
The web application, API route handlers, business services, and asynchronous queue workers share a single TypeScript codebase and repository.

```
Express API (src/server) + Next.js handlers
           │
     Service Layer (src/services/*)
           │
  ┌────────┴────────┐
  ▼                 ▼
Prisma ORM     LLM & PDF Pipelines (src/lib/*)
 (SQLite)           │
                    ▼
        Provider chain: gemma → gemini → openai
```

### A2. The Rubric Comes From the Upload, Not From Code
`POST /api/papers` reads the uploaded question paper and marking-rubric PDFs, and asks the
model to turn them into `Question` and `RubricPoint` rows (`src/services/paper.service.ts`).
Each point keeps its model answer in `RubricPoint.expected`, which is what grading compares
the student's words against.

If the documents cannot be read the upload **fails with a 422**. Substituting a placeholder
rubric would silently mark every student against the wrong scheme while looking like it
worked, so a paper is never created without a real marking scheme behind it.

### A3. Provider Chain With Visible Fallback
Grading walks `LLM_PROVIDER_CHAIN` in order, falling through on quota, auth, availability
and model errors, and stepping down a structured-output ladder (`json_schema` →
`json_object` → plain JSON) within each provider. The run records which provider and model
actually answered (`GradingRun.provider`, `.model`, `.fallbackUsed`), the UI says so, and a
fallback-graded paper is flagged for human review. When every provider fails, the
per-provider breakdown is stored as JSON on `Submission.errorDetail` and rendered as a list
rather than one opaque string.

### B. LLM Interprets, Code Calculates
The LLM is responsible for semantic classification against rubric points (CORRECT, PARTIAL, INCORRECT, MISSING), providing feedback, and identifying text evidence. **It does NOT determine the authoritative final score.** The application server calculates the total score deterministically from individual validated rubric marks.

### C. Two-Layer Grading Firewall
All model outputs pass through a two-layer validation firewall before persisting:
1. **Schema Validation**: Zod schema (`GradingResultSchema`) enforces type safety and strict JSON structure.
2. **Business Validation**: `validateGradingResult()` enforces:
   - All returned rubric IDs match existing paper rubrics.
   - Awarded marks fall strictly within allowed bounds `[0, maxMarks]`.
   - Total marks do not exceed paper maximum.

### D. Deterministic Evidence Location
Bounding box coordinates for PDF overlays are computed deterministically by searching extracted text items (`TextItem[]`) rather than asking the LLM to guess PDF coordinates.

### D1. Scanned and Handwritten Answers
A photographed or scanned answer has no embedded text layer, so `getTextContent()` returns
nothing. Extraction therefore checks the page's operator list for image painting, which
separates the two cases that both yield no text:

| Page | Text | Images | Handling |
| --- | --- | --- | --- |
| Normal PDF | yes | – | Graded from the text layer, with evidence boxes |
| Scan / photo | no | yes | Transcribed by a vision model, then graded |
| Genuinely blank | no | no | Graded as a blank answer |

The scan path (`src/lib/llm/vision.ts`) sends the PDF whole to Gemini, which rasterises it
itself — that avoids pulling in a native canvas dependency purely to turn pages into images.
The transcription prompt preserves the student's own spelling and grammar rather than
tidying it, since those mistakes are frequently what is being marked.

**A transcribed run is never presented as equivalent.** It yields words but no coordinates,
so no evidence can be located on the page. `GradingRun.textSource` records `'ocr'`,
`transcribedBy` records the model, every rubric point is flagged for human review, and the
UI says the marks came from a transcription. Without that, an un-annotated run would be
indistinguishable from one where evidence simply was not found.

Before this, a scan was graded on the string `"--- Page 1 ---"` — the only content in an
empty text layer — and produced a confident zero.

### D2. The Viewer Renders the Real PDF
Evidence boxes are stored in the PDF's own coordinate space, so the viewer renders the actual
page with pdf.js (`src/components/pdf-viewer/PdfPageCanvas.tsx`) and scales overlays by
`renderedWidth / pageWidthInPoints`. It previously drew re-flowed extracted text, where those
coordinates pointed at unrelated content — highlights landed on the question prompts instead
of the student's words, and the screen disagreed with the exported PDF.

The original file is streamed read-only by `GET /api/submissions/:id/file`. pdf.js needs its
worker as a static asset, copied to `public/pdf.worker.min.mjs` by
`scripts/copy-pdf-worker.mjs` on `postinstall` so it can never drift from the installed
`pdfjs-dist` version. If the page cannot be rendered the viewer falls back to extracted text
and **hides the overlays**, because a box in the wrong place is worse than no box.

### E. Immutability of Original Files
Uploaded student answer PDFs are read-only. The annotated copy is written separately to
`./uploads/generated/annotated-{submissionId}.pdf`, and carries the evidence boxes, the
feedback and correction beside each box, and an appended marks summary. It is regenerated on
every export, so edited annotations are always reflected. Covered by
`tests/grading/annotate-export.test.ts`, which asserts the original is byte-identical
afterwards.

### E1. The Marked Page Carries Markers, the Report Carries the Words
Each evidence box is labelled with its rubric number (`1.2`) in the page margin, and nothing
else. Feedback and corrections used to be written beside every box, which buried the
student's own work under marker commentary; they now appear once, in the report, under the
question they belong to.

Because the page no longer shows note text, the report reads an edited annotation's
`comment`/`correction` in preference to the grading model's original wording — otherwise a
marker's edit would have nowhere left to appear in the export.

### E2. Annotations Stay Editable Without Re-Grading
Boxes can be dragged, their feedback/correction text edited, and individual annotations
deleted — all persisted through `PATCH`/`DELETE /api/annotations/:id`, none of which re-runs
grading or changes the marks. The PATCH body is whitelisted to geometry and note text
(`parseAnnotationPatch`), so a client cannot reassign an annotation to another submission.

### F. CAP Theorem Strategy
GradeSense favors **consistency (CP)** for authoritative grading state. UI progress indicators are eventually consistent, but conflicting or corrupt grading writes are strictly prevented via Prisma `$transaction` boundaries.

---

## 3. Folder Structure

```
grade_sense/
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── upload/page.tsx
│   │   ├── submissions/
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx
│   │   └── api/
│   │       ├── papers/route.ts
│   │       ├── submissions/
│   │       │   ├── route.ts
│   │       │   ├── [id]/route.ts
│   │       │   ├── [id]/grade/route.ts
│   │       │   └── [id]/export/route.ts
│   │       └── annotations/[id]/route.ts
│   ├── components/
│   │   ├── ui/header.tsx
│   │   ├── upload/UploadForm.tsx
│   │   ├── pdf-viewer/AnnotationOverlay.tsx
│   │   ├── rubric/RubricSidebar.tsx
│   │   └── grading/GradingPanel.tsx
│   ├── lib/
│   │   ├── db/prisma.ts
│   │   ├── llm/ (client.ts, prompt.ts, schema.ts)
│   │   ├── pdf/ (extract.ts, coordinates.ts, annotate.ts)
│   │   ├── grading/ (grade.ts, validate.ts, scoring.ts, confidence.ts)
│   │   ├── queue/ (connection.ts, grading.ts)
│   │   └── storage/files.ts
│   ├── services/
│   │   ├── submission.service.ts
│   │   ├── grading.service.ts
│   │   └── annotation.service.ts
│   ├── workers/
│   │   └── grading.worker.ts
│   └── types/
├── prisma/
│   └── schema.prisma
├── tests/
│   ├── fixtures/
│   └── grading/
├── docker-compose.yml
├── vitest.config.ts
├── .env.example
└── README.md
```

---

## 4. Setup & Running

### Prerequisites
- Node.js v20.9.0 or higher (v22 recommended)
- A Google AI Studio API key (free tier is sufficient)

### Step 1: Environment Configuration
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Provide a `GEMINI_API_KEY` in `.env` — one [Google AI Studio key](https://aistudio.google.com/apikey)
covers both models used by default.

Grading walks an ordered provider chain (`LLM_PROVIDER_CHAIN`, default `gemma,gemini,openai`),
moving to the next provider on quota, availability, or model errors:

| Order | Provider | Model | Cost / quota |
| --- | --- | --- | --- |
| 1 | `gemma` | `gemma-4-31b-it` | free at every tier |
| 2 | `gemini` | `gemini-3.7-flash` | free tier is ~20 requests/day, then metered |
| 3 | `openai` | `gpt-4o-mini` | metered |

Gemma leads deliberately: Gemini Flash's free tier is small enough that it 429s almost
immediately, and with it first nearly every paper fell back — which made the
"graded by a fallback model" review flag fire on everything and mean nothing.

Providers whose API key is unset are skipped, so setting only `OPENAI_API_KEY` keeps the
original single-provider behaviour. A paper graded by a fallback model is always flagged
for human review, and `GradingRun.model` records the model that actually graded it.

Verify your keys and model ids before a first run:

```bash
npm run smoke:llm -- --list   # confirm the configured model ids exist
npm run smoke:llm             # grade a tiny sample through the real chain
```

### Step 2: Create the database
SQLite — no server, no Docker needed:
```bash
npm run db:push
```

### Step 3: Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser. This starts both the
Express API (port 4000) and the Next.js frontend (port 3000).

> Optional: `docker compose up -d` starts Redis, which is only needed if you set
> `USE_BULLMQ="true"` to run grading through a real queue. The default in-process
> dispatcher needs nothing.

---

## 5. Testing

The suite includes tests for all eight required assignment categories:

```bash
npm run test
```

### Test Categories
1. **Correct Answer**: Full marks awarded (`tests/grading/correct.test.ts`)
2. **Partial Answer**: Proportional marks & review flag (`tests/grading/partial.test.ts`)
3. **Incorrect Answer**: Zero marks with corrections (`tests/grading/incorrect.test.ts`)
4. **Blank Answer**: All points marked MISSING (`tests/grading/blank.test.ts`)
5. **OCR Noise**: Graceful evidence matching with spelling noise (`tests/grading/ocr.test.ts`)
6. **Malformed Model**: Schema rejection (`tests/grading/malformed-model.test.ts`)
7. **API Failure**: Timeout & refusal handling (`tests/grading/api-failure.test.ts`)
8. **Score Limits**: Bounds enforcement (`tests/grading/score-limit.test.ts`)

---

## 6. Authoritative Scoring & Verification Assertions

1. `expect(total).toBeLessThanOrEqual(maxMarks)`
2. `expect(total).toBe(rubricResults.reduce((sum, r) => sum + r.marksAwarded, 0))`
3. `expect(() => validateGradingResult(overflowResult, rubric)).toThrow("INVALID_MARKS")`
