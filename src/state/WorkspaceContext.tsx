import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { deleteRecord, detectAssetKind, getAll, getDb, getRecord, putRecord, saveNote, seedDemo, sha256, sourceLabel } from "@app/lib/db";
import { reconstructAsset } from "@app/lib/reconstruct";
import type { Asset, Course, ExcerptInput, Folder, Job, Note, NoteBlock, ReconstructionDocument, SourceAnchor } from "@app/types";

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
  deleteAsset: (asset: Asset) => Promise<void>;
  createNote: (courseId: string, title?: string) => Promise<Note>;
  updateNote: (note: Note, immediate?: boolean) => void;
  removeNote: (note: Note) => Promise<void>;
  addExcerpt: (input: ExcerptInput) => Promise<string>;
  resolveAnchor: (anchorId: string) => Promise<{ anchor: SourceAnchor; asset?: Asset } | undefined>;
  startReconstruction: (asset: Asset, retryJob?: Job) => Promise<Job>;
  saveDocument: (document: ReconstructionDocument) => Promise<void>;
  setPreference: <T>(key: string, value: T) => Promise<void>;
  getPreference: <T>(key: string, fallback: T) => Promise<T>;
  refresh: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);
const MAX_FILE_SIZE = 100 * 1024 * 1024;

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
  const notesRef = useRef<Note[]>([]);
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
    setNotes(noteRows);
    setAnchors(anchorRows);
    setJobs(jobRows);
    setDocuments(documentRows);
  }, []);

  useEffect(() => {
    let active = true;
    async function initialize() {
      try {
        await seedDemo();
        const db = await getDb();
        const running = await db.getAll("jobs");
        await Promise.all(running.filter((job) => job.status === "running" || job.status === "queued").map((job) => db.put("jobs", {
          ...job, status: "failed" as const, errorMessage: "页面刷新中断了本地任务，请安全重试。", updatedAt: new Date().toISOString(),
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
    const course: Course = { id: crypto.randomUUID(), title: title.trim(), description: description.trim(), color: ["#d7e65f", "#f1b58c", "#a9d8d0", "#c5b9e8"][courses.length % 4], archived: false, createdAt: now, updatedAt: now };
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

  const deleteAsset = useCallback(async (asset: Asset) => {
    await putRecord("assets", { ...asset, status: "deleted" });
    setAssets((current) => current.filter((item) => item.id !== asset.id));
    toast.success("资料已移出课程，既有笔记与内容快照仍保留");
  }, []);

  const createNote = useCallback(async (courseId: string, title = "未命名笔记") => {
    const now = new Date().toISOString();
    const note: Note = { id: crypto.randomUUID(), courseId, folderId: null, title, favorite: false, tags: [], version: 0, createdAt: now, updatedAt: now, blocks: [{ id: crypto.randomUUID(), type: "paragraph", text: "" }] };
    const saved = await saveNote(note);
    setNotes((current) => [saved, ...current]);
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
        setSaveStates((current) => ({ ...current, [note.id]: "saved" }));
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
    notesRef.current = notesRef.current.map((item) => item.id === note.id ? updated : item);
    setNotes(notesRef.current);
    const existing = timers.current.get(note.id);
    if (existing) clearTimeout(existing);
    if (immediate) enqueueSave(updated);
    else timers.current.set(note.id, setTimeout(() => enqueueSave(updated), 800));
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
    window.addEventListener("beforeunload", flush);
    return () => window.removeEventListener("beforeunload", flush);
  }, [enqueueSave]);

  const removeNote = useCallback(async (note: Note) => {
    await deleteRecord("notes", note.id);
    setNotes((current) => current.filter((item) => item.id !== note.id));
    toast.success("笔记已删除");
  }, []);

  const addExcerpt = useCallback(async (input: ExcerptInput) => {
    let target = notesRef.current.find((note) => note.id === input.noteId);
    if (input.createNew || !target) target = await createNote(input.asset.courseId, `${input.asset.name.replace(/\.[^.]+$/, "")} · 摘录`);
    const anchor: SourceAnchor = {
      id: crypto.randomUUID(), assetId: input.asset.id, assetVersion: input.asset.version, kind: input.kind,
      page: input.page, bbox: input.bbox, textQuote: input.text, textRange: input.textRange, startMs: input.startMs, endMs: input.endMs,
      imageDataUrl: input.imageDataUrl, createdAt: new Date().toISOString(),
    };
    await putRecord("anchors", anchor);
    setAnchors((current) => [...current, anchor]);
    const label = sourceLabel(anchor, input.asset.name);
    const block: NoteBlock = {
      id: crypto.randomUUID(), type: "excerpt", text: input.text ?? "", src: input.imageDataUrl, sourceAnchorId: anchor.id,
      sourceSnapshot: { assetName: input.asset.name, label, text: input.text, imageDataUrl: input.imageDataUrl },
    };
    updateNote({ ...target, blocks: [...target.blocks, block] }, true);
    toast.success(input.createNew ? "已创建笔记并加入摘录" : "已加入 Note，来源已保存");
    return target.id;
  }, [createNote, updateNote]);

  const resolveAnchor = useCallback(async (anchorId: string) => {
    const anchor = await getRecord("anchors", anchorId);
    if (!anchor) return undefined;
    const asset = await getRecord("assets", anchor.assetId);
    return { anchor, asset: asset?.status === "deleted" ? undefined : asset };
  }, []);

  const startReconstruction = useCallback(async (asset: Asset, retryJob?: Job) => {
    const now = new Date().toISOString();
    const job: Job = retryJob ? { ...retryJob, status: "queued", progress: 0, errorMessage: undefined, retryCount: retryJob.retryCount + 1, updatedAt: now } : {
      id: crypto.randomUUID(), assetId: asset.id, courseId: asset.courseId, assetName: asset.name, jobType: "ocr", status: "queued", progress: 0, retryCount: 0, createdAt: now, updatedAt: now,
    };
    await putRecord("jobs", job);
    setJobs((current) => retryJob ? current.map((item) => item.id === job.id ? job : item) : [job, ...current]);
    const document: ReconstructionDocument = { id: `document-${asset.id}`, assetId: asset.id, courseId: asset.courseId, extractionVersion: 1, status: "processing", blocks: [], updatedAt: now };
    await putRecord("documents", document);
    setDocuments((current) => [document, ...current.filter((item) => item.assetId !== asset.id)]);
    const updateJob = async (patch: Partial<Job>) => {
      Object.assign(job, patch, { updatedAt: new Date().toISOString() });
      await putRecord("jobs", job);
      setJobs((current) => current.map((item) => item.id === job.id ? { ...job } : item));
    };
    void (async () => {
      try {
        await updateJob({ status: "running", progress: 2 });
        const result = await reconstructAsset(asset, (progress) => { void updateJob({ progress }); });
        await Promise.all(result.anchors.map((anchor) => putRecord("anchors", anchor)));
        const ready = { ...document, status: "ready" as const, blocks: result.blocks, updatedAt: new Date().toISOString() };
        await putRecord("documents", ready);
        setDocuments((current) => current.map((item) => item.id === ready.id ? ready : item));
        setAnchors((current) => [...current, ...result.anchors]);
        await updateJob({ status: "succeeded", progress: 100 });
        toast.success("结构化重建完成，可以逐段校对");
      } catch (error) {
        await updateJob({ status: "failed", errorMessage: error instanceof Error ? error.message : "识别失败，请重试" });
        await putRecord("documents", { ...document, status: "failed" });
        toast.error("重建未完成", { description: error instanceof Error ? error.message : "请稍后重试" });
      }
    })();
    return job;
  }, []);

  const saveDocument = useCallback(async (document: ReconstructionDocument) => {
    const updated = { ...document, updatedAt: new Date().toISOString() };
    await putRecord("documents", updated);
    setDocuments((current) => current.map((item) => item.id === document.id ? updated : item));
  }, []);

  const setPreference = useCallback(async <T,>(key: string, value: T) => {
    await putRecord("preferences", value, key);
  }, []);

  const getPreference = useCallback(async <T,>(key: string, fallback: T): Promise<T> => {
    const value = await getRecord("preferences", key);
    return value === undefined ? fallback : value as T;
  }, []);

  const value: WorkspaceContextValue = {
    loading, courses, folders, assets, notes, anchors, jobs, documents, saveStates,
    createCourse, updateCourse, createFolder, uploadFiles, renameAsset, deleteAsset, createNote, updateNote, removeNote,
    addExcerpt, resolveAnchor, startReconstruction, saveDocument, setPreference, getPreference, refresh,
  };
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return context;
}
