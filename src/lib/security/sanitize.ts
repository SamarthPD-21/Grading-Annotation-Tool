/**
 * Input sanitization and file validation helpers for GradeSense.
 */

export const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15MB
export const ALLOWED_PDF_MIME_TYPE = 'application/pdf';

// Windows reserved filenames (case-insensitive)
const WINDOWS_RESERVED_NAMES = new Set([
  'con', 'prn', 'aux', 'nul',
  'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
  'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9',
]);

/**
 * Strips HTML tags, script/style contents, comments, null bytes, trims whitespace, and limits string length.
 *
 * @param input - The raw string to sanitize
 * @param maxLength - Maximum permitted length (default: 10,000)
 * @returns Sanitized string
 */
export function sanitizeString(input: string, maxLength: number = 10000): string {
  if (typeof input !== 'string') {
    return '';
  }

  // Remove null bytes and control characters (except common whitespace: newline, tab, carriage return)
  let sanitized = input.replace(/\0/g, '').replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // Iteratively strip script/style blocks, comments, and HTML tags to prevent nested/bypassed injections
  let previous: string;
  do {
    previous = sanitized;
    // Strip script elements and their contents
    sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    // Strip style elements and their contents
    sanitized = sanitized.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
    // Strip HTML comments
    sanitized = sanitized.replace(/<!--[\s\S]*?-->/g, '');
    // Strip remaining HTML tags
    sanitized = sanitized.replace(/<[^>]+>/g, '');
  } while (sanitized !== previous);

  // Clean up any stray dangling brackets from malformed tags
  sanitized = sanitized.replace(/</g, '').replace(/>/g, '');

  // Trim whitespace
  sanitized = sanitized.trim();

  // Truncate to maximum length
  if (maxLength > 0 && sanitized.length > maxLength) {
    sanitized = sanitized.slice(0, maxLength);
  }

  return sanitized;
}

/**
 * Sanitizes a filename by removing path traversal characters, null bytes,
 * stripping leading dots, reserving Windows names, and restricting to safe characters.
 *
 * @param filename - The raw filename
 * @param maxLength - Maximum permitted filename length (default: 255)
 * @returns Safe filename
 */
export function sanitizeFilename(filename: string, maxLength: number = 255): string {
  if (typeof filename !== 'string' || !filename.trim()) {
    return 'unnamed_file';
  }

  // Remove null bytes and control characters
  let clean = filename.replace(/[\0\x01-\x1F\x7F]/g, '');

  // Extract base filename (normalize backslashes and slashes to strip directories)
  clean = clean.replace(/\\/g, '/');
  const lastSlashIndex = clean.lastIndexOf('/');
  if (lastSlashIndex !== -1) {
    clean = clean.substring(lastSlashIndex + 1);
  }

  // Remove path traversal sequences (../ or ..\)
  clean = clean.replace(/\.{2,}/g, '.');

  // Replace any characters other than alphanumeric, underscore, hyphen, and dot with underscore
  clean = clean.replace(/[^a-zA-Z0-9._-]/g, '_');

  // Collapse consecutive underscores
  clean = clean.replace(/_+/g, '_');

  // Remove leading dots and underscores to prevent hidden files and traversal
  clean = clean.replace(/^[._]+/, '');

  // Separate name and extension
  const dotIndex = clean.lastIndexOf('.');
  let baseName = dotIndex !== -1 ? clean.slice(0, dotIndex) : clean;
  const ext = dotIndex !== -1 ? clean.slice(dotIndex) : '';

  // If base name is empty or reserved
  if (!baseName) {
    baseName = 'unnamed_file';
  } else if (WINDOWS_RESERVED_NAMES.has(baseName.toLowerCase())) {
    baseName = `safe_${baseName}`;
  }

  // Enforce max length while preserving extension if possible
  const maxBaseLength = Math.max(1, maxLength - ext.length);
  if (baseName.length > maxBaseLength) {
    baseName = baseName.slice(0, maxBaseLength);
  }

  let result = `${baseName}${ext}`;

  if (!result || result === '.') {
    result = 'unnamed_file';
  }

  return result;
}

/**
 * Validates a PDF file's MIME type, size, and extension.
 *
 * @param file - File object or object with name, size, type
 * @returns Validation result object with valid boolean and optional error message
 */
export function validatePdfFile(file: { name?: string; size?: number; type?: string } | null | undefined): {
  valid: boolean;
  error?: string;
} {
  if (!file) {
    return { valid: false, error: 'No file provided.' };
  }

  if (typeof file.size !== 'number' || file.size <= 0) {
    return { valid: false, error: 'File is empty or size is invalid.' };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `File size (${(file.size / (1024 * 1024)).toFixed(2)}MB) exceeds maximum limit of 15MB.`,
    };
  }

  if (!file.name || !file.name.toLowerCase().endsWith('.pdf')) {
    return { valid: false, error: 'File must have a .pdf extension.' };
  }

  if (file.type && file.type !== ALLOWED_PDF_MIME_TYPE) {
    return {
      valid: false,
      error: `Invalid file type "${file.type}". Only application/pdf is allowed.`,
    };
  }

  return { valid: true };
}
