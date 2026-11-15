import { useEffect, useMemo } from "react";
import { Download, FileText } from "lucide-react";
import { markdownToPrintHtml, noteToPrintHtml, openPrintWindow } from "@app/lib/pdf";
import { useWorkspace } from "@app/state/WorkspaceContext";
import type { Note } from "@app/types";

export default function PdfExportPanel({ note, file }: { note: Note | null; file: { name: string; markdown: string; courseId: string } | null }) {
  const { assets } = useWorkspace();
  const imageUrls = useMemo(() => {
    const map = new Map<string, string>();
    if (!file) return map;
    for (const item of assets.filter((entry) => entry.courseId === file.courseId && entry.kind === "image")) map.set(item.name, URL.createObjectURL(item.blob));
    return map;
  }, [assets, file]);
  useEffect(() => () => { imageUrls.forEach((url) => URL.revokeObjectURL(url)); }, [imageUrls]);
  const resolveImage = (src: string) => {
    if (/^(https?:|data:|blob:)/.test(src)) return src;
    const name = decodeURIComponent(src.split("/").pop()?.split(/[?#]/)[0] ?? "");
    return imageUrls.get(name) ?? src;
  };
  const title = note ? note.title : file ? file.name : "";
  const html = useMemo(() => {
    if (note) return noteToPrintHtml(note);
    if (file) return markdownToPrintHtml(file.markdown, file.name, resolveImage);
    return "";
  }, [note, file, imageUrls]);
  if (!note && !file) return <div className="empty-note"><FileText size={28} /><p>暂时没有待编译文件</p><small>在左侧选择笔记，或点击 Markdown / 文本文件的“导出 PDF”。</small></div>;
  return <div className="pdf-export-panel">
    <div className="pdf-export-toolbar"><span><FileText size={15} />{title}</span><button className="primary-button" onClick={() => openPrintWindow(html, title)}><Download size={15} />下载 PDF</button></div>
    <iframe className="pdf-preview-frame" title="PDF 预览" srcDoc={html} sandbox="" />
  </div>;
}
