# Recording Guide — Architecture Explanation Video

What to have open and what to show while reading [TRANSCRIPT.md](TRANSCRIPT.md). The form
asks for three things in one video — project explanation, architecture explanation, and an
inference demo — and the transcript covers them in that order.

## Before you hit record

- `npm run dev` up (Express on :4000, Next on :3000), and one paper already graded so you
  are never waiting on a model call on camera.
- A second browser tab on the upload page, with the three PDFs ready to drop:
  - `submission_package/02_tests_and_outputs/dataset/question_paper.pdf`
  - `submission_package/02_tests_and_outputs/dataset/model_answer_and_rubric.pdf`
  - `submission_package/02_tests_and_outputs/dataset/test/TE-06_wrong-equilibrium.pdf`
- The exported annotated PDF already downloaded, so the export cut is instant.
- A terminal on the `npm run test` summary.
- Close notifications. Record at 1080p or better; the rubric sidebar text is small.

`TE-06` is the demo script on purpose: its economics answer is correctly reasoned but reads
the equilibrium off the wrong row, so the grader has to dock one specific point and quote
the sentence that contains the error — which is far more convincing on camera than a paper
that simply scores full marks.

## Shot list

| Transcript section | On screen |
| --- | --- |
| 00:00 What this is | Upload page with the three drop zones filled in |
| 00:43 Why it's built this way | Stay on the upload page, or the README's decision list |
| 01:18 The stack | `package.json`, or the README stack section |
| 01:56 Architecture, layer by layer | The architecture diagram (below), then `src/lib/grading/grade.ts` |
| 03:19 Model interprets, code calculates | `src/lib/grading/validate.ts` beside `src/lib/llm/prompt.ts` — the "Do NOT calculate the final score" line reads well on camera |
| 04:22 Rubric comes from the upload | `outputs/paper_structure.json`, or the rubric sidebar with its 15 points |
| 05:00 Locating the evidence | `src/lib/pdf/coordinates.ts` (`findEvidence`), then click a rubric point and watch the highlight activate |
| 06:27 When providers fail | The `.env` `LLM_PROVIDER_CHAIN` line, and the graded-by / review-required badge in the header |
| 07:37 The demo | Live: upload → status progress → graded view → click a point → drag a box → edit a note → export |
| 09:52 Testing | Terminal: `npm run test`, then `outputs/results_summary.csv` |
| 10:47 What I'd flag | Back to the graded view, or a plain slide |

## Architecture diagram to show at 01:56

```
                 ┌──────────────────────────────────────────┐
   Question PDF  │  Next.js 16 route handlers  +  Express   │
   Rubric PDF ──▶│  Zod-validated request layer             │
   Student PDF   └────────────────────┬─────────────────────┘
                                      ▼
                 ┌──────────────────────────────────────────┐
                 │  Services — paper · submission · grading │
                 │  · annotation   (Prisma $transaction)    │
                 └───────┬──────────────────────────┬───────┘
                         ▼                          ▼
        ┌────────────────────────────┐   ┌────────────────────────┐
        │  PDF pipeline              │   │  LLM pipeline          │
        │  extract → locate evidence │   │  provider chain:       │
        │  → annotate (pdf-lib)      │   │  gemma → gemini → oai  │
        └────────────┬───────────────┘   └───────────┬────────────┘
                     │                               ▼
                     │                   ┌────────────────────────┐
                     │                   │  Firewall              │
                     │                   │  1. Zod schema         │
                     │                   │  2. bounds + rubric id │
                     │                   └───────────┬────────────┘
                     │                               ▼
                     │                   ┌────────────────────────┐
                     │                   │  Score summed in code  │
                     │                   └───────────┬────────────┘
                     ▼                               ▼
        ┌──────────────────────────────────────────────────────────┐
        │  Prisma / SQLite  ·  uploads/originals (read-only)        │
        │                   ·  uploads/generated (annotated copy)   │
        └──────────────────────────────────────────────────────────┘
```

## Things not to claim on camera

- Don't call a score "verified correct". It is a model's judgement behind a bounds check —
  the honest framing is that the arithmetic is guaranteed and the judgement is reviewed.
- Only the Gemma and Gemini providers have been exercised against a live API. Groq,
  OpenRouter and OpenAI are configured in the chain but unproven in this project.
- The diagram questions are marked from the labels in the diagram's text layer. The system
  is not interpreting the drawing.
- Quote the test and evaluation numbers from `outputs/run_log.txt` and the `npm run test`
  summary as they stand on the day you record, not from memory.
