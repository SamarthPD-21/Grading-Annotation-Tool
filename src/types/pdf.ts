export interface TextItem {
  text: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EvidenceLocation {
  page: number;
  /** Union of every rect — the drag anchor and a single-box fallback. */
  bbox: BoundingBox;
  /**
   * One tight rectangle per line of the quote. A quote spanning three lines drew a single
   * union rectangle that covered the full block, swallowing anything between the lines
   * (diagrams included) and overlapping every neighbouring quote.
   */
  rects: BoundingBox[];
}

export interface ExtractedPageText {
  pageNumber: number;
  text: string;
  items: TextItem[];
  /**
   * True when the page paints an image. A page with images but no text is a scan or photo
   * needing OCR; a page with neither is a genuinely blank answer.
   */
  hasImages: boolean;
  /** Page size in PDF points at scale 1.0. Overlay coords are in this space. */
  width: number;
  height: number;
}
