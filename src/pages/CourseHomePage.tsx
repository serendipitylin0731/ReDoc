import { useState } from "react";
import { ArrowLeft, BookOpen, Clock3, Download, File, FileImage, FileText, Folder, FolderInput, FolderPlus, MoreHorizontal, Pencil, Plus, ScanText, Trash2, Upload, Video } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import UploadDialog from "@app/components/UploadDialog";
import { downloadOriginal } from "@app/lib/export";
import { useWorkspace } from "@app/state/WorkspaceContext";
import { CourseDialog } from "@app/pages/CoursesPage";
import type { Asset } from "@app/types";

function KindIcon({ asset }: { asset: Asset }) {
  if (asset.kind === "image") return <FileImage size={18} />;
  if (asset.kind === "video") return <Video size={18} />;
  if (["pdf", "markdown", "text"].includes(asset.kind)) return <FileText size={18} />;
  return <File size={18} />;
}

export default function CourseHomePage() {
  const { courseId = "" } = useParams();
  const { courses, assets, folders, renameAsset, deleteAsset, createFolder, moveAssetToFolder } = useWorkspace();
  const [folderFilter, setFolderFilter] = useState("all");
  const navigate = useNavigate();
  const course = courses.find((item) => item.id === courseId);
  if (!course) return null;
  const courseFolders = folders.filter((folder) => folder.courseId === courseId);
  const courseAssets = assets.filter((asset) => asset.courseId === courseId && (folderFilter === "all" || (folderFilter === "root" ? !asset.folderId : asset.folderId === folderFilter)));
  const addFolder = async () => {
    const name = window.prompt("新建文件夹");
    if (name?.trim()) await createFolder(courseId, name.trim());
  };
  return <div className="page-container course-home-page">
    <button className="back-link" onClick={() => navigate("/courses")}><ArrowLeft size={15} />全部课程</button>
    <section className="course-simple-header"><span className="course-simple-icon"><BookOpen size={30} strokeWidth={1.5} /></span><div className="course-simple-copy"><h1>{course.title}</h1>{course.description && <p>{course.description}</p>}<span><Clock3 size={13} />上次修改 {new Date(course.updatedAt).toLocaleString("zh-CN")}</span></div><div className="course-simple-actions"><CourseDialog course={course} trigger={<button className="toolbar-button"><Pencil size={15} />编辑课程</button>} /><button className="toolbar-button" onClick={() => navigate(`/courses/${course.id}/notes`)}><FileText size={15} />课程笔记</button><button className="toolbar-button" onClick={() => navigate(`/courses/${course.id}/convert`)}><ScanText size={15} />转文字文档</button><button className="primary-button" onClick={() => navigate(`/courses/${course.id}/workspace`)}><BookOpen size={16} />整理笔记</button></div></section>
    <section className="course-files-section"><div className="section-heading"><div><h2>课程资料</h2><p>使用文件夹整理本课程的所有文件。</p></div><UploadDialog courseId={course.id} trigger={<button className="primary-button"><Plus size={15} />导入资料</button>} /></div>
      <div className="course-folder-toolbar"><label><Folder size={15} /><select aria-label="筛选文件夹" value={folderFilter} onChange={(event) => setFolderFilter(event.target.value)}><option value="all">全部文件</option><option value="root">根目录</option>{courseFolders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label><button className="toolbar-button" onClick={() => void addFolder()}><FolderPlus size={15} />新建文件夹</button></div>
      <div className="course-file-table"><div className="file-table-header"><span>资料名称</span><span>所在目录</span><span>大小</span><span>状态</span><span /></div>{courseAssets.map((asset) => <div className="file-table-row" key={asset.id}><button className="table-file-name" onClick={() => navigate(`/courses/${course.id}/workspace?file=${asset.id}`)}><span className={`file-type-icon type-${asset.kind}`}><KindIcon asset={asset} /></span><span><strong>{asset.name}</strong><small>{asset.kind.toUpperCase()} · 原件 v{asset.version}</small></span></button><span className="table-folder"><Folder size={13} />{folders.find((folder) => folder.id === asset.folderId)?.name ?? "根目录"}</span><span>{asset.size > 1024 * 1024 ? `${(asset.size / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(asset.size / 1024)} KB`}</span><span className="ready-status"><i />可预览</span><DropdownMenu><DropdownMenuTrigger asChild><button className="icon-button" aria-label={`${asset.name}操作`}><MoreHorizontal size={17} /></button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => navigate(`/courses/${course.id}/workspace?file=${asset.id}`)}><BookOpen size={14} />打开并整理笔记</DropdownMenuItem>{["pdf", "image", "markdown", "text"].includes(asset.kind) && <DropdownMenuItem onSelect={() => navigate(`/courses/${course.id}/convert?file=${asset.id}`)}><ScanText size={14} />转为文字文档</DropdownMenuItem>}<DropdownMenuItem onSelect={() => downloadOriginal(asset)}><Download size={14} />下载原件</DropdownMenuItem><DropdownMenuItem onSelect={() => { const name = window.prompt("重命名资料", asset.name); if (name?.trim()) void renameAsset(asset, name); }}><Pencil size={14} />重命名</DropdownMenuItem><DropdownMenuItem onSelect={() => void moveAssetToFolder(asset, null)}><FolderInput size={14} />移动到根目录</DropdownMenuItem>{courseFolders.map((folder) => <DropdownMenuItem key={folder.id} onSelect={() => void moveAssetToFolder(asset, folder.id)}><Folder size={14} />移动到“{folder.name}”</DropdownMenuItem>)}<DropdownMenuItem variant="destructive" onSelect={() => { if (window.confirm(`确认移出“${asset.name}”？`)) void deleteAsset(asset); }}><Trash2 size={14} />移出课程</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>)}{!courseAssets.length && <div className="table-empty"><Upload size={25} /><p>{folderFilter === "all" ? "还没有资料，导入第一份课程文件吧。" : "这个文件夹中还没有资料。"}</p></div>}</div>
    </section>
  </div>;
}
