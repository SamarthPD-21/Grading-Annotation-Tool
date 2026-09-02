# Test Cases

Two layers of testing, and they answer different questions.

- **Automated suite** (`npm run test`) — does the machinery behave, including when the
  model or the network misbehaves? No API calls; deterministic; runs in seconds.
- **Evaluation set** (`dataset/`, results in `outputs/`) — does it actually mark a paper
  the way a human marker would? Real model calls against twelve answer scripts that were
  marked by hand first.

---

## 1. Automated suite

Run from the repository root:

```bash
npm run test
```

The captured run is in [automated_tests/vitest_run.txt](automated_tests/vitest_run.txt).

### The eight required categories

| # | Category | File | What it pins down |
| --- | --- | --- | --- |
| 1 | Correct answer | `tests/grading/correct.test.ts` | Every point CORRECT, total equals the paper maximum, total equals the sum of the parts |
| 2 | Partial answer | `tests/grading/partial.test.ts` | Proportional marks, and a PARTIAL point always raises the human-review flag |
| 3 | Incorrect answer | `tests/grading/incorrect.test.ts` | Zero marks, and a correction string comes back with each wrong point |
| 4 | Blank answer | `tests/grading/blank.test.ts` | All points MISSING at zero; no evidence boxes invented for an empty page |
| 5 | OCR noise | `tests/grading/ocr.test.ts` | A quote with scan damage still resolves to a bounding box |
| 6 | Malformed model output | `tests/grading/malformed-model.test.ts` | Schema violations are rejected before anything is written |
| 7 | API failure | `tests/grading/api-failure.test.ts` | Timeouts, refusals and quota errors surface as classified errors, not as a zero |
| 8 | Marks over the limit | `tests/grading/score-limit.test.ts` | `INVALID_MARKS` / `TOTAL_EXCEEDS_MAXIMUM` throw and abort the run |

### Beyond the required eight

| File | What it pins down |
| --- | --- |
| `tests/grading/paper-ingestion.test.ts` | A paper is never created without a real rubric behind it; question marks reconcile against the sum of their points |
| `tests/grading/evidence-location.test.ts` | Fuzzy matching, per-line rectangles for wrapped quotes, and `null` rather than a guessed box |
| `tests/grading/annotate-export.test.ts` | The student's original PDF is byte-identical after an export; the annotated copy is regenerated each time |
| `tests/grading/provenance.test.ts` | Every run records the provider, model, prompt version and engine version that produced it |
| `tests/llm/fallback.test.ts`, `providers.test.ts`, `errors.test.ts` | The provider chain falls through on quota/auth/model errors, steps down the structured-output ladder, and flags fallback-graded papers for review |
| `tests/security/sanitize.test.ts`, `proxy.test.ts` | Filename sanitisation, and prompt-injection text inside a student's answer being ignored rather than obeyed |
| **`tests/dataset/evaluation-set.test.ts`** *(added for this submission)* | The shipped answer scripts are actually gradable — see below |

### `tests/dataset/evaluation-set.test.ts` — 16 new cases

These sit between the unit tests and a live run. They catch the failures that would
otherwise only show up as a bad grade:

| Case | Why it exists |
| --- | --- |
| All twelve scripts present and matching the manifest | A missing script silently shrinks the evaluation set |
| Every script has a positioned text layer | A PDF with pixels and no text is refused as `NO_TEXT_LAYER`; if a script rendered that way it would be graded as a confident zero |
| The blank script really is blank | If TR-04 carried stray body text, the blank-answer case would be testing nothing |
| Diagram labels reach the text layer | Instrument-placement marks can only be evidenced from the labels, since the strokes themselves are not text |
| A verbatim quote from TR-01 resolves to a box on page 1 | The happy path for evidence location, on a real file rather than a fixture |
| Per-line rects stay inside the union box | Otherwise the on-screen overlay and the exported PDF disagree about where a highlight is |
| A clean quote still matches TR-05's damaged spelling | The OCR tolerance budget, measured on a real noisy script |
| A quote absent from the blank script returns `null` | No invented boxes |
| TE-06's wrong-equilibrium sentence is locatable | The sentence a marker most needs pointed at is the one that must be findable |
| Ground truth sums, bounds and CSV/manifest agreement | A ground truth that disagrees with itself makes every number in `outputs/` meaningless |
| Ground truth spans 0 → 15 with partial credit in between | A set that is all-correct or all-wrong proves nothing about proportional marking |
| Firewall at this paper's real shape (15 × 1 mark) | Full credit accepted and summed in code; a 2-of-1 award rejected; a foreign rubric id rejected |
| Partial credit and missing evidence both route to review | The two conditions a marker most needs to see |

