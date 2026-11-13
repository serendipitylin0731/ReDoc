import { useState } from "react";
import { Archive, ArrowRight, BookOpen, Check, ChevronDown, FileText, FolderOpen, Link2, MoreHorizontal, Pencil, Plus, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useWorkspace } from "@app/state/WorkspaceContext";
import type { Course } from "@app/types";

export function CourseDialog({ course, trigger }: { course?: Course; trigger: React.ReactNode }) {
  const { createCourse, updateCourse } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(course?.title ?? "");
  const [description, setDescription] = useState(course?.description ?? "");
  const navigate = useNavigate();
  const submit = async () => {
    if (!title.trim()) return;
    if (course) await updateCourse({ ...course, title: title.trim(), description: description.trim() });
    else { const created = await createCourse(title, description); setOpen(false); navigate(`/courses/${created.id}`); return; }
    setOpen(false);
  };
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild>{trigger}</DialogTrigger><DialogContent><DialogHeader><DialogTitle>{course ? "编辑课程信息" : "创建一门新课程"}</DialogTitle><DialogDescription>课程是资料、笔记与来源引用的统一边界。</DialogDescription></DialogHeader><div className="form-stack"><label className="field-label"><span>课程名称</span><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：高等数学 · 秋季学期" /></label><label className="field-label"><span>课程说明</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="学期、章节或你的学习目标" rows={3} /></label></div><DialogFooter><button className="toolbar-button" onClick={() => setOpen(false)}>取消</button><button className="primary-button" disabled={!title.trim()} onClick={() => void submit()}>{course ? "保存修改" : "创建并进入课程"}<ArrowRight size={15} /></button></DialogFooter></DialogContent></Dialog>;
}

export default function CoursesPage() {
  const { courses, assets, notes, anchors, updateCourse } = useWorkspace();
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const navigate = useNavigate();
  const visible = courses.filter((course) => course.archived === showArchived && `${course.title}${course.description}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="page-container courses-page">
    <div className="page-heading-row"><div><span className="eyebrow">YOUR LEARNING LIBRARY</span><h1>每一门课，都有自己的知识脉络。</h1><p>把散落资料收进课程，让每一条笔记都能回到它原来的位置。</p></div><CourseDialog trigger={<button className="primary-button large-button"><Plus size={18} />创建课程</button>} /></div>
    <div className="library-stats"><div><span className="stat-icon"><FolderOpen size={19} /></span><span><strong>{courses.filter((course) => !course.archived).length}</strong><small>进行中的课程</small></span></div><div><span className="stat-icon"><BookOpen size={19} /></span><span><strong>{assets.length}</strong><small>受保护的原始资料</small></span></div><div><span className="stat-icon"><FileText size={19} /></span><span><strong>{notes.length}</strong><small>结构化笔记</small></span></div><div><span className="stat-icon"><Link2 size={19} /></span><span><strong>{anchors.length}</strong><small>可追溯来源锚点</small></span></div></div>
    <div className="content-toolbar"><label className="content-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索课程名称或说明…" /></label><button className="filter-button" onClick={() => setShowArchived((value) => !value)}><Archive size={15} />{showArchived ? "返回进行中课程" : "查看已归档"}<ChevronDown size={14} /></button></div>
    <div className="course-grid">{visible.map((course, index) => {
      const courseAssets = assets.filter((asset) => asset.courseId === course.id);
      const courseNotes = notes.filter((note) => note.courseId === course.id);
      const excerpts = courseNotes.reduce((total, note) => total + note.blocks.filter((block) => block.sourceAnchorId).length, 0);
      return <article className="course-card" key={course.id}>
        <button className="course-card-main" onClick={() => navigate(`/courses/${course.id}`)}>
          <div className="course-card-cover" style={{ "--course-color": course.color } as React.CSSProperties}><span className="course-index">{String(index + 1).padStart(2, "0")}</span><span className="course-cover-icon">{course.title.slice(0, 1)}</span><span className="course-card-pattern" /><div className="course-card-label"><span>{course.archived ? "ARCHIVED COURSE" : "ACTIVE COURSE"}</span><ArrowRight size={18} /></div></div>
          <div className="course-card-body"><span className="course-semester">{new Date(course.updatedAt).getFullYear()} · 学习工作空间</span><h2>{course.title}</h2><p>{course.description || "还没有课程说明，点击编辑补充学习目标。"}</p><div className="course-card-metrics"><span><BookOpen size={14} />{courseAssets.length} 份资料</span><span><FileText size={14} />{courseNotes.length} 篇 Note</span><span><Link2 size={14} />{excerpts} 条摘录</span></div></div>
        </button>
        <div className="course-card-footer"><span><i style={{ background: course.color }} />{course.archived ? "已归档，内容仍可访问" : `最近更新 ${new Date(course.updatedAt).toLocaleDateString("zh-CN")}`}</span><DropdownMenu><DropdownMenuTrigger asChild><button className="icon-button" aria-label="课程操作"><MoreHorizontal size={18} /></button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => navigate(`/courses/${course.id}/workspace`)}><BookOpen size={14} />进入工作台</DropdownMenuItem><CourseDialog course={course} trigger={<DropdownMenuItem onSelect={(event) => event.preventDefault()}><Pencil size={14} />编辑课程</DropdownMenuItem>} /><DropdownMenuItem onSelect={() => void updateCourse({ ...course, archived: !course.archived })}>{course.archived ? <Check size={14} /> : <Archive size={14} />}{course.archived ? "恢复课程" : "归档课程"}</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>
      </article>;
    })}</div>
    {!visible.length && <div className="large-empty-state"><FolderOpen size={32} /><h3>{showArchived ? "还没有已归档课程" : "没有找到匹配课程"}</h3><p>{showArchived ? "归档的课程会在这里安全保留。" : "尝试其他关键词，或创建一门新课程。"}</p></div>}
  </div>;
}
