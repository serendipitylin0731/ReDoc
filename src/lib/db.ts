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

export async function seedDemo() {
  const db = await getDb();
  if ((await db.count("courses")) > 0) return;
  const [pdfResponse, markdownResponse, imageResponse] = await Promise.all([
    fetch("/samples/gradient-lecture.pdf"),
    fetch("/samples/reading-notes.md"),
    fetch("/samples/gradient-diagram.png"),
  ]);
  if (!pdfResponse.ok || !markdownResponse.ok || !imageResponse.ok) throw new Error("demo_assets_unavailable");
  const [pdfBlob, markdownBlob, imageBlob] = await Promise.all([pdfResponse.blob(), markdownResponse.blob(), imageResponse.blob()]);
  const now = new Date().toISOString();
  const course: Course = {
    id: "demo-calculus",
    title: "高等数学 · 秋季学期",
    description: "多元函数微分学 · 12 周课程资料与复习笔记",
    color: "#52715f",
    archived: false,
    createdAt: now,
    updatedAt: now,
  };
  const folders: Folder[] = [
    { id: "folder-lectures", courseId: course.id, parentId: null, name: "01 课程讲义", sortOrder: 1 },
    { id: "folder-board", courseId: course.id, parentId: null, name: "02 板书与图像", sortOrder: 2 },
    { id: "folder-reading", courseId: course.id, parentId: null, name: "03 延伸阅读", sortOrder: 3 },
  ];
  const baseAsset = { courseId: course.id, status: "ready" as const, version: 1 as const, createdAt: now, demo: true };
  const assets: Asset[] = [
    { ...baseAsset, id: "demo-pdf", folderId: "folder-lectures", name: "03 · 偏导数与梯度.pdf", mime: "application/pdf", size: pdfBlob.size, sha256: "demo-pdf-original-v1", kind: "pdf", blob: pdfBlob },
    { ...baseAsset, id: "demo-image", folderId: "folder-board", name: "梯度方向示意图.png", mime: "image/png", size: imageBlob.size, sha256: "demo-image-original-v1", kind: "image", blob: imageBlob },
    { ...baseAsset, id: "demo-markdown", folderId: "folder-reading", name: "偏导数阅读卡.md", mime: "text/markdown", size: markdownBlob.size, sha256: "demo-markdown-original-v1", kind: "markdown", textContent: await markdownBlob.text(), blob: markdownBlob },
  ];
  const anchors: SourceAnchor[] = [
    { id: "anchor-gradient", assetId: "demo-pdf", assetVersion: 1, kind: "pdf_text", page: 2, bbox: [0.08, 0.225, 0.91, 0.315], textQuote: "梯度将所有一阶偏导数组织成向量。它既指出函数值增长最快的方向，也用向量长度表示这一方向上的变化率。", createdAt: now },
    { id: "anchor-example", assetId: "demo-pdf", assetVersion: 1, kind: "pdf_text", page: 1, bbox: [0.11, 0.61, 0.84, 0.66], textQuote: "∂f/∂x = 2xy        ∂f/∂y = x² + 9y²", createdAt: now },
  ];
  const notes: Note[] = [
    {
      id: "demo-note-gradient", courseId: course.id, folderId: null, title: "梯度与方向导数｜第三章", favorite: true, tags: ["第三章", "多元微积分"], version: 1, createdAt: now, updatedAt: now,
      blocks: [
        { id: "block-intro", type: "paragraph", text: "这一章的关键不是记住三个公式，而是把“方向”和“变化率”放在同一个向量里理解。" },
        { id: "block-core", type: "heading2", text: "01  核心概念" },
        { id: "block-gradient-source", type: "excerpt", text: anchors[0].textQuote ?? "", sourceAnchorId: anchors[0].id, sourceSnapshot: { assetName: assets[0].name, label: sourceLabel(anchors[0], assets[0].name), text: anchors[0].textQuote } },
        { id: "block-math", type: "math", text: "\\nabla f(x,y)=\\left(\\frac{\\partial f}{\\partial x},\\frac{\\partial f}{\\partial y}\\right)" },
        { id: "block-direction", type: "paragraph", text: "当单位向量 <strong>u</strong> 与梯度同向时，方向导数最大；与梯度垂直时，方向导数为零。" },
        { id: "block-example-heading", type: "heading2", text: "02  用一道例题固定记忆" },
        { id: "block-example", type: "excerpt", text: anchors[1].textQuote ?? "", sourceAnchorId: anchors[1].id, sourceSnapshot: { assetName: assets[0].name, label: sourceLabel(anchors[1], assets[0].name), text: anchors[1].textQuote } },
        { id: "block-check", type: "quote", text: "自测：梯度为什么垂直于等高线？尝试从方向导数为零开始解释。" },
      ],
    },
    {
      id: "demo-note-practice", courseId: course.id, folderId: null, title: "偏导数计算练习", favorite: false, tags: ["练习", "第三章"], version: 1, createdAt: now, updatedAt: now,
      blocks: [
        { id: "practice-1", type: "heading2", text: "计算步骤" },
        { id: "practice-2", type: "numbered", text: "固定另一个变量，把它当作常数。" },
        { id: "practice-3", type: "numbered", text: "使用一元函数求导规则，再检查上下标与次数。" },
        { id: "practice-4", type: "math", text: "f(x,y)=x^2y+3y^3" },
      ],
    },
    {
      id: "demo-note-review", courseId: course.id, folderId: null, title: "期中复习提纲", favorite: false, tags: ["复习"], version: 1, createdAt: now, updatedAt: now,
      blocks: [
        { id: "review-1", type: "heading2", text: "多元微分学" },
        { id: "review-2", type: "bullet", text: "偏导数的定义与几何意义" },
        { id: "review-3", type: "bullet", text: "梯度、方向导数与等高线" },
        { id: "review-4", type: "bullet", text: "复合函数求导与隐函数求导" },
      ],
    },
  ];
  const tx = db.transaction(["courses", "folders", "assets", "anchors", "notes"], "readwrite");
  await tx.objectStore("courses").add(course);
  await Promise.all(folders.map((folder) => tx.objectStore("folders").add(folder)));
  await Promise.all(assets.map((asset) => tx.objectStore("assets").add(asset)));
  await Promise.all(anchors.map((anchor) => tx.objectStore("anchors").add(anchor)));
  await Promise.all(notes.map((note) => tx.objectStore("notes").add(note)));
  await tx.done;
}
