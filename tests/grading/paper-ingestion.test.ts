import { describe, it, expect, vi } from 'vitest';
import { reconcileMarks, assertUsable } from '@/services/paper.service';
import { PaperStructureSchema } from '@/lib/llm/paperSchema';
import { validateGradingResult } from '@/lib/grading/validate';

const question = (over: Partial<any> = {}) => ({
  number: 1,
  text: 'Explain how a simple electric circuit works.',
  maxMarks: 5,
  rubricPoints: [
    { description: 'Identifies the closed path', maxMarks: 3, expected: 'A closed loop.' },
    { description: 'Explains the role of the battery', maxMarks: 2, expected: 'Supplies energy.' },
  ],
  ...over,
});

describe('rubric ingestion', () => {
  it('accepts a well-formed extracted paper', () => {
    expect(PaperStructureSchema.safeParse({ questions: [question()] }).success).toBe(true);
  });

  it('rejects an extraction missing required fields', () => {
    const bad = { questions: [{ number: 1, text: 'Q', rubricPoints: [] }] };
    expect(PaperStructureSchema.safeParse(bad).success).toBe(false);
  });

  it('trusts the rubric point sum when the stated question total disagrees', () => {
    // A model that misreads "5 marks" must not create a paper whose maximum is unreachable.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fixed = reconcileMarks({ questions: [question({ maxMarks: 99 })] });
    expect(fixed.questions[0].maxMarks).toBe(5);
  });

  it('leaves consistent marks alone', () => {
    expect(reconcileMarks({ questions: [question()] }).questions[0].maxMarks).toBe(5);
  });
});

describe('unusable rubrics are rejected rather than silently substituted', () => {
  it('rejects an extraction with no questions', () => {
    expect(() => assertUsable({ questions: [] })).toThrow(/RUBRIC_EMPTY/);
  });

  it('rejects a question with no rubric points', () => {
    expect(() => assertUsable({ questions: [question({ rubricPoints: [] })] })).toThrow(/RUBRIC_EMPTY/);
  });

  it('rejects a marking scheme worth zero marks', () => {
    const zero = question({
      maxMarks: 0,
      rubricPoints: [{ description: 'Nothing', maxMarks: 0, expected: null }],
    });
    expect(() => assertUsable({ questions: [zero] })).toThrow(/RUBRIC_EMPTY/);
  });
});

describe('paper total never exceeds the maximum available', () => {
  const points = [
    { id: 'rp-1', maxMarks: 3 },
    { id: 'rp-2', maxMarks: 2 },
  ];
  const result = (marks: number[]) => ({
    rubricResults: points.map((p, i) => ({
      rubricId: p.id,
      status: 'CORRECT' as const,
      marksAwarded: marks[i],
      evidence: null,
      feedback: null,
      correction: null,
      confidence: 1,
      humanReview: false,
    })),
  });

  it('reports the paper maximum as the sum of its rubric points', () => {
    expect(validateGradingResult(result([3, 2]), points)).toEqual({ total: 5, maxMarks: 5 });
  });

  it('blocks a run whose total would exceed the paper maximum', () => {
    expect(() => validateGradingResult(result([4, 2]), points)).toThrow(/INVALID_MARKS/);
  });
});
