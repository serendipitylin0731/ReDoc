export type AssetKind = "pdf" | "image" | "markdown" | "text" | "video" | "audio" | "csv" | "office" | "unsupported";
export type BlockType = "heading1" | "heading2" | "heading3" | "paragraph" | "bullet" | "numbered" | "quote" | "code" | "math" | "table" | "image" | "excerpt";
export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export interface Course {
  id: string;
  title: string;
  description: string;
  color: string;
  icon: string;
  pinned: boolean;
  pinnedAt: string | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Folder {
  id: string;
  courseId: string;
  parentId: string | null;
  name: string;
  kind?: "asset" | "note";
  sortOrder: number;
}

export interface Asset {
  id: string;
  courseId: string;
  folderId: string | null;
  name: string;
  mime: string;
  size: number;
  sha256: string;
  kind: AssetKind;
  status: "uploading" | "ready" | "failed" | "deleted";
  version: 1;
  textContent?: string;
  error?: string;
  demo?: boolean;
  createdAt: string;
  blob: Blob;
}

export interface SourceAnchor {
  id: string;
  assetId: string;
  assetVersion: number;
  kind: "pdf_text" | "page_region" | "image_region" | "video_segment" | "video_frame" | "doc_block";
  page?: number;
  bbox?: [number, number, number, number];
  textQuote?: string;
  textRange?: { start: number; end: number };
  startMs?: number;
  endMs?: number;
  sourceBlockId?: string;
  imageDataUrl?: string;
  createdAt: string;
}

export interface NoteBlock {
  id: string;
  type: BlockType;
  text: string;
  rows?: string[][];
  src?: string;
  sourceAnchorId?: string;
  sourceSnapshot?: {
    assetName: string;
    label: string;
    text?: string;
    imageDataUrl?: string;
  };
  confidence?: number;
  reviewStatus?: "unreviewed" | "confirmed" | "needs_review";
}

export interface Note {
  id: string;
  courseId: string;
  folderId: string | null;
  title: string;
  blocks: NoteBlock[];
  tags: string[];
  favorite: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ReconstructionDocument {
  id: string;
  assetId: string;
  courseId: string;
  extractionVersion: number;
  status: "processing" | "ready" | "failed";
  blocks: NoteBlock[];
  updatedAt: string;
}

export interface Job {
  id: string;
  assetId: string;
  courseId: string;
  assetName: string;
  jobType: "ocr" | "extract" | "export";
  documentId?: string;
  status: JobStatus;
  progress: number;
  errorMessage?: string;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ExcerptInput {
  asset: Asset;
  kind: SourceAnchor["kind"];
  text?: string;
  page?: number;
  bbox?: [number, number, number, number];
  textRange?: { start: number; end: number };
  startMs?: number;
  endMs?: number;
  imageDataUrl?: string;
  noteId: string;
  createNew?: boolean;
}

export interface OrganizeResult {
  title: string;
  markdown: string;
  model: string;
}
