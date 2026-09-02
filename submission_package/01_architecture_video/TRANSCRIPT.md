# GradeSense — Architecture Explanation Video · Transcript

Spoken transcript of the project and architecture walkthrough, with the inference demo at
the end. Timestamps are approximate; the recording runs a little over eleven minutes at a normal speaking pace (about 1,880 words).

---

**[00:00] — What this is**

Hi. I'm going to walk through GradeSense, which is the assessment system I built for this
assignment, and I'll cover three things: what the project actually does, how it's put
together, and then a live run on a student's answer paper at the end.

So, the short version. You give GradeSense three PDFs — a question paper, a marking scheme
with the model answers, and a student's answer script. It reads the marking scheme, marks
the student's paper against it point by point, shows you the exact sentence on the page
that earned or lost each mark, and gives you back an annotated PDF you can hand to the
student. That's the whole loop.

**[00:43] — Why it's built this way**

The thing I kept coming back to while building it is that a grading system fails in a way
that's really easy to miss. If it crashes, you know. But if it quietly marks a student
against the wrong rubric, or gives a confident zero to a scanned page it couldn't read, it
looks like it worked. You get a number, the number looks plausible, and nobody checks.
So a lot of the decisions I'll show you are about making the failures visible instead of
making them go away.

**[01:18] — The stack**

Quickly, on the stack. It's a Next.js 16 app with React 19 on the front end, and an
Express API on the side. Prisma with SQLite for the database. PDF.js does text extraction
and page rendering, pdf-lib writes the annotated output. Grading goes through Google's
Gemma and Gemini models using OpenAI-compatible structured outputs. Tests are Vitest.

It's a modular monolith — the web app, the API handlers, the services and the queue worker
are all one TypeScript codebase. For a single-marker workload that's the right call;
splitting it into services would have bought me deployment complexity and nothing else.

**[01:56] — The architecture, layer by layer**

Let me go through the layers.

At the top there's the route layer — Next.js route handlers and the Express API. Those do
almost nothing except validate the request with Zod and hand it down. Underneath that is
the service layer: paper service, submission service, grading service, annotation service.
That's where the transactions live. Below that are the libraries — the LLM client, the PDF
pipeline, and the grading logic — and then Prisma and the filesystem at the bottom.

The important flow is the grading pipeline, and it goes like this.

A submission comes in. Step one, extract the text from the student's PDF with PDF.js — and
crucially, not just the text, but every text item's position on the page. Step two, if the
PDF has images but no text layer at all, we stop right there and raise a NO_TEXT_LAYER
error. That's a photograph of a handwritten script, and grading it would mark every rubric
point as missing and hand back a confident zero that looks completely legitimate. So it
refuses instead.

Step three, we flatten the paper into a list of rubric points, each carrying its own model
answer, and send that plus the student's text to the model in one structured call. Step
four is the validation firewall, and step five is where the score actually gets calculated.

**[03:19] — The model interprets, the code calculates**

This is the decision I'd defend hardest. The model classifies each rubric point — correct,
partial, incorrect, or missing — writes the feedback, writes the correction, and quotes the
evidence. What it never does is compute the total. The system prompt literally tells it not
to, and even if it returned a total we'd ignore it. The application sums the individual
marks in code.

And between the model and the database there are two layers of validation. First a Zod
schema, so the shape and the types are guaranteed. Then a business check: every rubric ID
in the response has to be one that actually exists on this paper, every mark has to fall
inside zero to that point's maximum, and the total can't exceed the paper's maximum. If any
of those fail, the run throws — INVALID_MARKS, UNKNOWN_RUBRIC_ID — and nothing gets
written. A model that hallucinates a rubric point or awards six out of five doesn't get to
corrupt a student's record.

**[04:22] — The rubric comes from the upload**

Related decision. The rubric isn't in the code. When you upload the question paper and the
marking scheme, they get parsed into structured questions and rubric points, each one with
its model answer stored against it, and that's what the grader compares the student's
words against.

If those documents can't be read, the upload fails with a 422. It does not fall back to a
placeholder rubric. That was deliberate — a placeholder would mean every student gets
marked against a marking scheme that isn't theirs, and the app would look completely
healthy while doing it.

**[05:00] — Locating the evidence**

Now, the evidence boxes, because this is the part I got wrong first and had to redo.

