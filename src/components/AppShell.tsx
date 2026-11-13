import { useState, type ReactNode } from "react";
import { BookOpen, FolderKanban, Menu, PanelLeftClose, PanelLeftOpen, Settings, X } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { useWorkspace } from "@app/state/WorkspaceContext";

export function Brand({ compact = false }: { compact?: boolean }) {
  return <div className={`brand ${compact ? "brand-compact" : ""}`}>
    {!compact && <strong>ReDoc</strong>}
  </div>;
}

export default function AppShell({ children }: { children: ReactNode }) {
  const { courses } = useWorkspace();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem("redoc-sidebar-collapsed") === "true"; }
    catch { return false; }
  });
  const workbenchActive = location.pathname.startsWith("/workbench") || /\/courses\/[^/]+\/(workspace|convert|notes)/.test(location.pathname);
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
        <NavLink to="/courses" title="课程与资料" className={({ isActive }) => `nav-item ${isActive || location.pathname === "/courses" ? "active" : ""}`} onClick={closeMobile}><FolderKanban size={18} /><span>课程与资料</span><span className="nav-count">{courses.filter((course) => !course.archived).length}</span></NavLink>
        <span className="navigation-label workspace-navigation-label">工作台</span>
        <NavLink to="/workbench" title="工作台" className={({ isActive }) => `nav-item ${isActive || workbenchActive ? "active" : ""}`} onClick={closeMobile}><BookOpen size={18} /><span>工作台</span></NavLink>
      </nav>
      <div className="sidebar-bottom">
        <NavLink to="/settings" title="设置" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`} onClick={closeMobile}><Settings size={18} /><span>设置</span></NavLink>
      </div>
    </aside>
    {mobileOpen && <button className="sidebar-scrim" onClick={closeMobile} aria-label="关闭导航" />}
    <div className="mobile-header"><button className="icon-button" onClick={() => setMobileOpen(true)} aria-label="打开导航"><Menu size={21} /></button><Brand /></div>
    <main className="app-main">{children}</main>
  </div>;
}
