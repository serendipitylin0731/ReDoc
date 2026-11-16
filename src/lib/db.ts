import { openDB, type DBSchema, type IDBPDatabase, type StoreNames } from "idb";
import type { Asset, Course, Folder, Job, Note, ReconstructionDocument, SourceAnchor } from "@app/types";

interface RedocDB extends DBSchema {
  courses: { key: string; value: Course; indexes: { updatedAt: string } };
  folders: { key: string; value: Folder; indexes: { courseId: string } };
  assets: { key: string; value: Asset; indexes: { courseId: string; sha256: string } };
  anchors: { key: string; value: SourceAnchor; indexes: { assetId: string } };
  notes: { key: string; value: Note; indexes: { courseId: string; updatedAt: string } };
  documents: { key: string; value: ReconstructionDocument; indexes: { assetId: string; courseId: string } };
  jobs: { key: string; value: Job; indexes: { courseId: string; updatedAt: string } };
  preferences: { key: string; value: unknown };
}

let database: Promise<IDBPDatabase<RedocDB>> | undefined;

export function getDb() {
  database ??= openDB<RedocDB>("redoc-workbench", 1, {
    upgrade(db) {
      const courses = db.createObjectStore("courses", { keyPath: "id" });
      courses.createIndex("updatedAt", "updatedAt");
      const folders = db.createObjectStore("folders", { keyPath: "id" });
      folders.createIndex("courseId", "courseId");
      const assets = db.createObjectStore("assets", { keyPath: "id" });
      assets.createIndex("courseId", "courseId");
      assets.createIndex("sha256", "sha256");
      const anchors = db.createObjectStore("anchors", { keyPath: "id" });
      anchors.createIndex("assetId", "assetId");
      const notes = db.createObjectStore("notes", { keyPath: "id" });
      notes.createIndex("courseId", "courseId");
      notes.createIndex("updatedAt", "updatedAt");
      const documents = db.createObjectStore("documents", { keyPath: "id" });
      documents.createIndex("assetId", "assetId");
      documents.createIndex("courseId", "courseId");
      const jobs = db.createObjectStore("jobs", { keyPath: "id" });
      jobs.createIndex("courseId", "courseId");
      jobs.createIndex("updatedAt", "updatedAt");
      db.createObjectStore("preferences");
    },
  });
  return database;
}

export async function getAll<Name extends StoreNames<RedocDB>>(store: Name) {
  return (await getDb()).getAll(store);
}

export async function getRecord<Name extends StoreNames<RedocDB>>(store: Name, id: string) {
  return (await getDb()).get(store, id);
}

export async function putRecord<Name extends StoreNames<RedocDB>>(store: Name, value: RedocDB[Name]["value"], key?: string) {
  await (await getDb()).put(store, value, key);
}

export async function deleteRecord<Name extends StoreNames<RedocDB>>(store: Name, id: string) {
  await (await getDb()).delete(store, id);
}

export async function saveNote(note: Note) {
  const db = await getDb();
  const tx = db.transaction("notes", "readwrite");
  const current = await tx.store.get(note.id);
  if (current && current.version !== note.version) {
    await tx.done;
    throw new Error("version_conflict");
  }
  const saved = { ...note, version: current ? current.version + 1 : 1 };
  await tx.store.put(saved);
  await tx.done;
  return saved;
}

export async function sha256(blob: Blob) {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function detectAssetKind(file: File | Blob, name: string): Asset["kind"] {
  const mime = file.type.toLowerCase();
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  if (mime === "application/pdf" || extension === "pdf") return "pdf";
  if (mime.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "gif", "bmp"].includes(extension)) return "image";
  if (mime.startsWith("video/") || ["mp4", "webm", "mov", "m4v"].includes(extension)) return "video";
  if (mime.startsWith("audio/") || ["mp3", "wav", "m4a", "ogg"].includes(extension)) return "audio";
  if (extension === "md" || extension === "markdown") return "markdown";
  if (extension === "csv") return "csv";
  if (mime.startsWith("text/") || ["txt", "json", "log"].includes(extension)) return "text";
  if (["doc", "docx", "ppt", "pptx", "xls", "xlsx", "key", "numbers"].includes(extension)) return "office";
  return "unsupported";
}

export function sourceLabel(anchor: Pick<SourceAnchor, "kind" | "page" | "startMs" | "endMs">, assetName: string) {
  if (anchor.page) return `${assetName} · 第 ${anchor.page} 页`;
  if (anchor.startMs !== undefined) {
    const range = anchor.endMs && anchor.endMs !== anchor.startMs ? `–${formatTime(anchor.endMs)}` : "";
    return `${assetName} · ${formatTime(anchor.startMs)}${range}`;
  }
  return `${assetName} · 原文摘录`;
}

