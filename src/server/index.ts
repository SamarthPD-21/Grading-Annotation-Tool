import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { prisma } from '../lib/db/prisma';
import { saveOriginalFile } from '../lib/storage/files';
import { extractTextWithPositions } from '../lib/pdf/extract';
import { createSubmission, listSubmissions, getSubmissionWithDetails } from '../services/submission.service';
import { createPaperFromUpload } from '../services/paper.service';
import { toSubmissionError } from '../lib/llm/errors';
import { executeGrading } from '../services/grading.service';
import {
  exportAnnotatedPdfService,
  updateAnnotation,
  deleteAnnotation,
  parseAnnotationPatch,
} from '../services/annotation.service';
import { getGradingDispatcher } from '../lib/queue/grading';
import { sanitizeString, sanitizeFilename, validatePdfFile } from '../lib/security/sanitize';

const app = express();
const PORT = process.env.PORT || 4000;

// Enable CORS & JSON parsing
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Multer memory storage configuration for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB limit
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// GET /api/papers
app.get('/api/papers', async (req, res) => {
  try {
    const papers = await prisma.paper.findMany({
      orderBy: { createdAt: 'desc' },
      include: { questions: { include: { rubricPoints: true } } },
    });
    res.json({ papers });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to list papers' });
  }
});

// POST /api/papers — Upload Question Paper & Rubric
app.post(
  '/api/papers',
  upload.fields([
    { name: 'questionFile', maxCount: 1 },
    { name: 'rubricFile', maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const name = sanitizeString(req.body.name || 'Untitled Assessment', 100);
      const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;

      const qFile = files?.questionFile?.[0];
      const rFile = files?.rubricFile?.[0];

      for (const file of [qFile, rFile]) {
        if (!file) continue;
        const check = validatePdfFile({ name: file.originalname, type: file.mimetype, size: file.size });
        if (!check.valid) {
          res.status(400).json({ error: check.error });
          return;
        }
      }

      // Optional escape hatch: post a rubric directly instead of having it read from a PDF.
      let questions = null;
      if (req.body.questions) {
        try {
          questions = JSON.parse(req.body.questions);
        } catch {
          res.status(400).json({ error: 'questions must be valid JSON' });
          return;
        }
      }

      const paper = await createPaperFromUpload({ name, questionFile: qFile, rubricFile: rFile, questions });

      res.status(201).json({ paperId: paper.id, paper });
    } catch (err: any) {
      console.error('[API /api/papers] Error:', err);
      const { errorCode, errorMessage } = toSubmissionError(err);
      // A rubric we could not read is the caller's problem to fix, not a server fault.
      const isInput =
        errorCode.startsWith('RUBRIC_') || errorCode === 'LLM_BAD_REQUEST' || errorCode === 'LLM_PARSE_ERROR';
      res.status(isInput ? 422 : 500).json({ error: errorMessage, errorCode });
    }
  }
);

// GET /api/submissions
app.get('/api/submissions', async (req, res) => {
  try {
    const submissions = await listSubmissions();
    res.json(submissions);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to list submissions' });
  }
});

// POST /api/submissions — Create student submission
app.post('/api/submissions', upload.single('studentFile'), async (req, res) => {
  try {
    const { paperId } = req.body;
    const file = req.file;

    if (!paperId) {
      res.status(400).json({ error: 'paperId is required' });
      return;
    }

    if (!file) {
      res.status(400).json({ error: 'studentFile PDF is required' });
      return;
    }

    const safeName = sanitizeFilename(file.originalname);
    const savedPath = await saveOriginalFile(file.buffer, `student_${Date.now()}_${safeName}`);

    const submission = await createSubmission(paperId, savedPath);
    res.status(201).json({ submissionId: submission.id, submission });
  } catch (err: any) {
    console.error('[API /api/submissions] Error:', err);
    res.status(500).json({ error: err.message || 'Failed to create submission' });
  }
});

// GET /api/submissions/:id — Submission detail with grading runs and annotations
app.get('/api/submissions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const submission = await getSubmissionWithDetails(id);
    if (!submission) {
      res.status(404).json({ error: `Submission ${id} not found` });
      return;
    }
    res.json(submission);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch submission' });
  }
});

