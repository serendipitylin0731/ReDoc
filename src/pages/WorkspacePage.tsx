import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ArrowLeft, BookOpen, ChevronDown, ChevronRight, ChevronsLeft, ChevronsRight, Crop, Download, File, FileImage, FileText, Folder, FolderInput, FolderOpen, FolderPlus, MoreHorizontal, PanelRightClose, PanelRightOpen, Pencil, Plus, Search, ScanText, Trash2, Upload, Video, X } from "lucide-react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import JSZip from "jszip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import AssetViewer from "@app/components/AssetViewer";
import { HeaderContent } from "@app/components/AppShell";
import ConvertPanel from "@app/components/ConvertPanel";
import NoteEditor from "@app/components/NoteEditor";
import PdfExportPanel from "@app/components/PdfExportPanel";
import UploadDialog from "@app/components/UploadDialog";
import ExportMenu from "@app/components/ExportMenu";
import { useWorkspace } from "@app/state/WorkspaceContext";
import type { Asset, Folder as FolderType, Note } from "@app/types";
import type { RegionBBox } from "@app/lib/reconstruct";

function AssetIcon({ asset, size = 16 }: { asset: Asset; size?: number }) {
  if (asset.kind === "image") return <FileImage size={size} />;
  if (asset.kind === "video") return <Video size={size} />;
  if (["pdf", "markdown", "text"].includes(asset.kind)) return <FileText size={size} />;
  return <File size={size} />;
}

function searchableText(asset: Asset) {
  return asset.textContent ?? "";
}

const KIND_LABELS: Record<string, string> = { pdf: "PDF", image: "图片", markdown: "Markdown", text: "文本", video: "视频", audio: "音频", csv: "CSV", office: "Office", unsupported: "其他" };

