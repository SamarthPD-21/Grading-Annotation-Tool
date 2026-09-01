import { TextItem, ExtractedPageText } from '@/types/pdf';
import fs from 'fs';

export async function extractTextWithPositionsFromBuffer(
  pdfBuffer: Buffer
): Promise<{ fullText: string; pages: ExtractedPageText[] }> {
  try {
    // Dynamic import to support pdfjs-dist in Node environment
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    
    const uint8Array = new Uint8Array(pdfBuffer);
    const loadingTask = pdfjsLib.getDocument({
      data: uint8Array,
      useSystemFonts: true,
      disableFontFace: true,
    });

    const pdfDoc = await loadingTask.promise;
    const pages: ExtractedPageText[] = [];
    let fullText = '';

    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.0 });
      const textContent = await page.getTextContent();
      const pageItems: TextItem[] = [];
      let pageString = '';

      for (const item of textContent.items) {
        if (!('str' in item) || !item.str) continue;
        pageString += item.str + ' ';

        const [, , , scaleY, tx, ty] = item.transform;
        const viewY = viewport.height - ty; // Top-left origin conversion

        pageItems.push({
          text: item.str,
          page: pageNum,
          x: Math.max(0, Math.round(tx)),
          y: Math.max(0, Math.round(viewY)),
          width: Math.max(10, Math.round(item.width || 50)),
          height: Math.max(10, Math.round(item.height || Math.abs(scaleY) || 14)),
        });
      }

      fullText += `--- Page ${pageNum} ---\n` + pageString + '\n\n';
      pages.push({
        pageNumber: pageNum,
        text: pageString.trim(),
        items: pageItems,
        // Carried through so the client can scale overlays from PDF points to rendered px.
        width: Math.round(viewport.width),
        height: Math.round(viewport.height),
      });
    }

    return { fullText: fullText.trim(), pages };
  } catch (error) {
    console.warn('PDF.js extraction failed, falling back to simple buffer text search:', error);
    // Fallback simple extraction for non-standard PDF formats
    const textContent = pdfBuffer.toString('utf-8').replace(/[^\x20-\x7E\n\r\t]/g, ' ');
    return {
      fullText: textContent,
      pages: [
        {
          pageNumber: 1,
          text: textContent,
          items: [],
          // US Letter at 72dpi — the only sane guess when pdfjs could not open the file.
          width: 612,
          height: 792,
        },
      ],
    };
  }
}

export async function extractTextWithPositions(
  filePath: string
): Promise<{ fullText: string; pages: ExtractedPageText[] }> {
  const buffer = await fs.promises.readFile(filePath);
  return extractTextWithPositionsFromBuffer(buffer);
}