---

## 2. Evaluation set

Twelve answer scripts for the same fifteen-mark paper — three questions (science, English,
economics), five rubric points each. Five training scripts used while developing the
prompt and the review thresholds, seven held-out test scripts that were only run at the
end.

Every script was marked by hand **before** the pipeline was run against it; those marks are
in [dataset/ground_truth.csv](dataset/ground_truth.csv), and they are what
[outputs/results_summary.csv](outputs/results_summary.csv) is scored against.

### Train

| ID | Profile | Human mark | What it tests |
| --- | --- | --- | --- |
| TR-01 | Complete, correct answers throughout | 15 / 15 | Full credit — every point CORRECT, total at the paper maximum |
| TR-02 | Core ideas present, instrument placement / counter-argument / cost-shift all missing | 9 / 15 | Partial credit is proportional, and the missing points are named |
| TR-03 | Confidently wrong — voltmeter in series, resistance "increases" current, equilibrium off the wrong row | 3 / 15 | Wrong statements come back with corrections, not just lost marks |
| TR-04 | Handed in with only the headings copied out | 0 / 15 | Every point MISSING, and no evidence boxes for text that is not there |
| TR-05 | TR-01's content through a bad scan (rn/m, l/1, 0/O, split words) | 13.5 / 15 | Marks survive spelling damage; evidence still located by fuzzy match |

### Test (held out)

| ID | Profile | Human mark | What it tests |
| --- | --- | --- | --- |
| TE-01 | Strong throughout, never explains shortage/surplus | 14 / 15 | One missing point costs exactly one point |
| TE-02 | Argues the **opposite** conclusion to the model answer on Q2, but argues it properly | 14 / 15 | Reasoning is rewarded, not similarity to the model answer — the marking scheme says so explicitly |
| TE-03 | Long, repetitive, restates the question, commits to nothing | 5.5 / 15 | Length is not mistaken for correctness |
| TE-04 | Ran out of time — Q2 answered, Q1 abandoned, Q3 untouched | 5 / 15 | A blank question does not drag down the answered ones |
| TE-05 | Correct diagrams, almost no prose | 5.5 / 15 | Explanation marks are not awarded from a diagram alone |
| TE-06 | Correct method, equilibrium read off the wrong row, reasoned consistently from the wrong number | 10 / 15 | A factual error inside good reasoning is isolated and quoted |
| TE-07 | Worst-case scan: heavy substitution, a scanner artefact line | 12.5 / 15 | Stress case for evidence location under noise |

Two of these found real defects rather than confirming good behaviour: TE-05 scored 9.5
against a hand mark of 5.5 because the grader read diagram **labels** as explanation, and
TE-06 scored 14 against 10 because a factual error is not propagated to the analysis that
depends on it. Both are written up in [outputs/RESULTS.md](outputs/RESULTS.md).

### How to reproduce

```bash
# 1. rebuild the answer scripts (deterministic)
node submission_package/02_tests_and_outputs/tools/make-student-scripts.mjs

# 2. grade all twelve through the real pipeline (needs GEMINI_API_KEY in .env)
npx tsx submission_package/02_tests_and_outputs/tools/run-batch.ts

# 3. or just one
npx tsx submission_package/02_tests_and_outputs/tools/run-batch.ts TE-06

# 4. continue an interrupted run, reusing the paper it already ingested
npx tsx submission_package/02_tests_and_outputs/tools/run-batch.ts --resume --paper=<paperId>
```

Results are written per script as each one finishes, and the summary is rebuilt from
whatever is on disk, so a run that stops halfway can simply be resumed — which is what
happened during the recorded run (see `outputs/run_log.txt`).

Step 2 makes live model calls and takes roughly twenty minutes for the full set. Marks can
shift slightly between runs — the same script is not guaranteed the same marks twice, which
is exactly why the human ground truth and the agreement numbers are reported rather than a
single expected-output diff.
