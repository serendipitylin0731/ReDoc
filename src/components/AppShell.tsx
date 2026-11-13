import { useState, type ReactNode } from "react";
import { BookOpen, FileText, FolderKanban, ListChecks, Menu, PanelLeftClose, PanelLeftOpen, ScanText, Settings, X } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { useWorkspace } from "@app/state/WorkspaceContext";

export function Brand({ compact = false }: { compact?: boolean }) {
  return <div className={`brand ${compact ? "brand-compact" : ""}`}>
    <span className="brand-mark" aria-hidden="true"><span>R</span><i /></span>
    {!compact && <span><strong>ReDoc</strong><small>课程资料与笔记</small></span>}
  </div>;
}

export default function AppShell({ children }: { children: ReactNode }) {
  const { courses, notes, jobs } = useWorkspace();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem("redoc-sidebar-collapsed") === "true"; }
    catch { return false; }
  });
  const pathParts = location.pathname.split("/");
  const courseIndex = pathParts.indexOf("courses");
  const routeCourseId = courseIndex >= 0 ? pathParts[courseIndex + 1] : undefined;
  const activeCourse = courses.find((course) => course.id === routeCourseId) ?? courses.find((course) => !course.archived) ?? courses[0];
  const activeJobs = jobs.filter((job) => job.status === "running" || job.status === "queued").length;
  const workspacePath = activeCourse ? `/courses/${activeCourse.id}/workspace` : "/courses";
  const convertPath = activeCourse ? `/courses/${activeCourse.id}/convert` : "/courses";
  const notesPath = activeCourse ? `/courses/${activeCourse.id}/notes` : "/courses";
  const courseAreaActive = routeCourseId && !["/workspace", "/notes", "/convert"].some((part) => location.pathname.includes(part));
  const closeMobile = () => setMobileOpen(false);
  const toggleCollapsed = () => setCollapsed((value) => {
    const next = !value;
    try { localStorage.setItem("redoc-sidebar-collapsed", String(next)); } catch {}
    return next;
  });

  return <div className={`app-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
    <aside className={`app-sidebar ${mobileOpen ? "mobile-open" : ""}`}>
      <div className="sidebar-top"><Brand compact={collapsed && !mobileOpen} /><button className="desktop-sidebar-toggle icon-button" onClick={toggleCollapsed} aria-label={collapsed ? "展开左侧栏" : "收起左侧栏"} title={collapsed ? "展开左侧栏" : "收起左侧栏"}>{collapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}</button><button className="mobile-close icon-button" onClick={closeMobile} aria-label="关闭导航"><X size={20} /></button></div>
      <nav className="app-navigation" aria-label="主导航">
        <span className="navigation-label">学习空间</span>
        <NavLink to="/courses" title="课程与资料" className={() => `nav-item ${courseAreaActive || location.pathname === "/courses" ? "active" : ""}`} onClick={closeMobile}><FolderKanban size={18} /><span>课程与资料</span><span className="nav-count">{courses.filter((course) => !course.archived).length}</span></NavLink>
        <NavLink to={notesPath} title="课程笔记" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`} onClick={closeMobile}><FileText size={18} /><span>课程笔记</span><span className="nav-count">{notes.filter((note) => !activeCourse || note.courseId === activeCourse.id).length}</span></NavLink>
        <span className="navigation-label workspace-navigation-label">工作台</span>
        <NavLink to={workspacePath} title="资料整理笔记" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`} onClick={closeMobile}><BookOpen size={18} /><span>资料整理笔记</span></NavLink>
        <NavLink to={convertPath} title="图片 / PDF 转文字" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`} onClick={closeMobile}><ScanText size={18} /><span>图片 / PDF 转文字</span></NavLink>
      </nav>
      <div className="sidebar-bottom">
        <NavLink to="/jobs" title="转换任务" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`} onClick={closeMobile}><ListChecks size={18} /><span>转换任务</span>{activeJobs > 0 ? <span className="nav-live">{activeJobs}</span> : <span className="nav-count">{jobs.length}</span>}</NavLink>
        <NavLink to="/settings" title="设置" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`} onClick={closeMobile}><Settings size={18} /><span>设置</span></NavLink>
      </div>
    </aside>
    {mobileOpen && <button className="sidebar-scrim" onClick={closeMobile} aria-label="关闭导航" />}
    <div className="mobile-header"><button className="icon-button" onClick={() => setMobileOpen(true)} aria-label="打开导航"><Menu size={21} /></button><Brand /></div>
    <main className="app-main">{children}</main>
  </div>;
}
