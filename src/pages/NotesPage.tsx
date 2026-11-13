import { useState } from "react";
import { ArrowLeft, ArrowRight, Clock3, FileText, Heart, Link2, Plus, Search, Trash2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import ExportMenu from "@app/components/ExportMenu";
import { useWorkspace } from "@app/state/WorkspaceContext";

export default function NotesPage() {
  const { courseId = "" } = useParams();
  const { courses, notes, assets, createNote, updateNote, removeNote } = useWorkspace();
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("");
  const navigate = useNavigate();
  const course = courses.find((item) => item.id === courseId);
  const courseNotes = notes.filter((note) => note.courseId === courseId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const tags = Array.from(new Set(courseNotes.flatMap((note) => note.tags)));
  const visible = courseNotes.filter((note) => (!tag || note.tags.includes(tag)) && `${note.title}${note.tags.join("")}${note.blocks.map((block) => block.text).join("")}`.toLowerCase().includes(query.toLowerCase()));
  if (!course) return null;
  const create = async () => { const note = await createNote(courseId); open(note.id); };
  const open = (noteId: string) => navigate(`/courses/${courseId}/workspace?note=${noteId}${assets.find((asset) => asset.courseId === courseId) ? `&file=${assets.find((asset) => asset.courseId === courseId)!.id}` : ""}`);
  return <div className="page-container notes-page"><button className="back-link" onClick={() => navigate(`/courses/${courseId}`)}><ArrowLeft size={15} />{course.title}</button><div className="page-heading-row compact-heading"><div><span className="eyebrow">STRUCTURED COURSE NOTES</span><h1>我的笔记</h1><p>搜索、分类并继续整理。所有来源引用都随笔记一起保存。</p></div><button className="primary-button" onClick={() => void create()}><Plus size={17} />新建 Note</button></div><div className="content-toolbar"><label className="content-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题、正文或标签…" /></label><span className="note-total">{visible.length} / {courseNotes.length} 篇</span></div><div className="tag-filter-row"><button className={!tag ? "active" : ""} onClick={() => setTag("")}>全部</button>{tags.map((item) => <button className={tag === item ? "active" : ""} onClick={() => setTag(tag === item ? "" : item)} key={item}>#{item}</button>)}</div><div className="notes-list">{visible.map((note) => {
    const sources = note.blocks.filter((block) => block.sourceAnchorId).length;
    const excerpt = note.blocks.find((block) => block.text.replace(/<[^>]+>/g, "").trim())?.text.replace(/<[^>]+>/g, "") ?? "空白笔记";
    return <article className="note-list-card" key={note.id}><button className="note-list-main" onClick={() => open(note.id)}><span className="note-list-icon"><FileText size={21} /></span><span className="note-list-copy"><span className="note-list-title"><strong>{note.title}</strong>{note.favorite && <Heart size={14} fill="currentColor" />}</span><p>{excerpt}</p><span className="note-list-meta"><span><Clock3 size={13} />{new Date(note.updatedAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span><span>{note.blocks.length} 个内容块</span><span><Link2 size={13} />{sources} 条来源</span></span><span className="note-list-tags">{note.tags.map((item) => <i key={item}>#{item}</i>)}</span></span></button><div className="note-list-actions"><button className={`icon-button ${note.favorite ? "favorite" : ""}`} title="收藏" onClick={() => updateNote({ ...note, favorite: !note.favorite }, true)}><Heart size={17} fill={note.favorite ? "currentColor" : "none"} /></button><ExportMenu note={note} compact /><button className="icon-button delete-note" title="删除笔记" onClick={() => { if (window.confirm(`确认删除“${note.title}”？此操作不会影响原始资料。`)) void removeNote(note); }}><Trash2 size={16} /></button><button className="icon-button" onClick={() => open(note.id)}><ArrowRight size={17} /></button></div></article>;
  })}</div>{!visible.length && <div className="large-empty-state"><FileText size={30} /><h3>没有找到笔记</h3><p>调整搜索条件，或新建一篇空白 Note。</p></div>}</div>;
}
