import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { deleteRecord, detectAssetKind, getAll, getDb, getRecord, putRecord, saveNote, sha256 } from "@app/lib/db";
import { reconstructAsset } from "@app/lib/reconstruct";
import type { Asset, AssetKind, Course, ExcerptInput, Folder, Job, Note, NoteBlock, ReconstructionDocument, SourceAnchor } from "@app/types";

interface WorkspaceContextValue {
  loading: boolean;
  courses: Course[];
  folders: Folder[];
  assets: Asset[];
  notes: Note[];
  anchors: SourceAnchor[];
  jobs: Job[];
  documents: ReconstructionDocument[];
  saveStates: Record<string, "saving" | "saved" | "conflict">;
  createCourse: (title: string, description: string) => Promise<Course>;
  updateCourse: (course: Course) => Promise<void>;
  createFolder: (courseId: string, name: string) => Promise<void>;
  uploadFiles: (courseId: string, files: File[], folderId?: string | null) => Promise<Asset[]>;
  renameAsset: (asset: Asset, name: string) => Promise<void>;
  moveAssetToFolder: (asset: Asset, folderId: string | null) => Promise<void>;
  deleteAsset: (asset: Asset) => Promise<void>;
  createNote: (courseId: string, title?: string) => Promise<Note>;
  updateNote: (note: Note, immediate?: boolean) => void;
  removeNote: (note: Note) => Promise<void>;
  addExcerpt: (input: ExcerptInput) => Promise<string>;
  noteCursor: { noteId: string; index: number } | null;
  setNoteCursor: (noteId: string, index: number) => void;
  insertOcrBlocks: (noteId: string, blocks: NoteBlock[]) => void;
  resolveAnchor: (anchorId: string) => Promise<{ anchor: SourceAnchor; asset?: Asset } | undefined>;
  startReconstruction: (asset: Asset, retryJob?: Job) => Promise<Job>;
  saveDocumentAsset: (courseId: string, name: string, blob: Blob, kind: AssetKind, textContent?: string, folderId?: string | null) => Promise<Asset>;
  setPreference: <T>(key: string, value: T) => Promise<void>;
  getPreference: <T>(key: string, fallback: T) => Promise<T>;
  refresh: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);
const MAX_FILE_SIZE = 100 * 1024 * 1024;

