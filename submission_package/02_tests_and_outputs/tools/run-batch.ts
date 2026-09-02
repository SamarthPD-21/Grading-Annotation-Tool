/**
 * Runs every script in the evaluation set through the real GradeSense pipeline and
 * writes the outputs that go into the submission package.
 *
 *   npx tsx submission_package/02_tests_and_outputs/tools/run-batch.ts
 *
 * This is the same code path the web app uses — the paper is ingested from the question
 * and rubric PDFs by the model (no hardcoded rubric), each script is graded through the
 * provider chain, and each graded submission is exported as an annotated PDF. Nothing
 * here fabricates a result: every number in outputs/ came out of a live run.
 *
 * Outputs:
 *   outputs/paper_structure.json          the rubric as it was read out of the PDFs
 *   outputs/per_submission/<ID>.json      full grading detail per script
 *   outputs/annotated/<ID>_annotated.pdf  the exported annotated answer paper
 *   outputs/results_summary.csv           expected vs awarded, per question
 *   outputs/run_log.txt                   provider/model actually used, timings
 */
import fs from 'node:fs';
import path from 'node:path';
import { createPaperFromUpload } from '@/services/paper.service';
import { createSubmission, getSubmissionWithDetails } from '@/services/submission.service';
import { executeGrading } from '@/services/grading.service';
import { exportAnnotatedPdfService } from '@/services/annotation.service';
import { saveOriginalFile } from '@/lib/storage/files';
import { prisma } from '@/lib/db/prisma';

try {
  process.loadEnvFile('.env');
} catch {
  console.warn('[batch] no .env found — relying on the ambient environment');
}

const ROOT = path.resolve('submission_package/02_tests_and_outputs');
const DATASET = path.join(ROOT, 'dataset');
const OUT = path.join(ROOT, 'outputs');

const QUESTION_PAPER = path.join(DATASET, 'question_paper.pdf');
const RUBRIC = path.join(DATASET, 'model_answer_and_rubric.pdf');

interface ScriptMeta {
  id: string;
  split: string;
  file: string;
  name: string;
  roll: string;
  profile: string;
  expected: { q1: number; q2: number; q3: number; total: number };
  tests: string;
}

const manifest: { scripts: ScriptMeta[] } = JSON.parse(
  fs.readFileSync(path.join(DATASET, 'manifest.json'), 'utf-8')
);

const log: string[] = [];
const say = (line: string) => {
  console.log(line);
  log.push(line);
};

