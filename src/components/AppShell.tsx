import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Settings } from "lucide-react";
import { Link } from "react-router-dom";

export function Brand() {
  return <Link to="/courses" className="brand"><img className="brand-logo" src="/redoc-logo.png" alt="" width="32" height="32" /><strong>ReDoc</strong></Link>;
}

const HeaderContentContext = createContext<(node: ReactNode | null) => void>(() => undefined);

export function useHeaderContent() {
  return useContext(HeaderContentContext);
}

export function HeaderContent({ children }: { children: ReactNode }) {
  const setContent = useHeaderContent();
  useEffect(() => {
    setContent(children);
    return () => setContent(null);
  }, [children, setContent]);
  return null;
}

export default function AppShell({ children }: { children: ReactNode }) {
  const [headerContent, setHeaderContent] = useState<ReactNode | null>(null);
  return <HeaderContentContext.Provider value={setHeaderContent}>
    <div className="app-shell">
      <div className="bg-scene" aria-hidden="true"><i className="bg-blob b1" /><i className="bg-blob b2" /><i className="bg-blob b3" /></div>
      <header className="app-header">
        <Brand />
        {headerContent}
        <div className="app-header-spacer" />
        <Link to="/settings" className="icon-button" title="设置" aria-label="设置"><Settings size={19} /></Link>
      </header>
      <main className="app-main">{children}</main>
      <footer className="app-footer" aria-hidden="true">
        <span>serendipity_lin@sjtu.edu.cn</span>
        <span>Made with Qoder</span>
      </footer>
    </div>
  </HeaderContentContext.Provider>;
}
