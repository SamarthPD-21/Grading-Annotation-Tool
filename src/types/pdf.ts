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
  bbox: BoundingBox;
}

export interface ExtractedPageText {
  pageNumber: number;
  text: string;
  items: TextItem[];
  /** Page size in PDF points at scale 1.0. Overlay coords are in this space. */
  width: number;
  height: number;
}
