// The PDF viewer runs pdf.js in the browser, which needs its worker served as a static
// asset. Copied on install so the file in public/ can never drift from the installed
// pdfjs-dist version (a mismatch makes pdf.js refuse to load the document).
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(root, 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.mjs');
const to = join(root, 'public', 'pdf.worker.min.mjs');

try {
  mkdirSync(join(root, 'public'), { recursive: true });
  copyFileSync(from, to);
  console.log('[pdf-worker] copied to public/pdf.worker.min.mjs');
} catch (err) {
  console.warn('[pdf-worker] copy skipped:', err.message);
}
