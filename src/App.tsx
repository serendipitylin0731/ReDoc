import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { LoaderCircle } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import AppShell, { Brand } from "@app/components/AppShell";
import { WorkspaceProvider, useWorkspace } from "@app/state/WorkspaceContext";
import WorkspacePage from "@app/pages/WorkspacePage";
import WorkbenchHub from "@app/pages/WorkbenchHub";
import CoursesPage from "@app/pages/CoursesPage";
import CourseHomePage from "@app/pages/CourseHomePage";
import NotesPage from "@app/pages/NotesPage";
import JobsPage from "@app/pages/JobsPage";
import SettingsPage from "@app/pages/SettingsPage";
import ReconstructPage from "@app/pages/ReconstructPage";

function AppRoutes() {
  const { loading } = useWorkspace();
  if (loading) return <div className="app-loading"><Brand /><LoaderCircle size={23} className="spin" /><span>正在打开你的本地研究工作台…</span><small>资料、笔记与来源关系正在恢复</small></div>;
  return <AppShell><Routes>
    <Route path="/" element={<Navigate to="/workbench" replace />} />
    <Route path="/workbench" element={<WorkbenchHub />} />
    <Route path="/courses" element={<CoursesPage />} />
    <Route path="/courses/:courseId" element={<CourseHomePage />} />
    <Route path="/courses/:courseId/workspace" element={<WorkspacePage />} />
    <Route path="/courses/:courseId/notes" element={<NotesPage />} />
    <Route path="/courses/:courseId/convert" element={<ReconstructPage />} />
    <Route path="/courses/:courseId/convert/:documentId" element={<ReconstructPage />} />
    <Route path="/jobs" element={<JobsPage />} />
    <Route path="/settings" element={<SettingsPage />} />
    <Route path="*" element={<Navigate to="/courses" replace />} />
  </Routes></AppShell>;
}

export default function App() {
  return <BrowserRouter><WorkspaceProvider><AppRoutes /><Toaster position="bottom-right" closeButton /></WorkspaceProvider></BrowserRouter>;
}
