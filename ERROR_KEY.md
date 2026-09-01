# Error Key — Student Answer Test Case

Companion to `03_student_answer_test.pdf` (student: *Rohan Sharma*), written against the
three-question paper (Science / English / Economics, 5 marks each, **15 total**).

The answer is deliberately imperfect but believable: mostly sound reasoning with a small
number of targeted defects — two that cost marks, plus spelling and layout problems that a
marker should notice even though they are not separately assessed by the rubric.

**Graded result:** 14 / 15 · flagged for human review · graded by `gemma/gemma-4-31b-it`.

---

## A. Mistakes that cost marks

These are the defects the marking scheme actually penalises. Both were caught.

### A1 — Voltmeter connection left ambiguous (Q1, rubric point 1.2)

| | |
| --- | --- |
| **Rubric point** | Correct placement of ammeter in series and voltmeter in parallel across the bulb |
| **Marks** | 0.5 / 1 — `PARTIAL` |

**What the student wrote**
> "The voltmeter measures the voltage of the bulb. […] I have connected the voltmeter in the
> same circuit to measure the voltage while current is flowing."

**Why it is wrong.** "In the same circuit" describes a series connection. A voltmeter placed
in series has very high resistance and would nearly stop the current, so the bulb would not
glow. The ammeter is explicitly labelled *(series)* and earns its half; the voltmeter is
never stated to be in parallel.

**Correct version**
> The voltmeter is connected **in parallel across the bulb**, so that it measures the
> potential difference across the bulb without carrying the circuit current.

---

### A2 — Graph described but never drawn (Q3, rubric point 3.1)

| | |
| --- | --- |
| **Rubric point** | Correctly plots and labels the demand and supply curves, with appropriate axes and direction |
| **Marks** | 0.5 / 1 — `PARTIAL` |

**What the student wrote**
> "The graph shows that demand slopes downwards while supply slopes upwards. […] I have not
> drawn the second supply curve on the graph, but the new equilibrium would move in that
> direction."

**Why it is wrong.** The direction of both curves is stated correctly, which earns half, but
the question asks the student to *plot* the data. No axes, no plotted points, and the shifted
supply curve is explicitly acknowledged as missing.

**Correct version**
> Draw the axes with **Price on the vertical axis and Quantity on the horizontal axis**, plot
> the demand and supply points from the table, label both curves, mark the intersection at
> **₹30 / 60 units**, and draw the shifted supply curve **S₂** to the left of **S₁** with the
> new equilibrium marked.

---

## B. Spelling and grammar

Not separately assessed by this rubric, so they cost no marks — but a marker should flag them.

| # | As written | Correct version |
| --- | --- | --- |
| B1 | "students **dependant** on searching" | **dependent** — *dependant* is a noun (a person); the adjective is *dependent* |
| B2 | "This is the relation in **V = IR**" | "This is the relation**ship expressed by** V = IR" — *relation in* is not idiomatic |
| B3 | "reduce/control the current" | Slash shorthand in prose; write "reduce **and** control the current" |

---

## C. Layout and alignment problems

| # | Problem | Correct version |
| --- | --- | --- |
| C1 | The Q1 circuit diagram is a flat run of labels — `Battery Switch Resistor A Ammeter (series) Bulb V Voltmeter + -` — with no connecting lines, so the topology cannot be read from it | Draw an actual closed loop with the components in series and the voltmeter branching in parallel across the bulb |
| C2 | Component labels sit inline with the body text rather than beside the diagram, so `+` and `-` are not attached to the battery terminals | Place terminal markings directly on the battery symbol |
| C3 | The Q3 answer refers throughout to "the graph" that is not present on the page | Include the plotted graph, or remove the deictic reference |

---

## D. Correct content (no defect)

Included so the key is complete — 13 of 15 rubric points were fully earned.

- **Q1** — closed-path explanation, battery and switch function, resistor purpose, ammeter in
  series, inverse resistance/current relationship with V = IR, conventional current direction.
- **Q2** — all five points. Clear position, developed argument, a genuine counter-argument
  ("can also make students dependant on searching instead of thinking"), a concrete worked
  example, and a conclusion that follows from the discussion.
- **Q3** — equilibrium correctly identified at ₹30 / 60 units, shortage below and surplus
  above equilibrium with the right price pressures, leftward supply shift from higher
  production costs, and the resulting higher price / lower quantity.

---

## E. How this maps onto the system's own output

| Check | Result |
| --- | --- |
| Total = sum of rubric points | 14 = 13×1 + 2×0.5 ✓ |
| No point exceeds its maximum | enforced by `validateGradingResult` ✓ |
| Every judgement carries evidence | 14 of 15 points located on the page as annotations ✓ |
| Uncertainty declared | both `PARTIAL` points returned confidence 0.9 and the run is flagged `REVIEW_REQUIRED` ✓ |

> Note on provenance: this run was graded by the fallback model (`gemma-4-31b-it`), so every
> point was flagged for human review by design. Sections A–D above were written from the
> system's stored output and the student PDF; they state the intended defects, not a claim
> that the model reasoned about them in these words.
