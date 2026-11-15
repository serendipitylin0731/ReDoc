import { useState } from "react";
import { Archive, ArrowRight, BookOpen, Check, FolderOpen, MoreHorizontal, Pencil, Pin, Plus, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useWorkspace } from "@app/state/WorkspaceContext";
import type { Course } from "@app/types";

const COURSE_ICONS = ["📘", "📐", "🧪", "💻", "📖", "🧬", "📊", "🎨", "📝", "🗂️"];
const COURSE_COLORS = ["#2563eb", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#52715f", "#a96850", "#46767a", "#76658d"];

export function CourseDialog({ course, trigger }: { course?: Course; trigger: React.ReactNode }) {
  const { createCourse, updateCourse } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(course?.title ?? "");
  const [description, setDescription] = useState(course?.description ?? "");
  const [icon, setIcon] = useState(course?.icon ?? COURSE_ICONS[0]);
  const [color, setColor] = useState(course?.color ?? COURSE_COLORS[0]);
  const [pinned, setPinned] = useState(course?.pinned ?? false);
  const navigate = useNavigate();
  const submit = async () => {
    if (!title.trim()) return;
    if (course) {
      const pinnedAt = pinned ? (course.pinnedAt ?? new Date().toISOString()) : null;
      await updateCourse({ ...course, title: title.trim(), description: description.trim(), icon, color, pinned, pinnedAt });
    } else {
      const created = await createCourse(title, description, { icon, color, pinned });
      setOpen(false);
      navigate(`/courses/${created.id}`);
      return;
    }
    setOpen(false);
  };
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild>{trigger}</DialogTrigger><DialogContent><DialogHeader><DialogTitle>{course ? "编辑课程" : "新建课程"}</DialogTitle><DialogDescription>填写课程名称，也可以设置图标、颜色与置顶。</DialogDescription></DialogHeader><div className="form-stack"><label className="field-label"><span>课程名称</span><input autoFocus value={title} maxLength={60} onChange={(event) => setTitle(event.target.value)} placeholder="例如：高等数学" /></label><label className="field-label"><span>简短备注（可选）</span><textarea value={description} maxLength={80} onChange={(event) => setDescription(event.target.value)} placeholder="例如：秋季学期，重点复习第 3—6 章" rows={2} /><small className="field-counter">{description.length} / 80</small></label>
    <div className="course-meta-field"><span>图标</span><div className="course-icon-picker">{COURSE_ICONS.map((item) => <button key={item} type="button" className={icon === item ? "active" : ""} onClick={() => setIcon(item)}>{item}</button>)}</div></div>
    <div className="course-meta-field"><span>颜色</span><div className="course-color-picker">{COURSE_COLORS.map((item) => <button key={item} type="button" className={color === item ? "active" : ""} style={{ background: item }} onClick={() => setColor(item)} aria-label={`颜色 ${item}`} />)}</div></div>
    <label className="course-pin-toggle"><input type="checkbox" checked={pinned} onChange={(event) => setPinned(event.target.checked)} /><span>置顶课程</span></label></div><DialogFooter><button className="toolbar-button" onClick={() => setOpen(false)}>取消</button><button className="primary-button" disabled={!title.trim()} onClick={() => void submit()}>{course ? "保存" : "创建课程"}<ArrowRight size={15} /></button></DialogFooter></DialogContent></Dialog>;
}

export default function CoursesPage() {
  const { courses, updateCourse } = useWorkspace();
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const navigate = useNavigate();
  const visible = courses.filter((course) => course.archived === showArchived && `${course.title}${course.description}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (a.pinned) return (b.pinnedAt ?? "").localeCompare(a.pinnedAt ?? "");
    return b.updatedAt.localeCompare(a.updatedAt);
  });
  const togglePin = (course: Course) => void updateCourse({ ...course, pinned: !course.pinned, pinnedAt: !course.pinned ? new Date().toISOString() : null });
  return <div className="page-container courses-page">
    <div className="page-heading-row simple-page-heading"><div><h1>课程与资料</h1><p>按课程管理学习资料和笔记。</p></div><CourseDialog trigger={<button className="primary-button large-button"><Plus size={18} />新建课程</button>} /></div>
    <div className="course-status-bar"><div className="course-status-tabs" role="tablist"><button role="tab" aria-selected={!showArchived} className={!showArchived ? "active" : ""} onClick={() => setShowArchived(false)}>当前课程</button><button role="tab" aria-selected={showArchived} className={showArchived ? "active" : ""} onClick={() => setShowArchived(true)}>已归档</button></div><label className="content-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索课程…" /></label></div>
    <div className="course-grid">{visible.map((course) => <article className="course-card" key={course.id}>
      <button className="course-card-main" onClick={() => navigate(`/courses/${course.id}`)}>
        <div className="course-card-cover" style={{ background: course.color }}><span className="course-cover-emoji">{course.icon || "📘"}</span>{course.pinned && <span className="course-pinned-badge"><Pin size={12} />置顶</span>}<span className="course-cover-lines" aria-hidden="true"><i /><i /><i /></span><ArrowRight className="course-cover-arrow" size={18} /></div>
        <div className="course-card-body"><h2>{course.title}</h2>{course.description && <p>{course.description}</p>}</div>
      </button>
      <div className="course-card-footer"><span>上次修改 {new Date(course.updatedAt).toLocaleString("zh-CN", { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span><DropdownMenu><DropdownMenuTrigger asChild><button className="icon-button" aria-label={`${course.title}操作`}><MoreHorizontal size={18} /></button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => navigate(`/courses/${course.id}`)}><BookOpen size={14} />打开课程</DropdownMenuItem><DropdownMenuItem onSelect={() => togglePin(course)}>{course.pinned ? <Pin size={14} /> : <Pin size={14} />}{course.pinned ? "取消置顶" : "置顶课程"}</DropdownMenuItem><CourseDialog course={course} trigger={<DropdownMenuItem onSelect={(event) => event.preventDefault()}><Pencil size={14} />编辑课程</DropdownMenuItem>} /><DropdownMenuItem onSelect={() => void updateCourse({ ...course, archived: !course.archived })}>{course.archived ? <Check size={14} /> : <Archive size={14} />}{course.archived ? "恢复课程" : "归档课程"}</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>
    </article>)}</div>
    {!visible.length && <div className="large-empty-state"><FolderOpen size={32} /><h3>{showArchived ? "还没有已归档课程" : "没有找到课程"}</h3><p>{showArchived ? "归档的课程会显示在这里。" : "尝试其他关键词，或新建一门课程。"}</p></div>}
  </div>;
}
