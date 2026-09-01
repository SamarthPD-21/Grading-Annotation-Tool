import { describe, it, expect } from 'vitest';
import {
  sanitizeString,
  sanitizeFilename,
  validatePdfFile,
  MAX_FILE_SIZE_BYTES,
} from '@/lib/security/sanitize';

describe('Sanitize Helpers', () => {
  describe('sanitizeString', () => {
    it('should strip basic HTML tags and trim', () => {
      const input = '  <script>alert("xss")</script> Hello <b>World</b>  ';
      const output = sanitizeString(input);
      expect(output).toBe('Hello World');
    });

    it('should handle nested/recursive HTML tags', () => {
      const input = '<<script>script>alert(1)<</script>/script>Clean text';
      const output = sanitizeString(input);
      expect(output).toBe('Clean text');
    });

    it('should strip HTML comments', () => {
      const input = 'Before <!-- Secret comment --> After';
      const output = sanitizeString(input);
      expect(output).toBe('Before  After');
    });

    it('should strip null bytes and control characters', () => {
      const input = 'Hello\0\x08World\x1F!';
      const output = sanitizeString(input);
      expect(output).toBe('HelloWorld!');
    });

    it('should enforce maxLength limit', () => {
      const input = 'A'.repeat(50);
      const output = sanitizeString(input, 10);
      expect(output).toHaveLength(10);
      expect(output).toBe('AAAAAAAAAA');
    });

    it('should handle non-string or empty input safely', () => {
      expect(sanitizeString('')).toBe('');
      // @ts-expect-error testing non-string input
      expect(sanitizeString(null)).toBe('');
      // @ts-expect-error testing non-string input
      expect(sanitizeString(undefined)).toBe('');
    });
  });

  describe('sanitizeFilename', () => {
    it('should remove path traversal attempts (../ and ..\\) and extract safe basename', () => {
      expect(sanitizeFilename('../../etc/passwd')).toBe('passwd');
      expect(sanitizeFilename('..\\..\\windows\\system32\\cmd.exe')).toBe('cmd.exe');
      expect(sanitizeFilename('..')).toBe('unnamed_file');
      expect(sanitizeFilename('../../../test.pdf')).toBe('test.pdf');
    });

    it('should strip null bytes and invalid characters', () => {
      const input = 'bad\0file name*?.pdf';
      const output = sanitizeFilename(input);
      expect(output).toBe('badfile_name_.pdf');
    });

    it('should remove leading dots to prevent hidden files', () => {
      expect(sanitizeFilename('.bashrc')).toBe('bashrc');
      expect(sanitizeFilename('.env.local')).toBe('env.local');
    });

    it('should rename Windows reserved names safely', () => {
      expect(sanitizeFilename('CON.pdf')).toBe('safe_CON.pdf');
      expect(sanitizeFilename('aux.txt')).toBe('safe_aux.txt');
      expect(sanitizeFilename('NUL')).toBe('safe_NUL');
      expect(sanitizeFilename('com1.pdf')).toBe('safe_com1.pdf');
    });

    it('should truncate excessively long filenames while preserving extension', () => {
      const longName = 'A'.repeat(300) + '.pdf';
      const sanitized = sanitizeFilename(longName, 50);
      expect(sanitized.length).toBeLessThanOrEqual(50);
      expect(sanitized.endsWith('.pdf')).toBe(true);
    });

    it('should return fallback name if input becomes empty', () => {
      expect(sanitizeFilename('')).toBe('unnamed_file');
      expect(sanitizeFilename('   ')).toBe('unnamed_file');
      expect(sanitizeFilename('///')).toBe('unnamed_file');
    });
  });

  describe('validatePdfFile', () => {
    it('should accept valid PDF file metadata', () => {
      const file = {
        name: 'student_submission.pdf',
        size: 2 * 1024 * 1024, // 2MB
        type: 'application/pdf',
      };
      const result = validatePdfFile(file);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject non-PDF extension', () => {
      const file = {
        name: 'malicious.exe',
        size: 1024,
        type: 'application/pdf',
      };
      const result = validatePdfFile(file);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('.pdf extension');
    });

    it('should reject invalid MIME type', () => {
      const file = {
        name: 'script.pdf',
        size: 1024,
        type: 'text/html',
      };
      const result = validatePdfFile(file);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('application/pdf');
    });

    it('should reject empty files (size <= 0)', () => {
      const file = {
        name: 'empty.pdf',
        size: 0,
        type: 'application/pdf',
      };
      const result = validatePdfFile(file);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('empty');
    });

    it('should reject files exceeding 15MB', () => {
      const file = {
        name: 'huge.pdf',
        size: MAX_FILE_SIZE_BYTES + 1024,
        type: 'application/pdf',
      };
      const result = validatePdfFile(file);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('15MB');
    });

    it('should reject null or undefined file', () => {
      expect(validatePdfFile(null).valid).toBe(false);
      expect(validatePdfFile(undefined).valid).toBe(false);
    });
  });
});
