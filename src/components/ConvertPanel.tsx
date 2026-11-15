import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Download, FileText, FolderInput, LoaderCircle, Pencil, RefreshCw, Save, ScanText } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import DocumentPreview from "@app/components/DocumentPreview";
import { markdownToBlocks } from "@app/lib/ai";
import { blocksToMarkdown, buildDocxBlob, exportDocx, exportMarkdown } from "@app/lib/export";
import { useWorkspace } from "@app/state/WorkspaceContext";
import type { Asset, Note, NoteBlock } from "@app/types";

export default function ConvertPanel({ asset, courseId, onExit }: { asset: Asset; courseId: string; onExit: () => void }) {
  const { documents, jobs, startReconstruction, folders, saveDocumentAsset } = useWorkspace();
  const [format, setFormat] = useState<"markdown" | "docx">("markdown");
  const [markdown, setMarkdown] = useState("");
  const [edited, setEdited] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveFolderId, setSaveFolderId] = useState("");
  const [saving, setSaving] = useState(false);
  const courseFolders = folders.filter((folder) => folder.courseId === courseId);
  const base = asset.name.replace(/\.[^.]+$/, "");
  const title = `${base} · 文字版`;
  const document = documents.filter((item) => item.assetId === asset.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const job = jobs.find((item) => item.documentId === document?.id) ?? jobs.filter((item) => item.assetId === asset.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const processing = document?.status === "processing";

  useEffect(() => {
    setMarkdown("");
    setEdited(false);
    setEditing(false);
    setSaveOpen(false);
  }, [asset.id]);

  useEffect(() => {
    if (document?.status !== "ready") return;
    setMarkdown(blocksToMarkdown(noteForBlocks(document.blocks), [], false));
    setEdited(false);
    setEditing(false);
  }, [document?.id, document?.status]);

  function noteForBlocks(blocks: NoteBlock[]): Note {
    return {
      id: document?.id ?? "conversion", courseId, folderId: null, title, blocks, tags: [], favorite: false, version: 1,
      createdAt: document?.updatedAt ?? new Date().toISOString(), updatedAt: document?.updatedAt ?? new Date().toISOString(),
    };
  }

  const previewBlocks = useMemo(() => (edited ? markdownToBlocks(markdown) : document?.blocks ?? []), [edited, markdown, document?.blocks]);

  const start = async () => {
    if (!asset) return;
    try {
      await startReconstruction(asset);
    } catch {
      toast.error("无法启动转换，请重试。");
    }
  };

  const download = async () => {
    const note = noteForBlocks(previewBlocks);
    try {
      if (format === "markdown") await exportMarkdown(note, [], false);
      else await exportDocx(note, false);
      toast.success(format === "markdown" && note.blocks.some((block) => block.src) ? "Markdown 与图片已打包下载" : "文档已下载到本地");
    } catch {
      toast.error("下载失败，请重试。");
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const note = noteForBlocks(previewBlocks);
      const extension = format === "docx" ? "docx" : "md";
      const name = `${base} · 文字版.${extension}`;
      if (format === "docx") {
        const blob = await buildDocxBlob(note);
        await saveDocumentAsset(courseId, name, blob, "office", undefined, saveFolderId || null);
      } else {
        const text = edited ? markdown : blocksToMarkdown(note, [], false);
        const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
        await saveDocumentAsset(courseId, name, blob, "markdown", text, saveFolderId || null);
      }
      setSaveOpen(false);
    } catch {
      toast.error("保存失败，请重试。");
    } finally {
      setSaving(false);
    }
  };

  return <div className="convert-panel">
    <div className="convert-panel-header">
      <button className="back-link" onClick={onExit}><ArrowLeft size={15} />返回笔记</button>
      <div className="convert-panel-title"><ScanText size={16} /><span>转文字文档</span><small>{asset.name}</small></div>
      <select className="conversion-format-select" aria-label="目标格式" value={format} onChange={(event) => setFormat(event.target.value as "markdown" | "docx")}><option value="markdown">Markdown (.md)</option><option value="docx">Word (.docx)</option></select>
      {document?.status === "ready" && <button className="toolbar-button" onClick={() => void start()} disabled={processing}><RefreshCw size={15} />重新转换</button>}
    </div>
    {processing && <div className="reconstruct-progress"><LoaderCircle size={19} className="spin" /><div><strong>正在生成文字文档…</strong><span>文字层直接提取，图片和扫描页进行中英文 OCR，同时保留原始页面。</span></div><span>{job?.progress ?? 0}%</span><i style={{ width: `${job?.progress ?? 0}%` }} /></div>}
    {document?.status === "failed" && <div className="reconstruct-failed"><strong>转换未完成</strong><span>{job?.errorMessage ?? "请重试。"}</span><button onClick={() => void start()}>重新转换</button></div>}
    {document?.status === "ready" ? <div className="convert-panel-body">
      <div className="convert-panel-toolbar">
        <button className={`toolbar-button ${editing ? "selected" : ""}`} onClick={() => setEditing((value) => !value)}>{editing ? <FileText size={15} /> : <Pencil size={15} />}{editing ? "预览" : "微调文本"}</button>
        <div className="convert-panel-actions"><button className="toolbar-button" onClick={() => setSaveOpen(true)}><Save size={15} />保存到课程</button><button className="primary-button" onClick={() => void download()}><Download size={15} />下载到本地</button></div>
      </div>
      <div className="convert-panel-scroll">{editing ? <textarea className="convert-markdown-editor" value={markdown} onChange={(event) => { setMarkdown(event.target.value); setEdited(true); }} aria-label="微调转换文本" /> : <DocumentPreview blocks={previewBlocks} />}</div>
    </div> : <div className="large-empty-state"><ScanText size={28} /><h3>把这份资料转成文字</h3><p>选择目标格式，转换后先预览、微调，再保存到课程文件夹或下载到本地。</p><button className="primary-button" onClick={() => void start()} disabled={processing}><ScanText size={16} />开始转换</button></div>}
    <Dialog open={saveOpen} onOpenChange={setSaveOpen}><DialogContent><DialogHeader><DialogTitle><Save size={18} />保存到课程文件夹</DialogTitle><DialogDescription>文档会作为文件保存在当前课程的目录中，之后可在左侧文件树找到并再次打开。</DialogDescription></DialogHeader><label className="field-label"><span><FolderInput size={15} />保存目录</span><select value={saveFolderId} onChange={(event) => setSaveFolderId(event.target.value)}><option value="">课程根目录</option>{courseFolders.map((folder) => <option value={folder.id} key={folder.id}>{folder.name}</option>)}</select></label><DialogFooter><button className="toolbar-button" onClick={() => setSaveOpen(false)}>取消</button><button className="primary-button" disabled={saving} onClick={() => void save()}>{saving ? <LoaderCircle size={15} className="spin" /> : <Save size={15} />}保存</button></DialogFooter></DialogContent></Dialog>
  </div>;
}