export default function WorkspacePage() {
  const { courseId = "" } = useParams();
  const { courses, assets, notes, folders, createNote, updateNote, renameAsset, moveAssetToFolder, deleteAsset, removeNote, createFolder, getPreference, setPreference } = useWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const course = courses.find((item) => item.id === courseId);
  const courseAssets = assets.filter((asset) => asset.courseId === courseId);
  const courseNotes = notes.filter((note) => note.courseId === courseId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const currentAsset = courseAssets.find((asset) => asset.id === searchParams.get("file")) ?? courseAssets[0];
  const currentNote = courseNotes.find((note) => note.id === searchParams.get("note")) ?? courseNotes[0];
  const [tab, setTab] = useState<"note" | "convert" | "pdf">("note");
  const [workbenchOpen, setWorkbenchOpen] = useState(true);
  const [regionMode, setRegionMode] = useState(false);
  const [region, setRegion] = useState<RegionBBox | null>(null);
  const [pdfSource, setPdfSource] = useState<{ id: string; name: string; markdown: string; courseId: string } | null>(null);
  const [fileQuery, setFileQuery] = useState("");
  const [formatFilter, setFormatFilter] = useState("");
  const [filesOpen, setFilesOpen] = useState(true);
  const [notesOpen, setNotesOpen] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [split, setSplit] = useState(58);
  const splitContainer = useRef<HTMLDivElement>(null);
  const creatingNote = useRef(false);
  const courseFolders = folders.filter((folder) => folder.courseId === courseId);
  const query = fileQuery.trim().toLowerCase();
  const matches = (asset: Asset) => (formatFilter ? asset.kind === formatFilter : true) && (query ? asset.name.toLowerCase().includes(query) || searchableText(asset).toLowerCase().includes(query) : true);

  useEffect(() => { void getPreference("workspace-split", 58).then((value) => setSplit(Math.max(38, Math.min(70, value)))); }, [getPreference]);
  useEffect(() => { setFileQuery(""); setFormatFilter(""); setRegion(null); setRegionMode(false); }, [courseId]);
  useEffect(() => {
    if (!course && courses.length) navigate("/courses", { replace: true });
  }, [course, courses.length, navigate]);
  useEffect(() => {
    if (courseNotes.length || creatingNote.current || !course) return;
    creatingNote.current = true;
    void createNote(courseId, "我的课程笔记").then((note) => setSearchParams({ file: currentAsset?.id ?? "", note: note.id }, { replace: true })).finally(() => { creatingNote.current = false; });
  }, [course, courseId, courseNotes.length, createNote, setSearchParams, currentAsset?.id]);

  const selectAsset = (id: string) => {
    const next = new URLSearchParams(searchParams); next.set("file", id);
    if (currentNote) next.set("note", currentNote.id);
    setSearchParams(next);
  };
  const selectNote = (id: string) => {
    const next = new URLSearchParams(searchParams); next.set("note", id);
    if (currentAsset) next.set("file", currentAsset.id);
    setSearchParams(next);
    setTab("note");
    setWorkbenchOpen(true);
    setPdfSource(null);
  };
  const newNote = async () => { const note = await createNote(courseId); selectNote(note.id); };
  const exportPdf = async (asset: Asset) => {
    const markdown = asset.textContent ?? await asset.blob.text();
    setPdfSource({ id: asset.id, name: asset.name, markdown, courseId });
    setTab("pdf");
    setWorkbenchOpen(true);
  };
  const toggleRegion = (value?: boolean) => {
    const next = value ?? !regionMode;
    setRegionMode(next);
    if (!next) setRegion(null);
  };
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
  const addFolder = async () => {
    const name = window.prompt("新建文件夹");
    if (name?.trim()) await createFolder(courseId, name.trim());
  };
  const downloadCourseZip = async () => {
    const zip = new JSZip();
    for (const asset of courseAssets) zip.file(asset.name, asset.blob);
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = `${course?.title ?? "课程"}.zip`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const availableKinds = [...new Set(courseAssets.map((asset) => asset.kind))];

  const fileRow = (asset: Asset, indent: number) => <div className={`file-list-item ${currentAsset?.id === asset.id ? "active" : ""}`} key={asset.id} style={{ paddingLeft: `${10 + indent * 14}px` }}>
    <button className="file-main-button" onClick={() => selectAsset(asset.id)}><span className={`file-type-icon type-${asset.kind}`}><AssetIcon asset={asset} /></span><span className="file-item-copy"><strong>{asset.name}</strong><small>{asset.kind.toUpperCase()} · {(asset.size / 1024).toFixed(0)} KB</small></span></button>
    <DropdownMenu><DropdownMenuTrigger asChild><button className="file-more icon-button" aria-label={`${asset.name} 操作`}><MoreHorizontal size={15} /></button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => selectAsset(asset.id)}><BookOpen size={14} />打开资料</DropdownMenuItem>{["pdf", "image", "markdown", "text"].includes(asset.kind) && <DropdownMenuItem onSelect={() => { selectAsset(asset.id); setTab("convert"); setWorkbenchOpen(true); }}><ScanText size={14} />转为文字文档</DropdownMenuItem>}<DropdownMenuItem onSelect={() => { const name = window.prompt("重命名资料", asset.name); if (name?.trim()) void renameAsset(asset, name); }}><Pencil size={14} />重命名</DropdownMenuItem><DropdownMenuItem onSelect={() => void moveAssetToFolder(asset, null)}><FolderInput size={14} />移动到根目录</DropdownMenuItem>{courseFolders.map((folder) => <DropdownMenuItem key={folder.id} onSelect={() => void moveAssetToFolder(asset, folder.id)}><Folder size={14} />移动到“{folder.name}”</DropdownMenuItem>)}<DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onSelect={() => { if (window.confirm(`确认移出“${asset.name}”？\n既有笔记与内容快照会保留。`)) void deleteAsset(asset); }}><Trash2 size={14} />移出课程</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
  </div>;

  const noteRow = (note: Note) => <div className={`file-list-item note-list-row ${currentNote?.id === note.id ? "active" : ""}`} key={note.id} style={{ paddingLeft: "10px" }}>
    <button className="file-main-button" onClick={() => selectNote(note.id)}><span className="file-type-icon type-note"><FileText size={16} /></span><span className="file-item-copy"><strong>{note.title || "未命名笔记"}</strong><small>NOTE · {note.blocks.length} 块</small></span></button>
    <DropdownMenu><DropdownMenuTrigger asChild><button className="file-more icon-button" aria-label={`${note.title} 操作`}><MoreHorizontal size={15} /></button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => { const name = window.prompt("重命名笔记", note.title); if (name?.trim()) updateNote({ ...note, title: name.trim() }); }}><Pencil size={14} />重命名</DropdownMenuItem><DropdownMenuItem variant="destructive" onSelect={() => { if (window.confirm(`确认删除“${note.title}”？`)) void removeNote(note); }}><Trash2 size={14} />删除笔记</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
  </div>;

  const folderNode = (folder: FolderType) => {
    const children = courseAssets.filter((asset) => asset.folderId === folder.id);
    const isOpen = expanded[folder.id] !== false;
    return <div className="tree-folder" key={folder.id}>
      <button className="tree-folder-head" onClick={() => setExpanded((value) => ({ ...value, [folder.id]: !isOpen }))}>{isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}<FolderOpen size={15} /><span>{folder.name}</span><small>{children.length}</small></button>
      {isOpen && <div className="tree-folder-children">{children.map((asset) => fileRow(asset, 1))}{!children.length && <div className="tree-empty">空文件夹</div>}</div>}
    </div>;
  };

  if (!course) return null;
  const rootFiles = courseAssets.filter((asset) => !asset.folderId);
  const filteredRoot = rootFiles.filter(matches);
  const filteredFolders = courseFolders.filter((folder) => courseAssets.some((asset) => asset.folderId === folder.id && matches(asset)));

  return <div className="workspace-page course-page">
    <HeaderContent><button className="header-course-back" onClick={() => navigate("/courses")}><ArrowLeft size={15} />课程</button><span className="header-course-title">{course.title}</span></HeaderContent>
    <header className="course-workspace-header">
      <div className="course-workspace-header-actions">
        <button className="toolbar-button" onClick={() => void downloadCourseZip()} title="下载整个课程为压缩包"><Download size={15} />打包下载</button>
      </div>
    </header>
    <div className="workspace-body">
      <aside className="file-sidebar">
        <div className="file-sidebar-filters">
          <label className="course-search"><Search size={15} /><input value={fileQuery} onChange={(event) => setFileQuery(event.target.value)} placeholder="搜索文件名或内容…" />{fileQuery && <button onClick={() => setFileQuery("")}><X size={13} /></button>}</label>
          <select className="format-filter" aria-label="按格式筛选" value={formatFilter} onChange={(event) => setFormatFilter(event.target.value)}><option value="">全部格式</option>{availableKinds.map((kind) => <option value={kind} key={kind}>{KIND_LABELS[kind] ?? kind.toUpperCase()}</option>)}</select>
        </div>
        <div className="file-section">
          <div className="file-section-head"><button onClick={() => setFilesOpen((value) => !value)}>{filesOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}<span>文件</span><small>{courseAssets.length}</small></button><button className="section-icon-button" onClick={() => void addFolder()} title="新建文件夹" aria-label="新建文件夹"><FolderPlus size={15} /></button><UploadDialog courseId={courseId} onUploaded={(uploaded) => { if (uploaded[0]) selectAsset(uploaded[0].id); }} trigger={<button className="section-icon-button" title="导入资料" aria-label="导入资料"><Upload size={15} /></button>} /></div>
          {filesOpen && <div className="vscode-tree">{filteredRoot.map((asset) => fileRow(asset, 0))}{filteredFolders.map(folderNode)}{!filteredRoot.length && !filteredFolders.length && <div className="file-list-empty"><Search size={20} /><span>没有匹配的文件</span></div>}</div>}
        </div>
        <div className="file-section notes-section">
          <div className="file-section-head"><button onClick={() => setNotesOpen((value) => !value)}>{notesOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}<span>笔记</span><small>{courseNotes.length}</small></button><button className="notes-new-button" onClick={() => void newNote()} title="新建笔记" aria-label="新建笔记"><Plus size={14} /></button></div>
          {notesOpen && <div className="vscode-tree">{courseNotes.map(noteRow)}{!courseNotes.length && <div className="tree-empty">还没有笔记</div>}</div>}
        </div>
      </aside>
      <div className="split-workspace" ref={splitContainer}>
        <section className="viewer-column" style={workbenchOpen ? { width: `${split}%` } : { flex: 1 }} aria-label="原始资料">{currentAsset ? <AssetViewer asset={currentAsset} noteId={currentNote?.id ?? ""} onNoteChange={(id) => selectNote(id)} onConvert={() => { setTab("convert"); setWorkbenchOpen(true); }} onExportPdf={() => void exportPdf(currentAsset)} regionMode={regionMode} onRegionModeChange={toggleRegion} onRegion={setRegion} /> : <div className="no-asset-overlay"><Upload size={30} /><h3>从第一份资料开始</h3><p>导入 PDF、图片或课程文本，即可在右侧工作台做笔记、转文字或编译 PDF。</p><UploadDialog courseId={courseId} trigger={<button className="primary-button"><Plus size={16} />导入课程资料</button>} /></div>}</section>
        {workbenchOpen && <div className="split-divider" onPointerDown={beginSplit} role="separator" aria-label="调整资料与工作台宽度" aria-valuenow={Math.round(split)} tabIndex={0}><span><ChevronsLeft size={12} /><ChevronsRight size={12} /></span></div>}
        {workbenchOpen ? <section className="note-column workbench-column" style={{ width: `${100 - split}%` }} aria-label="集成工作台">
          <div className="workbench-tabs">
            <button className={tab === "note" ? "active" : ""} onClick={() => { setTab("note"); toggleRegion(false); }}><FileText size={15} />笔记</button>
            <button className={tab === "convert" ? "active" : ""} onClick={() => setTab("convert")}><ScanText size={15} />转文字</button>
            <button className={tab === "pdf" ? "active" : ""} onClick={() => { setTab("pdf"); toggleRegion(false); }}><Download size={15} />编译 PDF</button>
            <div className="workbench-tab-actions">
              {(tab === "note" || tab === "convert") && <button className={`toolbar-button ${regionMode ? "selected" : ""}`} onClick={() => toggleRegion()}><Crop size={15} />{regionMode ? "退出框选" : "框选摘录"}</button>}
              {tab === "note" && currentNote && <ExportMenu note={currentNote} compact />}
              <button className="icon-button" onClick={() => setWorkbenchOpen(false)} title="关闭工作台" aria-label="关闭工作台"><PanelRightClose size={17} /></button>
            </div>
          </div>
          <div className="workbench-body">
            {tab === "note" ? (currentNote ? <NoteEditor note={currentNote} /> : <div className="empty-note"><FileText size={28} /><p>创建一篇 Note 开始整理</p><button className="primary-button" onClick={() => void newNote()}><Plus size={15} />新建 Note</button></div>) : tab === "convert" ? (currentAsset ? <ConvertPanel asset={currentAsset} courseId={courseId} region={region} regionMode={regionMode} onRegionModeChange={toggleRegion} /> : <div className="empty-note"><ScanText size={28} /><p>请先在左侧选择要转换的资料。</p></div>) : (pdfSource || currentNote) ? <PdfExportPanel note={pdfSource ? null : currentNote} file={pdfSource} /> : <div className="empty-note"><FileText size={28} /><p>暂时没有待编译文件</p></div>}
          </div>
        </section> : <button className="reopen-note-pane" onClick={() => setWorkbenchOpen(true)} title="打开工作台" aria-label="打开工作台"><PanelRightOpen size={22} /><span>工作台</span></button>}
      </div>
    </div>
  </div>;
}
