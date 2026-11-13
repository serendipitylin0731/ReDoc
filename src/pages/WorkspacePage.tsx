import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { BookOpen, Check, ChevronDown, ChevronRight, ChevronsLeft, ChevronsRight, File, FileImage, FilePlus2, FileText, Folder, FolderOpen, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Pencil, Plus, Search, Trash2, Upload, Video, X } from "lucide-react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import AssetViewer from "@app/components/AssetViewer";
import NoteEditor from "@app/components/NoteEditor";
import UploadDialog from "@app/components/UploadDialog";
import ExportMenu from "@app/components/ExportMenu";
import { useWorkspace } from "@app/state/WorkspaceContext";
import type { Asset } from "@app/types";

function AssetIcon({ asset, size = 17 }: { asset: Asset; size?: number }) {
  if (asset.kind === "image") return <FileImage size={size} />;
  if (asset.kind === "video") return <Video size={size} />;
  if (["pdf", "markdown", "text"].includes(asset.kind)) return <FileText size={size} />;
  return <File size={size} />;
}

export default function WorkspacePage() {
  const { courseId = "" } = useParams();
  const { courses, assets, notes, folders, createNote, renameAsset, deleteAsset, createFolder, resolveAnchor, getPreference, setPreference } = useWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const course = courses.find((item) => item.id === courseId);
  const courseAssets = assets.filter((asset) => asset.courseId === courseId);
  const courseNotes = notes.filter((note) => note.courseId === courseId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const currentAsset = courseAssets.find((asset) => asset.id === searchParams.get("file")) ?? courseAssets[0];
  const currentNote = courseNotes.find((note) => note.id === searchParams.get("note")) ?? courseNotes.find((note) => note.id === "demo-note-gradient") ?? courseNotes[0];
  const [fileSearch, setFileSearch] = useState("");
  const [folderFilter, setFolderFilter] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [split, setSplit] = useState(58);
  const [mobilePane, setMobilePane] = useState<"source" | "note">("source");
  const [focusAnchor, setFocusAnchor] = useState<Awaited<ReturnType<typeof resolveAnchor>>>(undefined);
  const splitContainer = useRef<HTMLDivElement>(null);
  const creatingNote = useRef(false);
  const anchorRequest = useRef(0);
  const courseFolders = folders.filter((folder) => folder.courseId === courseId);
  const visibleAssets = courseAssets.filter((asset) => (!folderFilter || asset.folderId === folderFilter) && asset.name.toLowerCase().includes(fileSearch.toLowerCase()));

  useEffect(() => { void getPreference("workspace-split", 58).then((value) => setSplit(Math.max(38, Math.min(70, value)))); }, [getPreference]);
  useEffect(() => { setFocusAnchor(undefined); setFolderFilter(null); }, [courseId]);
  useEffect(() => {
    if (!course && courses.length) navigate("/courses", { replace: true });
  }, [course, courses.length, navigate]);
  useEffect(() => {
    if (courseNotes.length || creatingNote.current || !course) return;
    creatingNote.current = true;
    void createNote(courseId, "我的课程笔记").then((note) => setSearchParams({ file: currentAsset?.id ?? "", note: note.id }, { replace: true })).finally(() => { creatingNote.current = false; });
  }, [course, courseId, courseNotes.length, createNote, setSearchParams, currentAsset?.id]);

  const selectAsset = (id: string) => {
    anchorRequest.current += 1;
    const next = new URLSearchParams(searchParams); next.set("file", id); next.delete("anchor");
    if (currentNote) next.set("note", currentNote.id);
    setSearchParams(next);
    setFocusAnchor(undefined);
    setMobilePane("source");
  };
  const selectNote = (id: string) => {
    const next = new URLSearchParams(searchParams); next.set("note", id);
    if (currentAsset) next.set("file", currentAsset.id);
    setSearchParams(next);
    setMobilePane("note");
  };
  const newNote = async () => { const note = await createNote(courseId); selectNote(note.id); };
  const resolveSource = async (anchorId: string) => {
    const requestId = ++anchorRequest.current;
    const resolved = await resolveAnchor(anchorId);
    if (requestId !== anchorRequest.current) return;
    if (!resolved?.asset) { toast.error("来源不可定位", { description: "原始资料已移除，但笔记与内容快照仍完整保留。" }); return; }
    const next = new URLSearchParams(searchParams); next.set("file", resolved.asset.id); next.set("anchor", anchorId);
    if (currentNote) next.set("note", currentNote.id);
    setSearchParams(next);
    setFocusAnchor(resolved);
    setMobilePane("source");
  };
  const anchorId = searchParams.get("anchor");
  useEffect(() => {
    if (anchorId) void resolveSource(anchorId);
    else setFocusAnchor(undefined);
  }, [anchorId]);

  const beginSplit = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const move = (pointer: PointerEvent) => {
      const box = splitContainer.current?.getBoundingClientRect();
      if (!box) return;
      setSplit(Math.max(38, Math.min(70, ((pointer.clientX - box.left) / box.width) * 100)));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setSplit((value) => { void setPreference("workspace-split", value); return value; });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  if (!course) return null;
  return <div className="workspace-page">
    <header className="workspace-header">
      <div className="workspace-breadcrumb"><button onClick={() => navigate(`/courses/${course.id}`)} className="course-breadcrumb-icon" style={{ background: course.color }}>{course.title.slice(0, 1)}</button><div><span><button onClick={() => navigate("/courses")}>我的课程</button><ChevronRight size={11} />{course.title}</span><strong>资料与笔记工作台</strong></div></div>
      <div className="workspace-selectors"><label className="workspace-select"><BookOpen size={15} /><select aria-label="切换资料" value={currentAsset?.id ?? ""} onChange={(event) => selectAsset(event.target.value)}>{courseAssets.map((asset) => <option value={asset.id} key={asset.id}>{asset.name}</option>)}</select><ChevronDown size={13} /></label><span className="selector-link">→</span><label className="workspace-select note-select"><FileText size={15} /><select aria-label="切换笔记" value={currentNote?.id ?? ""} onChange={(event) => selectNote(event.target.value)}>{courseNotes.map((note) => <option value={note.id} key={note.id}>{note.title}</option>)}</select><ChevronDown size={13} /></label></div>
      <div className="workspace-header-actions"><button className="toolbar-button new-note-button" onClick={() => void newNote()}><FilePlus2 size={15} />新建 Note</button>{currentNote && <ExportMenu note={currentNote} compact />}</div>
    </header>
    <div className="mobile-workspace-tabs"><button className={mobilePane === "source" ? "active" : ""} onClick={() => setMobilePane("source")}><BookOpen size={15} />原始资料</button><button className={mobilePane === "note" ? "active" : ""} onClick={() => setMobilePane("note")}><FileText size={15} />我的 Note{currentNote && <span>{currentNote.blocks.length}</span>}</button></div>
    <div className="workspace-body">
      {sidebarOpen ? <aside className="file-sidebar">
        <div className="file-sidebar-heading"><div><span className="eyebrow">COURSE LIBRARY</span><h2>课程资料 <span>{courseAssets.length}</span></h2></div><button className="icon-button" onClick={() => setSidebarOpen(false)} title="收起资料目录"><PanelLeftClose size={17} /></button></div>
        <label className="file-search"><Search size={15} /><input value={fileSearch} onChange={(event) => setFileSearch(event.target.value)} placeholder="搜索资料…" />{fileSearch && <button onClick={() => setFileSearch("")}><X size={13} /></button>}</label>
        <div className="file-tree-heading"><button onClick={() => setFolderFilter(null)} className={!folderFilter ? "active" : ""}><FolderOpen size={15} />全部资料<span>{courseAssets.length}</span></button><DropdownMenu><DropdownMenuTrigger asChild><button className="icon-button" aria-label="新建目录"><Plus size={15} /></button></DropdownMenuTrigger><DropdownMenuContent><DropdownMenuItem onSelect={() => { const name = window.prompt("目录名称", "04 新章节"); if (name?.trim()) void createFolder(courseId, name); }}><Folder size={14} />新建目录</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>
        <div className="folder-list">{courseFolders.map((folder) => <button key={folder.id} className={folderFilter === folder.id ? "active" : ""} onClick={() => setFolderFilter(folderFilter === folder.id ? null : folder.id)}><ChevronRight size={12} className={folderFilter === folder.id ? "folder-open" : ""} /><Folder size={15} /><span>{folder.name}</span><small>{courseAssets.filter((asset) => asset.folderId === folder.id).length}</small></button>)}</div>
        <div className="file-list-label"><span>{folderFilter ? "目录内资料" : "最近导入"}</span><span>{visibleAssets.length} 项</span></div>
        <div className="file-list">{visibleAssets.map((asset) => <div className={`file-list-item ${currentAsset?.id === asset.id ? "active" : ""}`} key={asset.id}><button className="file-main-button" onClick={() => selectAsset(asset.id)}><span className={`file-type-icon type-${asset.kind}`}><AssetIcon asset={asset} /></span><span className="file-item-copy"><strong>{asset.name}</strong><small><span>{asset.kind.toUpperCase()}</span> · {(asset.size / 1024).toFixed(0)} KB</small></span></button><DropdownMenu><DropdownMenuTrigger asChild><button className="file-more icon-button" aria-label={`${asset.name} 操作`}><MoreHorizontal size={15} /></button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => selectAsset(asset.id)}><BookOpen size={14} />打开资料</DropdownMenuItem><DropdownMenuItem onSelect={() => { const name = window.prompt("重命名资料", asset.name); if (name?.trim()) void renameAsset(asset, name); }}><Pencil size={14} />重命名</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onSelect={() => { if (window.confirm(`确认移出“${asset.name}”？\n既有笔记与来源快照会保留。`)) void deleteAsset(asset); }}><Trash2 size={14} />移出课程</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>)}{!visibleAssets.length && <div className="file-list-empty"><Search size={22} /><span>没有匹配的资料</span></div>}</div>
        <UploadDialog courseId={courseId} onUploaded={(uploaded) => { if (uploaded[0]) selectAsset(uploaded[0].id); }} trigger={<button className="sidebar-upload-button"><Upload size={16} />导入新资料<span>⌘ U</span></button>} />
        <div className="file-sidebar-foot"><span className="status-dot" />原件保护已开启</div>
      </aside> : <button className="reopen-file-sidebar" onClick={() => setSidebarOpen(true)} title="展开资料目录"><PanelLeftOpen size={18} /><span>资料目录</span><ChevronsRight size={14} /></button>}
      <div className="split-workspace" ref={splitContainer}>
        <section className={`viewer-column ${mobilePane === "source" ? "mobile-active" : ""}`} style={{ width: `${split}%` }} aria-label="原始资料">{currentAsset ? <AssetViewer asset={currentAsset} noteId={currentNote?.id ?? ""} onNoteChange={selectNote} focusAnchor={focusAnchor?.asset?.id === currentAsset?.id ? focusAnchor.anchor : null} /> : <div className="no-asset-overlay"><Upload size={30} /><h3>从第一份资料开始</h3><p>导入 PDF、图片或课程文本，即可在旁边做可追溯笔记。</p><UploadDialog courseId={courseId} trigger={<button className="primary-button"><Plus size={16} />导入课程资料</button>} /></div>}</section>
        <div className="split-divider" onPointerDown={beginSplit} role="separator" aria-label="调整资料与笔记宽度" aria-valuenow={Math.round(split)} tabIndex={0}><span><ChevronsLeft size={12} /><ChevronsRight size={12} /></span></div>
        <section className={`note-column ${mobilePane === "note" ? "mobile-active" : ""}`} style={{ width: `${100 - split}%` }} aria-label="课程笔记">{currentNote ? <NoteEditor note={currentNote} onResolveSource={(anchorId) => void resolveSource(anchorId)} /> : <div className="empty-note"><FileText size={28} /><p>创建一篇 Note 开始整理</p><button className="primary-button" onClick={() => void newNote()}><Plus size={15} />新建 Note</button></div>}</section>
      </div>
    </div>
    <div className="workspace-shortcuts"><span><Check size={12} />本地资料库已就绪</span><span>选中文字或框选区域 → 加入 Note → 点击来源回跳</span><button onClick={() => setSidebarOpen((value) => !value)}>{sidebarOpen ? "收起目录" : "展开目录"}<kbd>⌘ B</kbd></button></div>
  </div>;
}