// GET /api/submissions/:id/text — Extract and return PDF text per page
app.get('/api/submissions/:id/text', async (req, res) => {
  try {
    const { id } = req.params;
    const submission = await getSubmissionWithDetails(id);
    if (!submission) {
      res.status(404).json({ error: `Submission ${id} not found` });
      return;
    }

    if (!fs.existsSync(submission.studentFile)) {
      res.json({
        missingFile: true,
        pages: [{ pageNumber: 1, text: '', items: [], width: 612, height: 792 }],
      });
      return;
    }

    const extraction = await extractTextWithPositions(submission.studentFile);
    res.json(extraction);
  } catch (err: any) {
    console.error(`[API /api/submissions/${req.params.id}/text] Error:`, err);
    res.status(500).json({ error: err.message || 'Failed to extract text from submission PDF' });
  }
});

// GET /api/submissions/:id/file — Stream the ORIGINAL student PDF for the viewer.
// Read-only: the annotated copy lives under uploads/generated and is served by /export.
app.get('/api/submissions/:id/file', async (req, res) => {
  try {
    const { id } = req.params;
    const submission = await getSubmissionWithDetails(id);
    if (!submission) {
      res.status(404).json({ error: `Submission ${id} not found` });
      return;
    }

    if (!fs.existsSync(submission.studentFile)) {
      res.status(404).json({ error: 'Original PDF is no longer on disk', errorCode: 'FILE_MISSING' });
      return;
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="submission-${id}.pdf"`);
    fs.createReadStream(submission.studentFile).pipe(res);
  } catch (err: any) {
    console.error(`[API /api/submissions/${req.params.id}/file] Error:`, err);
    res.status(500).json({ error: err.message || 'Failed to read submission PDF' });
  }
});

// POST /api/submissions/:id/grade — Execute grading
app.post('/api/submissions/:id/grade', async (req, res) => {
  try {
    const { id } = req.params;
    const dispatcher = getGradingDispatcher();
    await dispatcher.enqueue(id);
    res.json({ message: 'Grading job queued', submissionId: id });
  } catch (err: any) {
    console.error(`[API /api/submissions/${req.params.id}/grade] Error:`, err);
    res.status(500).json({ error: err.message || 'Failed to queue grading job' });
  }
});

// GET /api/submissions/:id/export — Export annotated PDF
app.get('/api/submissions/:id/export', async (req, res) => {
  try {
    const { id } = req.params;
    const exportedPath = await exportAnnotatedPdfService(id);

    if (!fs.existsSync(exportedPath)) {
      res.status(404).json({ error: 'Annotated file not generated' });
      return;
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="annotated_${id}.pdf"`);
    fs.createReadStream(exportedPath).pipe(res);
  } catch (err: any) {
    console.error(`[API /api/submissions/${req.params.id}/export] Error:`, err);
    const message = err.message || 'Failed to export annotated PDF';
    if (message.startsWith('NOT_GRADED:')) {
      res.status(409).json({ error: message.replace('NOT_GRADED: ', ''), errorCode: 'NOT_GRADED' });
      return;
    }
    res.status(500).json({ error: message });
  }
});

// PATCH /api/annotations/:id — Update annotation
app.patch('/api/annotations/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const patch = parseAnnotationPatch(req.body);
    const annotation = await updateAnnotation(id, patch);
    res.json({ annotation });
  } catch (err: any) {
    const message = err.message || 'Failed to update annotation';
    if (message.startsWith('INVALID_PATCH:')) {
      res.status(400).json({ error: message.replace('INVALID_PATCH: ', '') });
      return;
    }
    // Prisma raises P2025 when the row is gone — that is a 404, not a server fault.
    if (err.code === 'P2025') {
      res.status(404).json({ error: `Annotation ${req.params.id} not found` });
      return;
    }
    res.status(500).json({ error: message });
  }
});

// DELETE /api/annotations/:id — Delete annotation
app.delete('/api/annotations/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await deleteAnnotation(id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete annotation' });
  }
});

// Start Express API Server
app.listen(PORT, () => {
  console.log(`[GradeSense API Backend] Server listening on http://localhost:${PORT}`);
});