function mkdirp(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

async function main() {
  const args = process.argv.slice(2);
  const only = args.filter((a) => !a.startsWith('-'));
  // Reuse an already-ingested paper instead of parsing the PDFs again, so the set can be
  // graded in several sittings without spending a model call on the rubric each time.
  const reusePaperId = args.find((a) => a.startsWith('--paper='))?.slice('--paper='.length);
  // Skip scripts that already have a result on disk — grading is incremental and a run
  // that stops halfway can simply be started again.
  const resume = args.includes('--resume');
  const startedAt = Date.now();

  mkdirp(path.join(OUT, 'per_submission'));
  mkdirp(path.join(OUT, 'annotated'));

  say(`GradeSense batch run — ${new Date().toISOString()}`);
  say(`chain: ${process.env.LLM_PROVIDER_CHAIN ?? '(default)'}`);
  say('');

  // ---- 1. Ingest the paper. The rubric is read out of the PDFs, not hardcoded. ----
  say('[1/3] Ingesting question paper + marking rubric …');
  const paperStart = Date.now();
  const paper = reusePaperId
    ? await prisma.paper.findUniqueOrThrow({
        where: { id: reusePaperId },
        include: { questions: { include: { rubricPoints: true }, orderBy: { number: 'asc' } } },
      })
    : await createPaperFromUpload({
        name: `GradeSense Evaluation Set — ${new Date().toISOString().slice(0, 10)}`,
        questionFile: {
          buffer: fs.readFileSync(QUESTION_PAPER),
          originalname: 'question_paper.pdf',
        },
        rubricFile: {
          buffer: fs.readFileSync(RUBRIC),
          originalname: 'model_answer_and_rubric.pdf',
        },
      });
  if (reusePaperId) say(`      reusing paper ${paper.id} — no rubric call made`);

  const pointCount = paper.questions.reduce((n, q) => n + q.rubricPoints.length, 0);
  const paperMax = paper.questions.reduce((n, q) => n + q.maxMarks, 0);
  say(
    `      paper ${paper.id}: ${paper.questions.length} questions, ${pointCount} rubric points, ` +
      `${paperMax} marks  (${((Date.now() - paperStart) / 1000).toFixed(1)}s)`
  );
  fs.writeFileSync(
    path.join(OUT, 'paper_structure.json'),
    JSON.stringify(
      {
        paperId: paper.id,
        name: paper.name,
        totalMarks: paperMax,
        questions: paper.questions.map((q) => ({
          number: q.number,
          text: q.text,
          maxMarks: q.maxMarks,
          rubricPoints: q.rubricPoints.map((rp) => ({
            id: rp.id,
            description: rp.description,
            maxMarks: rp.maxMarks,
            expected: rp.expected,
          })),
        })),
      },
      null,
      2
    )
  );
  say('');

  // ---- 2. Grade every script through the same pipeline the web app uses. ----
  const done = (id: string) => fs.existsSync(path.join(OUT, 'per_submission', `${id}.json`));
  const targets = manifest.scripts
    .filter((m) => only.length === 0 || only.includes(m.id))
    .filter((m) => !resume || !done(m.id));
  say(`[2/3] Grading ${targets.length} scripts …`);
  if (resume) say(`      (${manifest.scripts.filter((m) => done(m.id)).length} already on disk)`);

  for (const meta of targets) {
    const src = path.join(DATASET, meta.split, meta.file);
    const stored = await saveOriginalFile(fs.readFileSync(src), `student_${meta.id}.pdf`);
    const submission = await createSubmission(paper.id, stored);
    const t0 = Date.now();

    let status = 'FAILED';
    let error: string | null = null;
    try {
      await executeGrading(submission.id);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      say(`      ${meta.id}  FAILED — ${error}`);
    }

    const detail = await getSubmissionWithDetails(submission.id);
    if (!detail) throw new Error(`submission ${submission.id} vanished`);
    status = detail.status;
    const run = detail.gradingRuns[0];
    const seconds = ((Date.now() - t0) / 1000).toFixed(1);

    // Per-question totals, from the rubric points each result belongs to.
    const perQuestion = new Map<number, { awarded: number; max: number }>();
    const questionOf = new Map<string, number>();
    for (const q of detail.paper.questions) {
      for (const rp of q.rubricPoints) questionOf.set(rp.id, q.number);
      perQuestion.set(q.number, { awarded: 0, max: q.maxMarks });
    }
    for (const r of run?.results ?? []) {
      const n = questionOf.get(r.rubricPointId);
      if (n != null) perQuestion.get(n)!.awarded += r.marksAwarded;
    }

    let annotatedOut: string | null = null;
    if (run) {
      try {
        const exported = await exportAnnotatedPdfService(submission.id);
        annotatedOut = path.join(OUT, 'annotated', `${meta.id}_${meta.name.replace(/\s+/g, '-')}_annotated.pdf`);
        fs.copyFileSync(exported, annotatedOut);
      } catch (err) {
        say(`      ${meta.id}  export failed — ${String(err)}`);
      }
    }

    const awarded = {
      q1: perQuestion.get(1)?.awarded ?? 0,
      q2: perQuestion.get(2)?.awarded ?? 0,
      q3: perQuestion.get(3)?.awarded ?? 0,
    };
    const total = run?.totalMarks ?? 0;
    const delta = +(total - meta.expected.total).toFixed(2);

    say(
      `      ${meta.id}  ${String(total).padStart(5)} / ${run?.maxMarks ?? paperMax}   ` +
        `(expected ${meta.expected.total})   Δ ${delta >= 0 ? '+' : ''}${delta}   ` +
        `${status}   ${run?.provider ?? '-'}/${run?.model ?? '-'}   ` +
        `${detail.annotations.length} boxes   ${seconds}s`
    );

    const record = {
      script: meta,
      submissionId: submission.id,
      status,
      error,
      totalMarks: total,
      maxMarks: run?.maxMarks ?? paperMax,
      perQuestion: Object.fromEntries(perQuestion),
      gradedBy: run ? { provider: run.provider, model: run.model, fallbackUsed: run.fallbackUsed } : null,
      promptVersion: run?.promptVersion ?? null,
      engineVersion: run?.gradingEngineVersion ?? null,
      evidenceBoxes: detail.annotations.length,
      results: (run?.results ?? []).map((r) => ({
        question: questionOf.get(r.rubricPointId),
        rubricPoint: r.rubricPoint.description,
        maxMarks: r.rubricPoint.maxMarks,
        expectedAnswer: r.rubricPoint.expected,
        status: r.status,
        marksAwarded: r.marksAwarded,
        confidence: r.confidence,
        humanReview: r.humanReview,
        evidenceText: r.evidenceText,
        evidencePage: r.evidencePage,
        evidenceLocated: Boolean(r.evidenceBBox),
        feedback: r.feedback,
        correction: r.correction,
      })),
      annotatedPdf: annotatedOut ? path.relative(OUT, annotatedOut) : null,
    };
    fs.writeFileSync(
      path.join(OUT, 'per_submission', `${meta.id}.json`),
      JSON.stringify(record, null, 2)
    );
  }

  // ---- 3. Rebuild the summary from every result on disk. ----
  // Built from the files rather than from this run's targets, so grading the set in
  // several sittings still produces one complete summary.
  const summaries = manifest.scripts
    .map((m) => path.join(OUT, 'per_submission', `${m.id}.json`))
    .filter((f) => fs.existsSync(f))
    .map((f) => JSON.parse(fs.readFileSync(f, 'utf-8')));

  const rows = [
    'id,split,student,expected_q1,awarded_q1,expected_q2,awarded_q2,expected_q3,awarded_q3,' +
      'expected_total,awarded_total,max_marks,delta,status,provider,model,fallback_used,' +
      'evidence_boxes',
  ];
  for (const r of summaries) {
    rows.push(
      [
        r.script.id,
        r.script.split,
        `"${r.script.name}"`,
        r.script.expected.q1,
        r.perQuestion['1']?.awarded ?? '',
        r.script.expected.q2,
        r.perQuestion['2']?.awarded ?? '',
        r.script.expected.q3,
        r.perQuestion['3']?.awarded ?? '',
        r.script.expected.total,
        r.totalMarks,
        r.maxMarks,
        +(r.totalMarks - r.script.expected.total).toFixed(2),
        r.status,
        r.gradedBy?.provider ?? '',
        r.gradedBy?.model ?? '',
        r.gradedBy?.fallbackUsed ?? '',
        r.evidenceBoxes,
      ].join(',')
    );
  }
  fs.writeFileSync(path.join(OUT, 'results_summary.csv'), rows.join('\n') + '\n');
  fs.writeFileSync(
    path.join(OUT, 'results_summary.json'),
    JSON.stringify({ paperId: paper.id, runAt: new Date().toISOString(), summaries }, null, 2)
  );

  say('');
  say('[3/3] Agreement with the human marker');
  const graded = summaries.filter((s) => s.gradedBy);
  const deltas = graded.map((s) => s.totalMarks - s.script.expected.total);
  const mae = deltas.reduce((a, d) => a + Math.abs(d), 0) / (deltas.length || 1);
  const within1 = deltas.filter((d) => Math.abs(d) <= 1).length;
  const within15 = deltas.filter((d) => Math.abs(d) <= 1.5).length;
  const located = graded.reduce(
    (acc, s) => {
      acc.found += s.results.filter((r: { evidenceLocated: boolean }) => r.evidenceLocated).length;
      acc.total += s.results.length;
      return acc;
    },
    { found: 0, total: 0 }
  );
  say(`      scripts graded        : ${graded.length}/${manifest.scripts.length}`);
  say(`      mean absolute error   : ${mae.toFixed(2)} marks (out of ${paperMax})`);
  say(`      within ±1.0 mark      : ${within1}/${graded.length}`);
  say(`      within ±1.5 marks     : ${within15}/${graded.length}`);
  say(`      evidence located      : ${located.found}/${located.total} rubric points`);
  say(`      this run's wall clock : ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);

  fs.appendFileSync(path.join(OUT, 'run_log.txt'), log.join('\n') + '\n\n');
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  fs.appendFileSync(path.join(OUT, 'run_log.txt'), log.join('\n') + `\n\nFAILED: ${String(err)}\n\n`);
  await prisma.$disconnect();
  process.exit(1);
});
