# GradeSense — Submission Package

Everything the submission form asks for, arranged so each folder maps to one form field.
Upload this whole folder to Drive, then share the individual sub-folders (or files) as the
answers below. **Set every link to "Anyone with the link — Viewer" before submitting.**

| Form field | What to link | Where it is |
| --- | --- | --- |
| Project GitHub link | *(nothing to upload — tick "Acknowledged")* | — |
| Project & Architecture explanation video | Your recorded video (YouTube unlisted, or a Drive file) | **2-minute cut:** [04_two_minute_video/RECORDING_GUIDE.md](04_two_minute_video/RECORDING_GUIDE.md). Longer version: [01_architecture_video/](01_architecture_video/) |
| Transcription | [04_two_minute_video/TRANSCRIPT.txt](04_two_minute_video/TRANSCRIPT.txt) — one paragraph, no timestamps; paste it straight into the field | `04_two_minute_video/` |
| Tests and Outputs | The whole [02_tests_and_outputs/](02_tests_and_outputs/) folder | `02_tests_and_outputs/` |
| One example of an Annotated Answer Paper | The single PDF in [03_annotated_answer_paper/](03_annotated_answer_paper/) | `03_annotated_answer_paper/` |

## Headline numbers

| | |
| --- | --- |
| Automated suite | 176 tests across 18 files, all passing |
| Evaluation set | 12 answer scripts (5 train / 7 held out), hand-marked first |
| Agreement with the human marker | mean absolute error **1.40 marks out of 15**; 7 of 12 within ±1 |
| Evidence located | 140 of 180 rubric points |
| Graded by | `gemma/gemma-4-31b-it`, no provider fallback needed |

Two genuine defects surfaced and are documented rather than hidden — see
[outputs/RESULTS.md](02_tests_and_outputs/outputs/RESULTS.md).

---

## What's in here

### `01_architecture_video/`

- **`TRANSCRIPT.md` / `TRANSCRIPT.txt`** — the spoken transcript, covering the three things
  the form asks the video to include: project explanation, architecture explanation, and
  the inference demo. Read it aloud as-is and the recording matches the transcript.
- **`RECORDING_GUIDE.md`** — what to have open, a shot list keyed to the transcript's
  timestamps, an ASCII architecture diagram to show on screen, and a short list of claims
  not to make on camera.

### `02_tests_and_outputs/`

The evaluation set and its results. Read [TEST_CASES.md](02_tests_and_outputs/TEST_CASES.md)
first — it explains every case and why it exists — then
[outputs/RESULTS.md](02_tests_and_outputs/outputs/RESULTS.md) for what actually happened.

```
02_tests_and_outputs/
├── TEST_CASES.md              every test case, and what each one pins down
├── dataset/
│   ├── question_paper.pdf     the 15-mark paper (science / English / economics)
│   ├── model_answer_and_rubric.pdf
│   ├── train/                 5 answer scripts used while developing
│   ├── test/                  7 held-out answer scripts
│   ├── ground_truth.csv       marks assigned by hand, before any run
│   └── manifest.json          the same, with each script's profile and intent
├── outputs/
│   ├── RESULTS.md             agreement with the human marker, and what it got wrong
│   ├── results_summary.csv    expected vs awarded, per question, per script
│   ├── per_submission/*.json  every rubric point: status, marks, evidence, feedback
│   ├── annotated/*.pdf        the annotated PDF exported for each script
│   ├── paper_structure.json   the rubric as the system read it out of the PDFs
│   └── run_log.txt            provider, model and timing for the run
├── automated_tests/
│   └── vitest_run.txt         captured `npm run test` output
└── tools/
    ├── make-student-scripts.mjs   regenerates the answer scripts
    ├── pdfkit.mjs                 the PDF/diagram drawing helpers
    └── run-batch.ts               grades the whole set through the real pipeline
```

The twelve answer scripts are original — written for this submission, one per failure mode
a marker has to survive, and hand-marked before the system ever saw them. Nothing in
`outputs/` is written by hand: every figure there came out of a live run, and `run_log.txt`
records which model produced it.

### `03_annotated_answer_paper/`

One exported annotated answer paper, with a note explaining what to look at on each page.

### `04_two_minute_video/`

The short cut, for the two-minute limit. Same three beats as `01_architecture_video/` —
project, architecture, inference demo — compressed to ~325 words.

- **`TRANSCRIPT.md` / `TRANSCRIPT.txt`** — one paragraph, no timestamps. The `.txt` is the
  plain paragraph, ready to paste into the transcription field.
- **`RECORDING_GUIDE.md`** — what to have open, four screen cues, the architecture diagram
  to hold on screen, and the claims not to make on camera.

---

## Reproducing any of it

From the repository root:

```bash
npm run test                                                    # the automated suite
node submission_package/02_tests_and_outputs/tools/make-student-scripts.mjs   # rebuild the scripts
npx tsx submission_package/02_tests_and_outputs/tools/run-batch.ts            # grade all twelve
```

The last one needs `GEMINI_API_KEY` in `.env` and takes about twenty minutes.

## Before you upload

- Do **not** upload `.env`, `uploads/`, or the repository itself — the form explicitly says
  not to put the codebase on Drive. This folder contains no source code beyond the three
  tools used to build and grade the dataset.
- Check every Drive link is public before submitting.
