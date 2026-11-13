import { ArrowLeft, ArrowRight, BookOpen, Clock3, Download, File, FileImage, FileText, Folder, Link2, MoreHorizontal, Pencil, Plus, Trash2, Upload, Video } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import UploadDialog from "@app/components/UploadDialog";
import { downloadOriginal } from "@app/lib/export";
import { useWorkspace } from "@app/state/WorkspaceContext";
import type { Asset } from "@app/types";

function KindIcon({ asset }: { asset: Asset }) {
  if (asset.kind === "image") return <FileImage size={18} />;
  if (asset.kind === "video") return <Video size={18} />;
  if (["pdf", "markdown", "text"].includes(asset.kind)) return <FileText size={18} />;
  return <File size={18} />;
}

export default function CourseHomePage() {
  const { courseId = "" } = useParams();
  const { courses, assets, notes, folders, renameAsset, deleteAsset } = useWorkspace();
  const navigate = useNavigate();
  const course = courses.find((item) => item.id === courseId);
  if (!course) return null;
  const courseAssets = assets.filter((asset) => asset.courseId === courseId);
  const courseNotes = notes.filter((note) => note.courseId === courseId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const sourceCount = courseNotes.reduce((total, note) => total + note.blocks.filter((block) => block.sourceAnchorId).length, 0);
  return <div className="page-container course-home-page">
    <button className="back-link" onClick={() => navigate("/courses")}><ArrowLeft size={15} />全部课程</button>
    <section className="course-hero-panel" style={{ "--course-color": course.color } as React.CSSProperties}><div className="course-hero-pattern" /><div className="course-hero-copy"><span className="eyebrow">COURSE WORKSPACE · {new Date(course.createdAt).getFullYear()}</span><h1>{course.title}</h1><p>{course.description}</p><div className="course-hero-actions"><button className="primary-button" onClick={() => navigate(`/courses/${course.id}/workspace`)}><BookOpen size={17} />进入双栏工作台<ArrowRight size={16} /></button><UploadDialog courseId={course.id} trigger={<button className="light-button"><Upload size={16} />导入资料</button>} /></div></div><span className="course-hero-monogram">{course.title.slice(0, 1)}</span></section>
    <div className="course-summary-grid"><div><span>课程资料</span><strong>{courseAssets.length}<small>份原件</small></strong><p>不可变保存 · 支持受控预览</p></div><div><span>整理笔记</span><strong>{courseNotes.length}<small>篇 Note</small></strong><p>{courseNotes.reduce((total, note) => total + note.blocks.length, 0)} 个结构化内容块</p></div><div><span>来源连接</span><strong>{sourceCount}<small>条引用</small></strong><p>页码、区域与时间点可回跳</p></div></div>
    <div className="course-home-columns"><section className="course-files-section"><div className="section-heading"><div><span className="eyebrow">SOURCE LIBRARY</span><h2>课程资料</h2></div><UploadDialog courseId={course.id} trigger={<button className="toolbar-button"><Plus size={15} />添加资料</button>} /></div><div className="course-file-table"><div className="file-table-header"><span>资料名称</span><span>所在目录</span><span>大小</span><span>状态</span><span /></div>{courseAssets.map((asset) => <div className="file-table-row" key={asset.id}><button className="table-file-name" onClick={() => navigate(`/courses/${course.id}/workspace?file=${asset.id}${courseNotes[0] ? `&note=${courseNotes[0].id}` : ""}`)}><span className={`file-type-icon type-${asset.kind}`}><KindIcon asset={asset} /></span><span><strong>{asset.name}</strong><small>{asset.kind.toUpperCase()} · 原件 v{asset.version}</small></span></button><span className="table-folder"><Folder size={13} />{folders.find((folder) => folder.id === asset.folderId)?.name ?? "根目录"}</span><span>{asset.size > 1024 * 1024 ? `${(asset.size / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(asset.size / 1024)} KB`}</span><span className="ready-status"><i />可预览</span><DropdownMenu><DropdownMenuTrigger asChild><button className="icon-button"><MoreHorizontal size={17} /></button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => navigate(`/courses/${course.id}/workspace?file=${asset.id}`)}><BookOpen size={14} />打开</DropdownMenuItem><DropdownMenuItem onSelect={() => downloadOriginal(asset)}><Download size={14} />下载原件</DropdownMenuItem><DropdownMenuItem onSelect={() => { const name = window.prompt("重命名资料", asset.name); if (name?.trim()) void renameAsset(asset, name); }}><Pencil size={14} />重命名</DropdownMenuItem><DropdownMenuItem variant="destructive" onSelect={() => { if (window.confirm(`确认移出“${asset.name}”？`)) void deleteAsset(asset); }}><Trash2 size={14} />移出课程</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>)}{!courseAssets.length && <div className="table-empty"><Upload size={25} /><p>还没有资料，导入第一份课程文件吧。</p></div>}</div></section>
      <aside className="recent-notes-panel"><div className="section-heading"><div><span className="eyebrow">RECENT NOTES</span><h2>最近笔记</h2></div><button className="icon-button" onClick={() => navigate(`/courses/${course.id}/notes`)}><ArrowRight size={17} /></button></div><div className="recent-note-list">{courseNotes.slice(0, 4).map((note, index) => <button key={note.id} onClick={() => navigate(`/courses/${course.id}/workspace?note=${note.id}${courseAssets[0] ? `&file=${courseAssets[0].id}` : ""}`)}><span className="recent-note-number">{String(index + 1).padStart(2, "0")}</span><span><strong>{note.title}</strong><small><Clock3 size={12} />{new Date(note.updatedAt).toLocaleDateString("zh-CN")} · {note.blocks.length} 块</small><span className="recent-note-tags">{note.tags.slice(0, 2).map((tag) => <i key={tag}>#{tag}</i>)}</span></span><ArrowRight size={15} /></button>)}</div><button className="all-notes-button" onClick={() => navigate(`/courses/${course.id}/notes`)}>查看全部 {courseNotes.length} 篇笔记<ArrowRight size={14} /></button><div className="source-tip"><Link2 size={18} /><strong>笔记不只是一段文字</strong><p>每条资料摘录都带着来源链接。点击 Note 中的绿色标记，即可回到原页、原区域或视频时间点。</p></div></aside>
    </div>
  </div>;
}
