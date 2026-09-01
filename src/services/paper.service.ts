import { prisma } from '@/lib/db/prisma';
import { saveOriginalFile } from '@/lib/storage/files';
import { extractTextWithPositionsFromBuffer } from '@/lib/pdf/extract';
import { extractPaperStructure } from '@/lib/llm/client';
import { PaperStructure } from '@/lib/llm/paperSchema';
import { sanitizeFilename } from '@/lib/security/sanitize';

export interface CreatePaperInput {
  name: string;
  questionFile?: { buffer: Buffer; originalname: string } | null;
  rubricFile?: { buffer: Buffer; originalname: string } | null;
  /** Escape hatch for tests and scripted setup — skips PDF parsing entirely. */
  questions?: PaperStructure['questions'] | null;
}

/**
 * A question's marks must equal the sum of its rubric points, otherwise a paper can be
 * created whose maximum is unreachable or whose points overflow it. The grading firewall
 * checks the same invariant per run; this stops a bad paper being stored in the first place.
 */
export function reconcileMarks(structure: PaperStructure): PaperStructure {
  return {
    questions: structure.questions.map((q) => {
      const pointsTotal = q.rubricPoints.reduce((sum, rp) => sum + rp.maxMarks, 0);
      if (Math.abs(pointsTotal - q.maxMarks) < 0.001) return q;

      console.warn(
        `[paper] Q${q.number}: stated ${q.maxMarks} marks but rubric points sum to ${pointsTotal}; using the rubric sum`
      );
      return { ...q, maxMarks: pointsTotal };
    }),
  };
}

export function assertUsable(structure: PaperStructure): void {
  if (structure.questions.length === 0) {
    throw new Error('RUBRIC_EMPTY: No questions could be read from the uploaded documents.');
  }

  const withoutPoints = structure.questions.filter((q) => q.rubricPoints.length === 0);
  if (withoutPoints.length > 0) {
    throw new Error(
      `RUBRIC_EMPTY: Question ${withoutPoints.map((q) => q.number).join(', ')} has no rubric points.`
    );
  }

  const totalMarks = structure.questions.reduce((sum, q) => sum + q.maxMarks, 0);
  if (totalMarks <= 0) {
    throw new Error('RUBRIC_EMPTY: The marking scheme awards no marks.');
  }
}

/**
 * Creates a paper from the uploaded question paper and marking rubric, reading the rubric
 * out of the PDFs rather than assuming one. If the documents cannot be read this throws —
 * substituting a placeholder rubric would silently grade every student against the wrong
 * marking scheme, which looks like it worked.
 */
export async function createPaperFromUpload(input: CreatePaperInput) {
  const { name, questionFile, rubricFile } = input;

  let questionPath: string | null = null;
  let rubricPath: string | null = null;

  if (questionFile) {
    questionPath = await saveOriginalFile(
      questionFile.buffer,
      `question_${sanitizeFilename(questionFile.originalname)}`
    );
  }
  if (rubricFile) {
    rubricPath = await saveOriginalFile(
      rubricFile.buffer,
      `rubric_${sanitizeFilename(rubricFile.originalname)}`
    );
  }

  let structure: PaperStructure;

  if (input.questions && input.questions.length > 0) {
    structure = { questions: input.questions };
  } else {
    if (!rubricFile && !questionFile) {
      throw new Error(
        'RUBRIC_REQUIRED: Upload a question paper and a model answer / marking rubric so the ' +
          'grader knows what to mark against.'
      );
    }

    const [questionText, rubricText] = await Promise.all([
      questionFile
        ? extractTextWithPositionsFromBuffer(questionFile.buffer).then((r) => r.fullText)
        : Promise.resolve(null),
      rubricFile
        ? extractTextWithPositionsFromBuffer(rubricFile.buffer).then((r) => r.fullText)
        : Promise.resolve(null),
    ]);

    const call = await extractPaperStructure({
      questionPaperText: questionText,
      rubricText,
    });
    structure = call.result;
    console.log(`[paper] rubric extracted by ${call.provider}/${call.model}`);
  }

  structure = reconcileMarks(structure);
  assertUsable(structure);

  return prisma.paper.create({
    data: {
      name,
      questionFile: questionPath,
      rubricFile: rubricPath,
      questions: {
        create: structure.questions.map((q) => ({
          number: q.number,
          text: q.text,
          maxMarks: q.maxMarks,
          rubricPoints: {
            create: q.rubricPoints.map((rp) => ({
              description: rp.description,
              maxMarks: rp.maxMarks,
              expected: rp.expected,
            })),
          },
        })),
      },
    },
    include: { questions: { include: { rubricPoints: true }, orderBy: { number: 'asc' } } },
  });
}