function noteDraftKey(tabId: string, noteId: string) {
  return `redoc-note-draft:${tabId}:${noteId}`;
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [courses, setCourses] = useState<Course[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [anchors, setAnchors] = useState<SourceAnchor[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [documents, setDocuments] = useState<ReconstructionDocument[]>([]);
  const [saveStates, setSaveStates] = useState<WorkspaceContextValue["saveStates"]>({});
  const [noteCursor, setNoteCursorState] = useState<WorkspaceContextValue["noteCursor"]>(null);
  const notesRef = useRef<Note[]>([]);
  const tabId = useRef("");
  if (!tabId.current) {
    try {
      tabId.current = sessionStorage.getItem("redoc-tab-id") ?? crypto.randomUUID();
      sessionStorage.setItem("redoc-tab-id", tabId.current);
    } catch {
      tabId.current = crypto.randomUUID();
    }
  }
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const saveChains = useRef(new Map<string, Promise<void>>());

  useEffect(() => { notesRef.current = notes; }, [notes]);

  const refresh = useCallback(async () => {
    const [courseRows, folderRows, assetRows, noteRows, anchorRows, jobRows, documentRows] = await Promise.all([
      getAll("courses"), getAll("folders"), getAll("assets"), getAll("notes"), getAll("anchors"), getAll("jobs"), getAll("documents"),
    ]);
    setCourses(courseRows);
    setFolders(folderRows);
    setAssets(assetRows.filter((asset) => asset.status !== "deleted"));
    const recoveredNotes = await Promise.all(noteRows.map(async (note) => {
      const key = noteDraftKey(tabId.current, note.id);
      let raw: string | null;
      try { raw = localStorage.getItem(key); }
      catch { return note; }
      if (!raw) return note;
      let draft: Note;
      try { draft = JSON.parse(raw) as Note; }
      catch { localStorage.removeItem(key); return note; }
      if (draft.id !== note.id || !Array.isArray(draft.blocks) || typeof draft.updatedAt !== "string") {
        localStorage.removeItem(key);
        return note;
      }
      if (draft.updatedAt <= note.updatedAt) { localStorage.removeItem(key); return note; }
      try {
        const saved = await saveNote({ ...draft, version: note.version });
        localStorage.removeItem(key);
        return saved;
      } catch {
        setSaveStates((current) => ({ ...current, [note.id]: "conflict" }));
        return { ...draft, version: note.version };
      }
    }));
    notesRef.current = recoveredNotes;
    setNotes(recoveredNotes);
    setAnchors(anchorRows);
    setJobs(jobRows);
    setDocuments(documentRows);
  }, []);

  useEffect(() => {
    let active = true;
    async function initialize() {
      try {
        const db = await getDb();
        const running = await db.getAll("jobs");
        const interrupted = running.filter((job) => job.status === "running" || job.status === "queued");
        await Promise.all(interrupted.map((job) => db.put("jobs", {
          ...job, status: "failed" as const, errorMessage: "页面刷新中断了本地任务，请安全重试。", updatedAt: new Date().toISOString(),
        })));
        const processingDocuments = await db.getAll("documents");
        await Promise.all(processingDocuments.filter((document) => document.status === "processing" && interrupted.some((job) => job.assetId === document.assetId)).map((document) => db.put("documents", {
          ...document, status: "failed" as const, updatedAt: new Date().toISOString(),
        })));
        if (active) await refresh();
      } catch {
        toast.error("资料库初始化失败，请检查浏览器存储权限。");
      } finally {
        if (active) setLoading(false);
      }
    }
    void initialize();
    return () => { active = false; };
  }, [refresh]);

  const createCourse = useCallback(async (title: string, description: string) => {
    const now = new Date().toISOString();
    const course: Course = { id: crypto.randomUUID(), title: title.trim(), description: description.trim(), color: ["#52715f", "#a96850", "#46767a", "#76658d"][courses.length % 4], archived: false, createdAt: now, updatedAt: now };
    await putRecord("courses", course);
    setCourses((current) => [...current, course]);
    return course;
  }, [courses.length]);

  const updateCourse = useCallback(async (course: Course) => {
    const updated = { ...course, updatedAt: new Date().toISOString() };
    await putRecord("courses", updated);
    setCourses((current) => current.map((item) => item.id === course.id ? updated : item));
  }, []);

  const createFolder = useCallback(async (courseId: string, name: string) => {
    const folder: Folder = { id: crypto.randomUUID(), courseId, parentId: null, name: name.trim(), sortOrder: folders.filter((item) => item.courseId === courseId).length + 1 };
    await putRecord("folders", folder);
    setFolders((current) => [...current, folder]);
  }, [folders]);

  const uploadFiles = useCallback(async (courseId: string, files: File[], folderId: string | null = null) => {
    const uploaded: Asset[] = [];
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`${file.name} 超过 100 MB 限制`);
        continue;
      }
      const kind = detectAssetKind(file, file.name);
      const hash = await sha256(file);
      const duplicate = assets.find((asset) => asset.courseId === courseId && asset.sha256 === hash);
      if (duplicate) toast.warning(`${file.name} 与 ${duplicate.name} 内容相同，仍作为新资料保留`);
      const textual = ["markdown", "text", "csv"].includes(kind) && file.size < 5 * 1024 * 1024;
      const asset: Asset = {
        id: crypto.randomUUID(), courseId, folderId, name: file.name, mime: file.type || "application/octet-stream", size: file.size,
        sha256: hash, kind, status: "ready", version: 1, createdAt: new Date().toISOString(), blob: file,
        textContent: textual ? await file.text() : undefined,
      };
      await putRecord("assets", asset);
      uploaded.push(asset);
      setAssets((current) => [...current, asset]);
    }
    if (uploaded.length) toast.success(`已导入 ${uploaded.length} 份资料，原件已保存`);
    return uploaded;
  }, [assets]);

  const renameAsset = useCallback(async (asset: Asset, name: string) => {
    const updated = { ...asset, name: name.trim() };
    await putRecord("assets", updated);
    setAssets((current) => current.map((item) => item.id === asset.id ? updated : item));
  }, []);

  const moveAssetToFolder = useCallback(async (asset: Asset, folderId: string | null) => {
    const updated = { ...asset, folderId };
    await putRecord("assets", updated);
    setAssets((current) => current.map((item) => item.id === asset.id ? updated : item));
  }, []);

  const deleteAsset = useCallback(async (asset: Asset) => {
    await putRecord("assets", { ...asset, status: "deleted" });
    setAssets((current) => current.filter((item) => item.id !== asset.id));
    toast.success("资料已移出课程，既有笔记与内容快照仍保留");
  }, []);

  const saveDocumentAsset = useCallback(async (courseId: string, name: string, blob: Blob, kind: AssetKind, textContent?: string, folderId: string | null = null) => {
    const asset: Asset = {
      id: crypto.randomUUID(), courseId, folderId, name, mime: blob.type || "application/octet-stream", size: blob.size,
      sha256: "", kind, status: "ready", version: 1, createdAt: new Date().toISOString(), blob, textContent,
    };
    await putRecord("assets", asset);
    setAssets((current) => [...current, asset]);
    toast.success("文档已保存到课程文件");
    return asset;
  }, []);

  const createNote = useCallback(async (courseId: string, title = "未命名笔记") => {
    const now = new Date().toISOString();
    const note: Note = { id: crypto.randomUUID(), courseId, folderId: null, title, favorite: false, tags: [], version: 0, createdAt: now, updatedAt: now, blocks: [{ id: crypto.randomUUID(), type: "paragraph", text: "" }] };
    const saved = await saveNote(note);
    notesRef.current = [saved, ...notesRef.current];
    setNotes(notesRef.current);
    return saved;
  }, []);

  const enqueueSave = useCallback((note: Note) => {
    setSaveStates((current) => ({ ...current, [note.id]: "saving" }));
    const previous = saveChains.current.get(note.id) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(async () => {
      const latest = notesRef.current.find((item) => item.id === note.id);
      if (!latest || latest.updatedAt !== note.updatedAt) return;
      try {
        const saved = await saveNote({ ...note, version: latest.version });
        notesRef.current = notesRef.current.map((item) => item.id === note.id ? (item.updatedAt === note.updatedAt ? saved : { ...item, version: saved.version }) : item);
        setNotes(notesRef.current);
        if (notesRef.current.find((item) => item.id === note.id)?.updatedAt === note.updatedAt) {
          try { localStorage.removeItem(noteDraftKey(tabId.current, note.id)); } catch {}
          setSaveStates((current) => ({ ...current, [note.id]: "saved" }));
        }
      } catch (error) {
        if (error instanceof Error && error.message === "version_conflict") {
          setSaveStates((current) => ({ ...current, [note.id]: "conflict" }));
          toast.error("检测到其他标签页的更新，当前草稿未覆盖它。", { description: "请复制当前内容后刷新页面。" });
        } else {
          setSaveStates((current) => ({ ...current, [note.id]: "conflict" }));
          toast.error("自动保存失败，请检查浏览器存储空间。");
        }
      }
    });
    saveChains.current.set(note.id, next);
  }, []);

  const updateNote = useCallback((note: Note, immediate = false) => {
    const updated = { ...note, updatedAt: new Date().toISOString() };
    try { localStorage.setItem(noteDraftKey(tabId.current, note.id), JSON.stringify(updated)); } catch {}
    notesRef.current = notesRef.current.map((item) => item.id === note.id ? updated : item);
    setNotes(notesRef.current);
    const existing = timers.current.get(note.id);
    if (existing) clearTimeout(existing);
    timers.current.delete(note.id);
    if (immediate) enqueueSave(updated);
    else timers.current.set(note.id, setTimeout(() => { timers.current.delete(note.id); enqueueSave(updated); }, 800));
  }, [enqueueSave]);

  useEffect(() => {
    const flush = () => {
      for (const [id, timer] of timers.current) {
        clearTimeout(timer);
        const note = notesRef.current.find((item) => item.id === id);
        if (note) enqueueSave(note);
      }
      timers.current.clear();
    };
    const hide = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", hide);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [enqueueSave]);

  const removeNote = useCallback(async (note: Note) => {
    const timer = timers.current.get(note.id);
    if (timer) clearTimeout(timer);
    timers.current.delete(note.id);
    try { localStorage.removeItem(noteDraftKey(tabId.current, note.id)); } catch {}
    await deleteRecord("notes", note.id);
    notesRef.current = notesRef.current.filter((item) => item.id !== note.id);
    setNotes(notesRef.current);
    toast.success("笔记已删除");
  }, []);

  const addExcerpt = useCallback(async (input: ExcerptInput) => {
    let target = notesRef.current.find((note) => note.id === input.noteId);
    if (input.createNew || !target) target = await createNote(input.asset.courseId, `${input.asset.name.replace(/\.[^.]+$/, "")} · 摘录`);
    const block: NoteBlock = input.imageDataUrl
      ? { id: crypto.randomUUID(), type: "image", text: input.text ?? "资料截图", src: input.imageDataUrl }
      : { id: crypto.randomUUID(), type: "paragraph", text: input.text ?? "" };
    updateNote({ ...target, blocks: [...target.blocks, block] }, true);
    toast.success(input.createNew ? "已创建笔记并加入内容" : "已加入 Note");
    return target.id;
  }, [createNote, updateNote]);

  const setNoteCursor = useCallback((noteId: string, index: number) => {
    setNoteCursorState((current) => current?.noteId === noteId && current.index === index ? current : { noteId, index });
  }, []);

  const insertOcrBlocks = useCallback((noteId: string, blocks: NoteBlock[]) => {
    const target = notesRef.current.find((note) => note.id === noteId);
    if (!target || !blocks.length) return;
    const index = noteCursor?.noteId === noteId ? noteCursor.index + 1 : target.blocks.length;
    const nextBlocks = [...target.blocks];
    nextBlocks.splice(index, 0, ...blocks);
    updateNote({ ...target, blocks: nextBlocks }, true);
  }, [noteCursor, updateNote]);

  const resolveAnchor = useCallback(async (anchorId: string) => {
    const anchor = await getRecord("anchors", anchorId);
    if (!anchor) return undefined;
    const asset = await getRecord("assets", anchor.assetId);
    return { anchor, asset: asset?.status === "deleted" ? undefined : asset };
  }, []);

  const startReconstruction = useCallback(async (asset: Asset, retryJob?: Job) => {
    const now = new Date().toISOString();
    const extractionVersion = Math.max(0, ...documents.filter((item) => item.assetId === asset.id).map((item) => item.extractionVersion)) + 1;
    const document: ReconstructionDocument = { id: `document-${asset.id}-${crypto.randomUUID()}`, assetId: asset.id, courseId: asset.courseId, extractionVersion, status: "processing", blocks: [], updatedAt: now };
    const job: Job = retryJob ? { ...retryJob, documentId: document.id, status: "queued", progress: 0, errorMessage: undefined, retryCount: retryJob.retryCount + 1, updatedAt: now } : {
      id: crypto.randomUUID(), assetId: asset.id, courseId: asset.courseId, assetName: asset.name, jobType: "ocr", documentId: document.id, status: "queued", progress: 0, retryCount: 0, createdAt: now, updatedAt: now,
    };
    await putRecord("jobs", job);
    setJobs((current) => retryJob ? current.map((item) => item.id === job.id ? job : item) : [job, ...current]);
    setDocuments((current) => [document, ...current]);
    const updateJob = async (patch: Partial<Job>) => {
      Object.assign(job, patch, { updatedAt: new Date().toISOString() });
      await putRecord("jobs", job);
      setJobs((current) => current.map((item) => item.id === job.id ? { ...job } : item));
    };
    void (async () => {
      try {
        await updateJob({ status: "running", progress: 2 });
        const result = await reconstructAsset(asset, (progress) => { void updateJob({ progress }); });
        const ready = { ...document, status: "ready" as const, blocks: result.blocks, updatedAt: new Date().toISOString() };
        setDocuments((current) => current.map((item) => item.id === ready.id ? ready : item));
        await updateJob({ status: "succeeded", progress: 100 });
        toast.success("文字文档已生成，请下载到本地");
      } catch (error) {
        await updateJob({ status: "failed", errorMessage: error instanceof Error ? error.message : "识别失败，请重试" });
        const failed = { ...document, status: "failed" as const, updatedAt: new Date().toISOString() };
        setDocuments((current) => current.map((item) => item.id === failed.id ? failed : item));
        toast.error("转换未完成", { description: error instanceof Error ? error.message : "请稍后重试" });
      }
    })();
    return job;
  }, [documents]);

  const setPreference = useCallback(async <T,>(key: string, value: T) => {
    await putRecord("preferences", value, key);
  }, []);

  const getPreference = useCallback(async <T,>(key: string, fallback: T): Promise<T> => {
    const value = await getRecord("preferences", key);
    return value === undefined ? fallback : value as T;
  }, []);

  const value: WorkspaceContextValue = {
    loading, courses, folders, assets, notes, anchors, jobs, documents, saveStates, noteCursor,
    createCourse, updateCourse, createFolder, uploadFiles, renameAsset, moveAssetToFolder, deleteAsset, createNote, updateNote, removeNote,
    addExcerpt, setNoteCursor, insertOcrBlocks, resolveAnchor, startReconstruction, saveDocumentAsset, setPreference, getPreference, refresh,
  };
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return context;
}
