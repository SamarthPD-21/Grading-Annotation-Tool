import { vi } from 'vitest';
import { processGradingPipeline } from '@/lib/grading/grade';
import { callGradingModel } from '@/lib/llm/client';
import { extractTextWithPositions } from '@/lib/pdf/extract';
import type { GradingResultSchemaType } from '@/lib/llm/schema';

/**
 * Shared harness for the assignment's answer-quality cases.
 *
 * These used to assert arithmetic on hand-written fixtures — that 4 + 2 + 4 is 10 — which
 * passes whether or not the application works. Everything here runs the real
 * `processGradingPipeline`: the validation firewall, deterministic scoring, evidence
 * location and review flags all execute, and only the model call and file read are stubbed.
 *
 * The caller must declare these mocks itself; `vi.mock` is hoisted per test file:
 *   vi.mock('@/lib/llm/client', () => ({ callGradingModel: vi.fn() }));
 *   vi.mock('@/lib/pdf/extract', () => ({ extractTextWithPositions: vi.fn() }));
 */

/** Matches tests/fixtures/sample-rubric.json: 4 + 2 + 4 = 10 marks. */
export const QUESTIONS = [
  {
    number: 1,
    text: 'Explain the light dependent reactions of photosynthesis.',
    rubricPoints: [
      {
        id: 'r1',
        description: 'Explains light dependent reactions accurately',
        maxMarks: 4,
        expected: 'Light energy is absorbed and converted to chemical energy.',
      },
      {
        id: 'r2',
        description: 'Identifies thylakoid membrane location',
        maxMarks: 2,
        expected: 'The reactions occur in the thylakoid membrane.',
      },
      {
        id: 'r3',
        description: 'Describes ATP and NADPH formation',
        maxMarks: 4,
        expected: 'ATP and NADPH are produced.',
      },
    ],
  },
];

const ANSWER_SENTENCES = [
  'Photosynthesis occurs in the thylakoid membrane of the chloroplast.',
  'Light energy is absorbed by chlorophyll and converted into chemical energy.',
  'The light reactions produce ATP and NADPH for the Calvin cycle.',
];

/** Positioned text items, so `findEvidence` has something real to match against. */
function buildPage(sentences: string[]) {
  const items = sentences.flatMap((sentence, line) =>
    sentence.split(' ').map((word, i) => ({
      text: word,
      page: 1,
      x: 72 + i * 34,
      y: 100 + line * 24,
      width: Math.max(10, word.length * 6),
      height: 12,
    }))
  );

  return {
    fullText: sentences.join(' '),
    pages: [{ pageNumber: 1, text: sentences.join(' '), items, width: 612, height: 792 }],
  };
}

export interface RunOptions {
  /** Defaults to a believable three-sentence answer; pass [] for a blank script. */
  sentences?: string[];
  fallbackUsed?: boolean;
  model?: string;
}

export async function runPipeline(
  modelResult: GradingResultSchemaType,
  options: RunOptions = {}
) {
  const sentences = options.sentences ?? ANSWER_SENTENCES;

  vi.mocked(extractTextWithPositions).mockResolvedValue(buildPage(sentences));
  vi.mocked(callGradingModel).mockResolvedValue({
    result: modelResult,
    provider: 'gemma',
    model: options.model ?? 'gemma-4-31b-it',
    structuredMode: 'json_object',
    fallbackUsed: options.fallbackUsed ?? false,
    attempts: [],
  });

  return processGradingPipeline({
    submissionId: 'sub-test',
    studentFilePath: '/tmp/answer.pdf',
    questions: QUESTIONS,
  });
}

/** One rubric result, with sensible defaults so each test states only what it cares about. */
export function result(
  rubricId: string,
  status: 'CORRECT' | 'PARTIAL' | 'INCORRECT' | 'MISSING',
  marksAwarded: number,
  over: Partial<GradingResultSchemaType['rubricResults'][number]> = {}
): GradingResultSchemaType['rubricResults'][number] {
  return {
    rubricId,
    status,
    marksAwarded,
    evidence: null,
    feedback: null,
    correction: null,
    confidence: 0.95,
    humanReview: false,
    ...over,
  };
}
