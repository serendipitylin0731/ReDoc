import { useRef, useState, type DragEvent, type ReactNode } from "react";
import { FilePlus2, FolderInput, UploadCloud, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@app/state/WorkspaceContext";
import type { Asset } from "@app/types";

export default function UploadDialog({ courseId, trigger, onUploaded }: { courseId: string; trigger: ReactNode; onUploaded?: (assets: Asset[]) => void }) {
  const { folders, uploadFiles } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [folderId, setFolderId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const courseFolders = folders.filter((folder) => folder.courseId === courseId);

  const addFiles = (incoming: File[]) => {
    setFiles((current) => [...current, ...incoming.filter((file) => !current.some((item) => item.name === file.name && item.size === file.size))]);
  };
  const drop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    addFiles(Array.from(event.dataTransfer.files));
  };
  const submit = async () => {
    if (!files.length) return;
    setUploading(true);
    try {
      const uploaded = await uploadFiles(courseId, files, folderId || null);
      if (uploaded.length) {
        onUploaded?.(uploaded);
        setFiles([]);
        setOpen(false);
      }
    } catch {
      toast.error("导入失败，请检查文件与浏览器存储空间。");
    } finally {
      setUploading(false);
    }
  };

  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild>{trigger}</DialogTrigger>
    <DialogContent className="upload-dialog">
      <DialogHeader><DialogTitle>导入课程资料</DialogTitle><DialogDescription>原文件不可变保存，上传成功后即可预览，无需等待 OCR。</DialogDescription></DialogHeader>
      <button className={`upload-dropzone ${dragging ? "dragging" : ""}`} onClick={() => inputRef.current?.click()} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={drop}>
        <span className="upload-icon"><UploadCloud size={28} /></span>
        <strong>拖放文件到这里，或点击选择</strong>
        <span>支持 PDF、图片、Markdown、文本、音视频与 Office</span>
        <small>单文件不超过 100 MB · 支持批量导入 · 重复文件仅提醒不覆盖</small>
      </button>
      <input ref={inputRef} type="file" multiple hidden onChange={(event) => { addFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
      {files.length > 0 && <div className="upload-file-list">
        <div className="upload-list-heading"><strong>待导入 · {files.length}</strong><button onClick={() => setFiles([])}>清空</button></div>
        {files.map((file, index) => <div className="upload-file-row" key={`${file.name}-${file.size}`}><FilePlus2 size={17} /><span><strong>{file.name}</strong><small>{file.size > 1024 * 1024 ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(file.size / 1024)} KB`}</small></span><button aria-label={`移除 ${file.name}`} onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X size={15} /></button></div>)}
      </div>}
      <label className="field-label"><span><FolderInput size={15} />保存到目录</span><select value={folderId} onChange={(event) => setFolderId(event.target.value)}><option value="">课程根目录</option>{courseFolders.map((folder) => <option value={folder.id} key={folder.id}>{folder.name}</option>)}</select></label>
      <DialogFooter><Button variant="ghost" onClick={() => setOpen(false)}>取消</Button><Button onClick={submit} disabled={!files.length || uploading}>{uploading ? <><span className="spinner" />正在保存原件</> : `导入 ${files.length || ""} 份资料`}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
