import { useState } from "react";
import { ChevronDown, Download, FileCode2, FileText, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { exportDocx, exportMarkdown } from "@app/lib/export";
import type { Note } from "@app/types";

export default function ExportMenu({ note, compact = false }: { note: Note; compact?: boolean }) {
  const [exporting, setExporting] = useState<string | null>(null);
  const run = async (format: "md" | "docx") => {
    setExporting(format);
    try {
      if (format === "md") await exportMarkdown(note, [], false);
      else await exportDocx(note, false);
      toast.success(`${format === "md" ? "Markdown" : "Word"} 已导出`);
    } catch {
      toast.error("导出失败，请稍后重试。");
    } finally {
      setExporting(null);
    }
  };
  return <DropdownMenu>
    <DropdownMenuTrigger asChild><button className={compact ? "toolbar-button" : "primary-button"} disabled={Boolean(exporting)}>{exporting ? <LoaderCircle size={16} className="spin" /> : <Download size={16} />}<span>导出</span><ChevronDown size={14} /></button></DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="export-menu">
      <DropdownMenuLabel>导出当前笔记</DropdownMenuLabel>
      <DropdownMenuItem onSelect={() => void run("md")}><FileCode2 size={17} /><span><strong>Markdown</strong><small>{note.blocks.some((block) => block.src) ? "ZIP · 含 assets 图片目录" : "UTF-8 .md 文件"}</small></span></DropdownMenuItem>
      <DropdownMenuItem onSelect={() => void run("docx")}><FileText size={17} /><span><strong>Word 文档</strong><small>.docx · 保留标题、表格与图片</small></span></DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;
}
