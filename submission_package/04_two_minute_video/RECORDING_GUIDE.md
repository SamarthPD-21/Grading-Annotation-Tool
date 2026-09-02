# Recording Guide — 2-Minute Video

Read [TRANSCRIPT.md](TRANSCRIPT.md) aloud, straight through, while changing what's on
screen at the four cues below. The transcript is ~325 words, so at a normal pace you land
just inside two minutes. There is no slack in a two-minute cut: rehearse it once, and don't
ad-lib — every added sentence pushes you over.

If you want the long version instead, [../01_architecture_video/](../01_architecture_video/)
has the full eleven-minute walkthrough with its own transcript and shot list.

## Before you hit record

- `npm run dev` up (Express on :4000, Next on :3000), and **`TE-06` already graded in
  another tab** — at this length you cannot afford to wait on a model call on camera. Cut
  from the upload page to the finished graded view.
- The upload page open with the three PDFs already dropped in:
  - `../02_tests_and_outputs/dataset/question_paper.pdf`
  - `../02_tests_and_outputs/dataset/model_answer_and_rubric.pdf`
  - `../02_tests_and_outputs/dataset/test/TE-06_wrong-equilibrium.pdf`
- The exported annotated PDF already downloaded.
- Notifications off. 1080p or better — the rubric sidebar text is small.

## Four cues

| Say | Show |
| --- | --- |
| "This is GradeSense…" | Upload page, three drop zones filled |
| "Architecturally it's a Next.js 16 modular monolith…" | The diagram below, held for the whole architecture stretch |
| "Here's a live run." | Graded view: click a rubric point, highlight activates, scroll to question 3 |
| "Behind it: 176 automated tests…" | `npm run test` summary, then the exported annotated PDF |

Only one screen change per cue. Cutting more often than that is unreadable at this speed.

## Diagram for the architecture stretch

```
   Question PDF  ┌──────────────────────────────────────────┐
   Rubric PDF ──▶│  Next.js 16 handlers + Express · Zod     │
   Student PDF   └────────────────────┬─────────────────────┘
                                      ▼
                 ┌──────────────────────────────────────────┐
                 │  Services — paper · submission · grading │
                 │  · annotation   (Prisma $transaction)    │
                 └───────┬──────────────────────────┬───────┘
                         ▼                          ▼
        ┌────────────────────────────┐   ┌────────────────────────┐
        │  PDF pipeline              │   │  LLM pipeline          │
        │  extract + positions       │   │  gemma → gemini → oai  │
        │  → locate evidence         │   └───────────┬────────────┘
        │  → annotate (pdf-lib)      │               ▼
        └────────────┬───────────────┘   ┌────────────────────────┐
                     │                   │  Zod schema, then      │
                     │                   │  bounds + rubric id    │
                     │                   └───────────┬────────────┘
                     │                               ▼
                     │                   ┌────────────────────────┐
                     │                   │  Score summed in code  │
                     ▼                   └───────────┬────────────┘
        ┌──────────────────────────────────────────────────────────┐
        │  Prisma / SQLite · originals (read-only) · annotated copy │
        └──────────────────────────────────────────────────────────┘
```

## Don't claim on camera

- Don't call a score "verified correct" — it's a model's judgement behind a bounds check.
  The arithmetic is guaranteed; the judgement is reviewed.
- Only Gemma and Gemini have been run against a live API. OpenAI is in the chain but
  unproven here.
- Diagram questions are marked from the diagram's text labels, not the drawing.
- Quote the test count from the `npm run test` summary as it stands on the day you record.
