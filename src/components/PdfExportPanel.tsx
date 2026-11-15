import { useMemo } from "react";
import { Download, FileText } from "lucide-react";
import { noteToPrintHtml, openPrintWindow } from "@app/lib/pdf";
import type { Note } from "@app/types";

export default function PdfExportPanel({ note }: { note: Note }) {
  const html = useMemo(() => noteToPrintHtml(note), [note]);
  return <div className="pdf-export-panel">
    <div className="pdf-export-toolbar"><span><FileText size={15} />PDF 预览</span><button className="primary-button" onClick={() => openPrintWindow(html, note.title)}><Download size={15} />下载 PDF</button></div>
    <iframe className="pdf-preview-frame" title="PDF 预览" srcDoc={html} sandbox="" />
  </div>;
}
