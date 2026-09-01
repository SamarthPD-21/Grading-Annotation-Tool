import fs from 'fs';
import path from 'path';

const UPLOAD_BASE_DIR = process.env.UPLOAD_DIR || './uploads';
const ORIGINALS_DIR = path.join(UPLOAD_BASE_DIR, 'originals');
const GENERATED_DIR = path.join(UPLOAD_BASE_DIR, 'generated');

export function ensureStorageDirectories(): void {
  if (!fs.existsSync(ORIGINALS_DIR)) {
    fs.mkdirSync(ORIGINALS_DIR, { recursive: true });
  }
  if (!fs.existsSync(GENERATED_DIR)) {
    fs.mkdirSync(GENERATED_DIR, { recursive: true });
  }
}

export async function saveOriginalFile(
  fileBuffer: Buffer,
  filename: string
): Promise<string> {
  ensureStorageDirectories();
  const safeFilename = `${Date.now()}-${filename.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
  const filePath = path.join(ORIGINALS_DIR, safeFilename);
  await fs.promises.writeFile(filePath, fileBuffer);
  return filePath;
}

export function getOriginalFilePath(filename: string): string {
  return path.join(ORIGINALS_DIR, filename);
}

export function getGeneratedFilePath(submissionId: string): string {
  ensureStorageDirectories();
  return path.join(GENERATED_DIR, `annotated-${submissionId}.pdf`);
}

export function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}
