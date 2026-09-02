# Results — 12-script evaluation run

Every figure on this page came out of a live run of the pipeline on 2 September 2026. The
run log is in [run_log.txt](run_log.txt); per-rubric-point detail for each script is in
[per_submission/](per_submission/), and the annotated PDF the system produced for each is
in [annotated/](annotated/).

- **Paper**: 3 questions × 5 rubric points, 15 marks. The rubric was read out of the two
  PDFs by the model, not hardcoded — see [paper_structure.json](paper_structure.json).
- **Graded by**: `gemma/gemma-4-31b-it` for all twelve. No provider fallback was needed, so
  nothing was flagged for review on those grounds.
- **Cost of a paper**: one model call, roughly 90–160 seconds end to end including the
  annotated PDF export.

## Agreement with the human marker

| | |
| --- | --- |
| Scripts graded | 12 / 12 |
| Mean absolute error | **1.40 marks out of 15** (9.3%) |
| Within ±1.0 mark | 7 / 12 |
| Within ±1.5 marks | 8 / 12 |
| Exact agreement | 3 / 12 (TR-01, TR-04, TE-01) |
| Evidence located | 140 / 180 rubric points (78%) |
| Marks over the paper maximum | 0 — the firewall never had to reject a run |

| ID | Split | Profile | Human | System | Δ | Status |
| --- | --- | --- | --- | ---: | ---: | --- |
| TR-01 | train | Full credit | 15 | 15 | 0 | COMPLETED |
| TR-02 | train | Partial credit | 9 | 11 | +2 | REVIEW_REQUIRED |
| TR-03 | train | Confidently wrong | 3 | 2 | −1 | REVIEW_REQUIRED |
| TR-04 | train | Blank | 0 | 0 | 0 | REVIEW_REQUIRED |
| TR-05 | train | OCR noise | 13.5 | 15 | +1.5 | COMPLETED |
| TE-01 | test | Strong, one gap | 14 | 14 | 0 | REVIEW_REQUIRED |
| TE-02 | test | Contrarian argument | 14 | 14.5 | +0.5 | REVIEW_REQUIRED |
| TE-03 | test | Padded, shallow | 5.5 | 5.25 | −0.25 | REVIEW_REQUIRED |
| TE-04 | test | Partially blank | 5 | 6 | +1 | REVIEW_REQUIRED |
| TE-05 | test | Diagram-heavy | 5.5 | 9.5 | **+4** | REVIEW_REQUIRED |
| TE-06 | test | Wrong equilibrium | 10 | 14 | **+4** | COMPLETED |
| TE-07 | test | Heavy scan noise | 12.5 | 15 | +2.5 | COMPLETED |

## What went right

**The blank script is a true zero.** TR-04 came back 0/15 with all fifteen points MISSING,
and only two of the fifteen got an evidence box — nothing was invented for an empty page.

**Errors stay where they belong.** TE-06 answers economics with sound method but reads the
equilibrium off the wrong row. The grader zeroed rubric point 3.2 and nothing else on that
question: it quoted *"the equilibrium is at a price of Rs 40 and a quantity of 40 units"*
and corrected it to "₹30 and 60 units", while 3.1, 3.3, 3.4 and 3.5 kept full marks. The
same isolation shows up in TE-01, where the one missing point (shortage/surplus) cost
exactly one mark.

**Reasoning is rewarded over similarity.** TE-02 argues the *opposite* conclusion to the
model answer on Q2 — that technology makes students worse learners — and scored 5/5 on that
question, with the grader naming the counter-argument the student engaged with. The
marking scheme asks for exactly this behaviour, and it is the single most important thing
in this run.

**Scan noise did not break evidence location.** TR-05 and TE-07 are deliberately damaged
("currerit", "bufb", "equilibriurn"). Evidence was still located on 14/15 and 15/15 rubric
points respectively — the fuzzy match is doing real work.

**Nothing corrupt was written.** No run exceeded a point's maximum or the paper's maximum,
so the bounds check never had to abort a run. Nine of the twelve were flagged
REVIEW_REQUIRED, driven almost entirely by partial credit — which is the intended
behaviour, not a failure.

## What went wrong, and why

**The grader is systematically more generous than I am.** Nine of the twelve deltas are
zero or positive; only two are negative. On a 15-mark paper that averages out to a
+1.1 mark bias. If this were deployed I would treat the output as a first pass to be
moderated down, not a final mark.

**TE-05 (+4) — diagram labels read as explanation.** This is the clearest defect. The
script draws a correct circuit and a correct supply-and-demand graph but writes almost
nothing. Because the diagram labels ("Voltmeter (parallel across bulb)", "Ammeter (in
series)") live in the PDF's text layer, they read to the grader as if the student had
*explained* the placement, and Q1 scored 4.5/5 against a hand mark of 2.5. The system
cannot currently tell a label apart from a sentence. Fixing it properly means tagging text
that belongs to a figure during extraction and telling the prompt to treat labels as
weaker evidence than prose.

**TE-06 (+4) — knock-on effects not propagated.** I marked this harder than the system did
because the wrong equilibrium value should arguably weaken the surrounding analysis that
depends on it. The system marks each rubric point independently, which is what the prompt
instructs it to do, so it kept the neighbouring points at full marks. This is a defensible
reading of the marking scheme rather than a bug — but it means the system will not
compound a single factual error the way a strict human marker does.

**TR-05 and TE-07 (+1.5, +2.5) — spelling damage ignored entirely.** I docked half a mark
per question for the scan damage; the rubric has no criterion for spelling, so the system
awarded full marks. On reflection the system is right and my ground truth was wrong here —
but it is recorded as a disagreement rather than quietly corrected, because rewriting the
ground truth after seeing the output is exactly how an evaluation stops meaning anything.

**Evidence location: 140/180 (78%).** The 40 unlocated points are mostly MISSING points,
where there is genuinely nothing on the page to quote — TR-04 alone accounts for 13 of
them. Those correctly draw no box. A smaller number are paraphrases the model wrote instead
of quoting verbatim, which fall outside the 25% edit-distance budget and, by design, get no
box rather than a guessed one.

## Honest summary

On the shape of a mark — which rubric points are met, which are missed, and which sentence
is responsible — the system is reliable, and the two scan-noise scripts show that holds up
under bad input. On the *level* of a mark it runs about a mark generous on 15, with one
structural weakness (diagram labels credited as explanation) that accounts for the single
worst disagreement. That is a usable first-pass marker with a human moderating, which is
what the review flags are for; it is not an unattended one.
