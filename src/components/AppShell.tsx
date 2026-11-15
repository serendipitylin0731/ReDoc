import type { ReactNode } from "react";
import { Settings } from "lucide-react";
import { Link } from "react-router-dom";

export function Brand() {
  return <Link to="/courses" className="brand"><strong>ReDoc</strong></Link>;
}

export default function AppShell({ children }: { children: ReactNode }) {
  return <div className="app-shell">
    <header className="app-header">
      <Brand />
      <div className="app-header-spacer" />
      <Link to="/settings" className="icon-button" title="设置" aria-label="设置"><Settings size={19} /></Link>
    </header>
    <main className="app-main">{children}</main>
  </div>;
}
