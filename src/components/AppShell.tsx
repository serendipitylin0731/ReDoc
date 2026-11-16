import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { HelpCircle, Settings } from "lucide-react";
import { Link } from "react-router-dom";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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

const HELP_SECTIONS: { title: string; items: string[] }[] = [
  { title: "课程与资料", items: ["在首页新建课程，可设置图标、颜色、置顶与归档；删除课程会连同资料一并清除。", "进入课程后，左侧「文件」区可导入资料、新建文件夹（支持嵌套）、搜索、按格式筛选与排序。"] },
  { title: "笔记", items: ["右侧工作台选择「笔记」，在 PDF/图片里框选后点「截图加入 Note」或「识别后加入」。", "框选后可拖动四角调整大小；点取消或完成才能继续其他操作。", "格式栏可设置标题级别（一级/二级/三级标题）与左中右对齐，改动自动保存。"] },
  { title: "转文字", items: ["右侧工作台选择「转文字」，选格式后「开始转换」，预览可微调，再保存到课程目录或下载到本地。", "支持框选区域并一键应用到全部页面，识别时默认忽略页眉页脚。"] },
  { title: "编译 PDF", items: ["在 Markdown / 文本文件的右上角点「导出 PDF」，或在工作台「编译 PDF」标签预览并下载。"] },
  { title: "其他", items: ["顶部「打包下载」把整个课程压缩为 zip。", "右上角设置可切换明暗主题、OCR 语言、AI 整理开关，并备份笔记与来源元数据。"] },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const [headerContent, setHeaderContent] = useState<ReactNode | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  return <HeaderContentContext.Provider value={setHeaderContent}>
    <div className="app-shell">
      <div className="bg-scene" aria-hidden="true"><i className="bg-blob b1" /><i className="bg-blob b2" /><i className="bg-blob b3" /></div>
      <header className="app-header">
        <Brand />
        {headerContent}
        <div className="app-header-spacer" />
        <button className="icon-button" onClick={() => setHelpOpen(true)} title="使用说明" aria-label="使用说明"><HelpCircle size={19} /></button>
        <Link to="/settings" className="icon-button" title="设置" aria-label="设置"><Settings size={19} /></Link>
      </header>
      <main className="app-main">{children}</main>
      <footer className="app-footer" aria-hidden="true">
        <span>serendipity_lin@sjtu.edu.cn</span>
        <span>Made with Qoder</span>
      </footer>
    </div>
    <Dialog open={helpOpen} onOpenChange={setHelpOpen}><DialogContent className="help-dialog"><DialogHeader><DialogTitle><HelpCircle size={19} />使用说明</DialogTitle><DialogDescription>ReDoc 是一个本地优先的课程资料与笔记工作台。</DialogDescription></DialogHeader><div className="help-sections">{HELP_SECTIONS.map((section) => <section key={section.title}><h3>{section.title}</h3><ul>{section.items.map((item) => <li key={item}>{item}</li>)}</ul></section>)}</div></DialogContent></Dialog>
  </HeaderContentContext.Provider>;
}
