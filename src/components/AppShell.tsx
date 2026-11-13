import { useState, type ReactNode } from "react";
import { BookOpen, Check, ChevronRight, CloudOff, FileText, FolderKanban, GraduationCap, ListChecks, Menu, Plus, Settings, ShieldCheck, X } from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useWorkspace } from "@app/state/WorkspaceContext";

export function Brand({ compact = false }: { compact?: boolean }) {
  return <div className={`brand ${compact ? "brand-compact" : ""}`}>
    <span className="brand-mark" aria-hidden="true"><span>R</span><i /></span>
    {!compact && <span><strong>ReDoc</strong><small>LEARN WITH SOURCES</small></span>}
  </div>;
}

export default function AppShell({ children }: { children: ReactNode }) {
  const { courses, notes, jobs } = useWorkspace();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathParts = location.pathname.split("/");
  const courseIndex = pathParts.indexOf("courses");
  const routeCourseId = courseIndex >= 0 ? pathParts[courseIndex + 1] : undefined;
  const activeCourse = courses.find((course) => course.id === routeCourseId) ?? courses.find((course) => !course.archived) ?? courses[0];
  const activeJobs = jobs.filter((job) => job.status === "running" || job.status === "queued").length;
  const workspacePath = activeCourse ? `/courses/${activeCourse.id}/workspace` : "/courses";
  const notesPath = activeCourse ? `/courses/${activeCourse.id}/notes` : "/courses";

  const navigation = <nav className="app-navigation" aria-label="主导航">
    <span className="navigation-label">学习空间</span>
    <NavLink to={workspacePath} className={({ isActive }) => `nav-item ${isActive || location.pathname.includes("/workspace") ? "active" : ""}`} onClick={() => setMobileOpen(false)}><BookOpen size={18} /><span>双栏工作台</span><ChevronRight size={15} /></NavLink>
    <NavLink to="/courses" className={({ isActive }) => `nav-item ${isActive || (routeCourseId && !location.pathname.includes("/workspace") && !location.pathname.includes("/notes")) ? "active" : ""}`} onClick={() => setMobileOpen(false)}><FolderKanban size={18} /><span>课程与资料</span><span className="nav-count">{courses.filter((course) => !course.archived).length}</span></NavLink>
    <NavLink to={notesPath} className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`} onClick={() => setMobileOpen(false)}><FileText size={18} /><span>我的笔记</span><span className="nav-count">{notes.filter((note) => !activeCourse || note.courseId === activeCourse.id).length}</span></NavLink>
    <NavLink to="/jobs" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`} onClick={() => setMobileOpen(false)}><ListChecks size={18} /><span>处理任务</span>{activeJobs > 0 ? <span className="nav-live">{activeJobs}</span> : <span className="nav-count">{jobs.length}</span>}</NavLink>
    {activeCourse && <div className="course-shortcuts">
      <div className="navigation-label-row"><span className="navigation-label">当前课程</span><button aria-label="管理课程" onClick={() => navigate("/courses")}><Plus size={14} /></button></div>
      <button className="current-course-card" onClick={() => { navigate(`/courses/${activeCourse.id}`); setMobileOpen(false); }}>
        <span className="course-monogram" style={{ background: activeCourse.color }}>{activeCourse.title.slice(0, 1)}</span>
        <span><strong>{activeCourse.title}</strong><small>{activeCourse.description}</small></span>
      </button>
      <div className="course-progress"><span><i style={{ width: `${Math.min(100, notes.filter((note) => note.courseId === activeCourse.id).length * 20)}%` }} /></span><small>{notes.filter((note) => note.courseId === activeCourse.id).length} 篇笔记 · 持续整理</small><Check size={13} /></div>
    </div>}
  </nav>;

  return <div className="app-shell">
    <aside className={`app-sidebar ${mobileOpen ? "mobile-open" : ""}`}>
      <div className="sidebar-top"><Brand /><button className="mobile-close icon-button" onClick={() => setMobileOpen(false)} aria-label="关闭导航"><X size={20} /></button></div>
      {navigation}
      <div className="sidebar-bottom">
        <NavLink to="/settings" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`} onClick={() => setMobileOpen(false)}><Settings size={18} /><span>偏好设置</span></NavLink>
        <div className="local-first-card"><ShieldCheck size={17} /><div><strong>本地优先 · 原件保护</strong><span>资料仅保存在此浏览器</span></div><CloudOff size={14} /></div>
        <div className="account-row"><span className="account-avatar">SL</span><span><strong>学习研究员</strong><small>个人工作空间</small></span><GraduationCap size={17} /></div>
      </div>
    </aside>
    {mobileOpen && <button className="sidebar-scrim" onClick={() => setMobileOpen(false)} aria-label="关闭导航" />}
    <div className="mobile-header"><button className="icon-button" onClick={() => setMobileOpen(true)} aria-label="打开导航"><Menu size={21} /></button><Brand /><span className="mobile-local"><ShieldCheck size={15} />本地已保护</span></div>
    <main className="app-main">{children}</main>
  </div>;
}
