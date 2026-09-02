# Example Annotated Answer Paper

**File:** `annotated_answer_paper_TE-06_Imran-Sheikh.pdf`
**Score:** 14 / 15 · graded by `gemma/gemma-4-31b-it` · 15 of 15 rubric points located on
the page.

This is the unedited output of `GET /api/submissions/:id/export` — the same file a teacher
would download and hand back. The student's original PDF is untouched; this is a separate
generated copy, and it is rebuilt on every export so any edits a teacher makes to the
annotations are always reflected.

## Why this script

TE-06 is the most informative of the twelve, because it is *mostly right*. The economics
answer uses the correct method throughout but reads the equilibrium off the wrong row of
the schedule — ₹40 and 40 units instead of ₹30 and 60 — and then reasons consistently from
that wrong number. Marking it correctly requires the system to isolate a factual error
sitting inside good reasoning, rather than sinking the whole question. A script that simply
scores 15/15 would show the layout but prove nothing.

## What to look at

**Pages 1–2 — the marked-up answer.** Each highlight is the sentence the grader cited for a
particular rubric point, with the feedback printed beside it. Ten boxes on page 1, five on
page 2. The coordinates are computed by searching the extracted text for the quoted
sentence, not guessed by the model — and where a quote cannot be found, no box is drawn at
all.

**Pages 3–5 — the grading report**, grouped by question. For every rubric point it
gives four things:

- `MODEL ANSWER` — what the marking scheme expected
- `STUDENT WROTE` — the sentence actually quoted from the script
- `WHY THIS MARK` — the grader's reasoning
- a correction, where the point was not fully met

**The one lost mark — rubric point 3.2.** This is the part worth pausing on in the report:

> **INCORRECT 0 / 1** — 3.2 Correctly identifies the equilibrium at ₹30 and 60 units and
> explains why it is equilibrium
> **STUDENT WROTE** *"the equilibrium is at a price of Rs 40 and a quantity of 40 units"*
> **CORRECTION** The equilibrium is at Rs.30 and 60 units.

Points 3.1, 3.3, 3.4 and 3.5 all kept full marks. The error was charged to the one point it
actually belongs to.

## One caveat, stated plainly

The hand mark for this script was 10/15, against the system's 14 — I marked the dependent
analysis down as well, on the view that the surrounding reasoning is weakened by resting on
a wrong number. The system marks each rubric point independently, which is what its prompt
instructs, so it did not compound the error. That disagreement is recorded in
[../02_tests_and_outputs/outputs/RESULTS.md](../02_tests_and_outputs/outputs/RESULTS.md)
rather than smoothed over.

An annotated PDF for each of the other eleven scripts is in
[../02_tests_and_outputs/outputs/annotated/](../02_tests_and_outputs/outputs/annotated/),
including the blank script and the two heavily scan-damaged ones.