export function formatTime(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export async function seedSampleCourse() {
  const db = await getDb();
  if ((await db.count("courses")) > 0) return;
  const [pdfResponse, markdownResponse, imageResponse] = await Promise.all([
    fetch("/samples/gradient-lecture.pdf"),
    fetch("/samples/reading-notes.md"),
    fetch("/samples/gradient-diagram.png"),
  ]);
  if (!pdfResponse.ok || !markdownResponse.ok || !imageResponse.ok) throw new Error("demo_assets_unavailable");
  const [pdfBlob, markdownBlob, imageBlob] = await Promise.all([pdfResponse.blob(), markdownResponse.blob(), imageResponse.blob()]);

  const { Document, HeadingLevel, Packer, Paragraph, TextRun } = await import("docx");
  const docxBlob = await Packer.toBlob(new Document({
    creator: "ReDoc",
    title: "课程大纲与考核方式",
    sections: [{ properties: {}, children: [
      new Paragraph({ text: "课程大纲与考核方式", heading: HeadingLevel.TITLE }),
      new Paragraph({ children: [new TextRun({ text: "示例课程 · 多元函数微分学", bold: true, size: 24 })] }),
      new Paragraph({ text: "一、课程内容：偏导数、方向导数、梯度与多元函数极值。" }),
      new Paragraph({ text: "二、考核方式：平时作业 30%，期中考试 30%，期末考试 40%。" }),
    ] }],
  }));

  const now = new Date().toISOString();
  const course: Course = {
    id: crypto.randomUUID(),
    title: "示例课程——多元函数微分学",
    description: "演示文件夹嵌套、多格式资料、笔记与文字转换",
    color: "#2563eb",
    icon: "📐",
    pinned: true,
    pinnedAt: now,
    archived: false,
    createdAt: now,
    updatedAt: now,
  };
  const folders: Folder[] = [
    { id: crypto.randomUUID(), courseId: course.id, parentId: null, name: "01 课程讲义", kind: "asset", sortOrder: 1 },
    { id: crypto.randomUUID(), courseId: course.id, parentId: null, name: "02 板书与图像", kind: "asset", sortOrder: 2 },
    { id: crypto.randomUUID(), courseId: course.id, parentId: null, name: "03 延伸阅读", kind: "asset", sortOrder: 3 },
  ];
  const lectureFolder = folders[0];
  const boardFolder = folders[1];
  const readingFolder = folders[2];
  const nestedFolder: Folder = { id: crypto.randomUUID(), courseId: course.id, parentId: lectureFolder.id, name: "01 偏导数与梯度", kind: "asset", sortOrder: 1 };
  folders.push(nestedFolder);

  const baseAsset = { courseId: course.id, status: "ready" as const, version: 1 as const, createdAt: now };
  const assets: Asset[] = [
    { ...baseAsset, id: crypto.randomUUID(), folderId: nestedFolder.id, name: "03 · 偏导数与梯度.pdf", mime: "application/pdf", size: pdfBlob.size, sha256: "sample-pdf-v1", kind: "pdf", blob: pdfBlob },
    { ...baseAsset, id: crypto.randomUUID(), folderId: boardFolder.id, name: "梯度方向示意图.png", mime: "image/png", size: imageBlob.size, sha256: "sample-image-v1", kind: "image", blob: imageBlob },
    { ...baseAsset, id: crypto.randomUUID(), folderId: readingFolder.id, name: "偏导数阅读卡.md", mime: "text/markdown", size: markdownBlob.size, sha256: "sample-md-v1", kind: "markdown", textContent: await markdownBlob.text(), blob: markdownBlob },
    { ...baseAsset, id: crypto.randomUUID(), folderId: lectureFolder.id, name: "课程大纲与考核方式.docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: docxBlob.size, sha256: "sample-docx-v1", kind: "office", blob: docxBlob },
  ];

  const note: Note = {
    id: crypto.randomUUID(), courseId: course.id, folderId: null, title: "课程学习笔记", favorite: false, tags: ["示例"], version: 1, createdAt: now, updatedAt: now,
    blocks: [
      { id: crypto.randomUUID(), type: "heading2", text: "01  重点概念" },
      { id: crypto.randomUUID(), type: "paragraph", text: "梯度把一阶偏导数组织成向量，指向函数值增长最快的方向。" },
      { id: crypto.randomUUID(), type: "math", text: "\\nabla f(x,y)=\\left(\\frac{\\partial f}{\\partial x},\\frac{\\partial f}{\\partial y}\\right)" },
      { id: crypto.randomUUID(), type: "heading3", text: "自测" },
      { id: crypto.randomUUID(), type: "bullet", text: "方向导数何时等于零？" },
      { id: crypto.randomUUID(), type: "bullet", text: "梯度为什么垂直于等高线？" },
    ],
  };

  const tx = db.transaction(["courses", "folders", "assets", "notes"], "readwrite");
  await tx.objectStore("courses").add(course);
  await Promise.all(folders.map((folder) => tx.objectStore("folders").add(folder)));
  await Promise.all(assets.map((asset) => tx.objectStore("assets").add(asset)));
  await tx.objectStore("notes").add(note);
  await tx.done;
}
