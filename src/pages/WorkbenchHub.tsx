import { useState } from "react";
import { ArrowRight, BookOpen, ChevronRight, File, FileImage, FileText, Folder, FolderOpen, Plus, ScanText, Upload, Video } from "lucide-react";
import { useNavigate } from "react-router-dom";
import UploadDialog from "@app/components/UploadDialog";
import { useWorkspace } from "@app/state/WorkspaceContext";
import type { Asset } from "@app/types";

function AssetIcon({ asset }: { asset: Asset }) {
  if (asset.kind === "image") return <FileImage size={18} />;
  if (asset.kind === "video") return <Video size={18} />;
  if (["pdf", "markdown", "text"].includes(asset.kind)) return <FileText size={18} />;
  return <File size={18} />;
}

export default function WorkbenchHub() {
  const { courses, folders, assets } = useWorkspace();
  const [courseId, setCourseId] = useState("");
  const [folderFilter, setFolderFilter] = useState("all");
  const navigate = useNavigate();
  const course = courses.find((item) => item.id === courseId);
  const courseFolders = folders.filter((folder) => folder.courseId === courseId);
  const courseAssets = assets.filter((asset) => asset.courseId === courseId && asset.status !== "deleted" && (folderFilter === "all" || (folderFilter === "root" ? !asset.folderId : asset.folderId === folderFilter)));

  if (!courses.length) return <div className="page-container workbench-hub"><div className="page-heading-row simple-page-heading"><div><h1>工作台</h1><p>先创建一门课程，再把资料放进去整理或转文字。</p></div><button className="primary-button large-button" onClick={() => navigate("/courses")}><Plus size={18} />创建课程</button></div><div className="large-empty-state"><FolderOpen size={34} /><h3>还没有课程</h3><p>工作台的所有功能都从课程开始：创建课程后即可导入、移动文件并整理笔记。</p></div></div>;

  return <div className="page-container workbench-hub">
    <div className="page-heading-row simple-page-heading"><div><h1>工作台</h1><p>选择一门课程与文件，然后整理笔记或转为文字文档。</p></div><button className="primary-button large-button" onClick={() => navigate("/courses")}><Plus size={18} />创建课程</button></div>
    {!course && <div className="workbench-course-picker">{courses.map((item) => <button key={item.id} onClick={() => setCourseId(item.id)}><BookOpen size={22} /><span><strong>{item.title}</strong><small>{item.description || "课程资料"}</small></span><ChevronRight size={18} /></button>)}</div>}
    {course && <>
      <div className="workbench-course-bar"><button className="back-link" onClick={() => setCourseId("")}><BookOpen size={15} />更换课程</button><div className="workbench-course-title"><BookOpen size={18} /><strong>{course.title}</strong><button className="toolbar-button" onClick={() => navigate(`/courses/${course.id}`)}>管理文件</button></div><div className="workbench-course-actions"><label><Folder size={15} /><select aria-label="筛选文件夹" value={folderFilter} onChange={(event) => setFolderFilter(event.target.value)}><option value="all">全部文件</option><option value="root">根目录</option>{courseFolders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label><UploadDialog courseId={course.id} trigger={<button className="toolbar-button"><Upload size={15} />导入资料</button>} /></div></div>
      <div className="workbench-file-list">{courseAssets.map((asset) => <div className="workbench-file-row" key={asset.id}><span className={`file-type-icon type-${asset.kind}`}><AssetIcon asset={asset} /></span><span className="workbench-file-copy"><strong>{asset.name}</strong><small>{asset.kind.toUpperCase()} · {asset.size > 1024 * 1024 ? `${(asset.size / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(asset.size / 1024)} KB`} · {folders.find((folder) => folder.id === asset.folderId)?.name ?? "根目录"}</small></span><div className="workbench-file-actions"><button className="primary-button" onClick={() => navigate(`/courses/${course.id}/workspace?file=${asset.id}`)}><BookOpen size={15} />整理笔记</button>{["pdf", "image", "markdown", "text"].includes(asset.kind) && <button className="toolbar-button" onClick={() => navigate(`/courses/${course.id}/convert?file=${asset.id}`)}><ScanText size={15} />转文字文档</button>}</div></div>)}{!courseAssets.length && <div className="large-empty-state"><Upload size={28} /><h3>这个课程还没有资料</h3><p>点击“导入资料”添加 PDF、图片或文本文件。</p></div>}</div>
    </>}
    {course && courseAssets.length > 0 && <p className="workbench-hint"><ArrowRight size={13} />选择文件后进入工作页；也可随时在右上角“管理文件”里整理目录。</p>}
  </div>;
}