The model quotes a sentence from the student's answer as its evidence. It does not give us
coordinates — asking a language model for PDF coordinates is asking it to guess. Instead we
take the quote and search for it in the extracted text items, which we already have
positions for. The search is a fuzzy match — it's Sellers' algorithm, so an approximate
substring match with an edit-distance budget of about twenty-five percent of the quote
length. That budget is what lets a quote still land when the scan has turned "current" into
"currerit" and "bulb" into "bufb".

Two things follow from that. One, if the quote genuinely can't be found within the budget,
we return null and draw no box at all. A box in the wrong place is worse than no box,
because it's a confident claim pointing at text the model never cited. The feedback still
shows in the sidebar, it just doesn't claim a location. And two, the coordinates live in
the PDF's own coordinate space, which means the viewer has to render the real PDF page —
which it does, with PDF.js — and scale the overlays by the rendered width over the page
width in points. An earlier version drew re-flowed extracted text instead, and the
highlights landed on completely unrelated lines.

**[06:27] — When providers fail**

One more piece. Grading walks an ordered chain of providers — Gemma first, then a few
Gemini models, then OpenAI. If one returns a quota error, an auth error, or a model error,
it falls through to the next. Within each provider there's a second ladder, from strict
JSON-schema structured output down to plain JSON mode, because not every model supports the
strict mode.

What matters is that the run records which provider and which model actually answered, and
whether a fallback was used. If a fallback graded the paper, every rubric point on it is
flagged for human review and the UI says so — because nobody chose that model for its
grading quality, it was just the one that was up. And if the entire chain fails, we store
the per-provider breakdown as JSON and render it as a list, rather than collapsing it into
one useless error string.

Marks also get flagged for review when confidence is below zero point seven, when there's
no evidence, or whenever a point comes back as partial. Partial credit is exactly where a
human should be looking.

**[07:37] — The demo**

Right, let me actually run one.

This is the upload page. Question paper, marking scheme, student answer script. This paper
is fifteen marks — three questions, science, English and economics, five marks each, and
the marking scheme breaks those into fifteen individual rubric points. I'll upload a script
from my test set and start grading.

While that runs — the status goes through extracting, grading, annotating. It's a single
model call for the whole paper.

And here's the result. On the left is the student's actual PDF page, rendered. On the right
is the rubric sidebar, question by question, with the mark for each point. If I click a
rubric point... the matching highlight activates on the page, and that's the sentence the
model cited for that mark. Hovering it gives me the feedback and the correction.

Now this one's interesting — look at question three. The student's method is completely
sound; they explain shortage and surplus correctly, they explain the supply shift
correctly. But they've read the equilibrium off the wrong row of the table — they've said
forty rupees and forty units when it's thirty and sixty. And the grader has caught exactly
that: it's docked the equilibrium point, quoted the sentence that contains the error, and
the correction tells the student the right value. The points around it kept their marks.
That's the behaviour I wanted — the error is isolated to the point it actually belongs to,
instead of sinking the whole question.

I can drag this box if it's slightly off, I can rewrite the feedback, I can delete an
annotation — and none of that re-runs grading or changes a single mark. The PATCH endpoint
only accepts geometry and note text, so a client can't reassign an annotation to a
different submission.

And then export. The student's original PDF is never modified — that's asserted by a test
that checks the original is byte-identical after an export. The annotated copy is written
separately and regenerated every time, so my edits are always in it. You get the marked-up
pages, then a report grouped by question: what the scheme expected, what the student
actually wrote, why that mark was given, and the correction.

**[09:52] — Testing**

On reliability. There are a hundred and seventy-six tests across eighteen files, covering
the eight required categories — correct, partial, incorrect and blank answers, OCR noise,
malformed model output, API failure, and marks over the limit — plus provider fallback,
prompt injection in the student's own text, and the annotation export path.

Beyond the unit tests I built a twelve-script evaluation set — five training scripts and
seven held-out test scripts — where I marked every one by hand first, then ran the pipeline
and compared. The set is built to be awkward on purpose: a blank page, a script that's
confidently wrong, one that's correct but badly scanned, one that's long and says nothing,
and one that argues the opposite conclusion to the model answer but argues it properly —
that last one is checking that the grader rewards reasoning rather than similarity to the
model answer.

**[10:47] — What I'd flag**

Two honest limitations. The system reads text PDFs; a photographed handwritten script gets
refused rather than OCR'd, and adding a real OCR stage is the obvious next step. And the
diagram questions are marked from the labels in the diagram's text layer — it isn't
interpreting the drawing itself, and I wouldn't claim it is.

That's GradeSense. Thanks for watching.
