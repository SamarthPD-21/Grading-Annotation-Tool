import { describe, it, expect } from 'vitest';
import { findEvidence } from '@/lib/pdf/coordinates';

describe('Test Category 5: OCR Noise & Spelling Errors', () => {
  it('should locate evidence gracefully even when extracted text contains OCR noise', () => {
    const pagesTextItems = [
      {
        pageNumber: 1,
        items: [
          { text: 'Photosynthesiss', page: 1, x: 50, y: 100, width: 100, height: 15 },
          { text: 'occurs', page: 1, x: 155, y: 100, width: 50, height: 15 },
          { text: 'inn', page: 1, x: 210, y: 100, width: 20, height: 15 },
          { text: 'thylakoidd', page: 1, x: 235, y: 100, width: 80, height: 15 },
          { text: 'membrne', page: 1, x: 320, y: 100, width: 70, height: 15 },
        ],
      },
    ];

    const evidenceLoc = findEvidence('photosynthesis occurs in thylakoid membrane', pagesTextItems);

    expect(evidenceLoc).not.toBeNull();
    expect(evidenceLoc?.page).toBe(1);
    expect(evidenceLoc?.bbox.width).toBeGreaterThan(0);
  });
});
