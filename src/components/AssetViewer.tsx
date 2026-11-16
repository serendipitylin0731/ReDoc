import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { AudioLines, Camera, ChevronRight, Download, Expand, File, FileArchive, FileImage, FileText, Play, ScanText, Table2, Video } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import PdfViewer from "@app/components/PdfViewer";
import { downloadOriginal } from "@app/lib/export";
import { renderMarkdownHtml } from "@app/lib/markdown";
import { ocrImage, ocrTextToBlocks } from "@app/lib/reconstruct";
import { useWorkspace } from "@app/state/WorkspaceContext";
import type { Asset } from "@app/types";

interface ViewerProps { asset: Asset; noteId: string; onNoteChange: (id: string) => void; showConvert?: boolean; onConvert?: () => void; onExportPdf?: () => void; regionMode?: boolean; onRegionModeChange?: (value: boolean) => void; onRegion?: (bbox: BBox | null) => void }
type BBox = [number, number, number, number];
interface Region { x: number; y: number; width: number; height: number }

function ImageViewer({ asset, noteId, onNoteChange, regionMode = false, onRegionModeChange, onRegion }: ViewerProps) {
  const { addExcerpt, insertOcrBlocks } = useWorkspace();
  const [url, setUrl] = useState("");
  const [region, setRegion] = useState<Region | null>(null);
  const [ocrProgress, setOcrProgress] = useState<number | null>(null);
  const [resizing, setResizing] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => { const value = URL.createObjectURL(asset.blob); setUrl(value); return () => URL.revokeObjectURL(value); }, [asset.blob]);
  const bounds = () => imageRef.current?.getBoundingClientRect();
  const point = (event: ReactPointerEvent) => { const box = bounds(); return { x: event.clientX - (box?.left ?? 0), y: event.clientY - (box?.top ?? 0) }; };
  const report = (value: Region | null) => {
    if (!value) { onRegion?.(null); return; }
    const box = bounds();
    if (box) onRegion?.([value.x / box.width, value.y / box.height, (value.x + value.width) / box.width, (value.y + value.height) / box.height]);
  };
  const down = (event: ReactPointerEvent<HTMLDivElement>) => { if (!regionMode) return; event.currentTarget.setPointerCapture(event.pointerId); const value = point(event); start.current = value; setRegion({ ...value, width: 0, height: 0 }); };
  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!start.current || !regionMode) return;
    const value = point(event);
    const next = { x: Math.min(start.current.x, value.x), y: Math.min(start.current.y, value.y), width: Math.abs(value.x - start.current.x), height: Math.abs(value.y - start.current.y) };
    setRegion(next);
    report(next);
  };
  const resizeRef = useRef<{ corner: string; start: Region; startX: number; startY: number } | null>(null);
  const startResize = (corner: string) => (event: ReactPointerEvent<HTMLElement>) => {
    if (!region) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeRef.current = { corner, start: { ...region }, startX: event.clientX, startY: event.clientY };
    setResizing(true);
  };
  const resizeMove = (event: ReactPointerEvent<HTMLElement>) => {
    const resize = resizeRef.current;
    const box = bounds();
    if (!resize || !box) return;
    const dx = event.clientX - resize.startX;
    const dy = event.clientY - resize.startY;
    const r = resize.start;
    let next: Region;
    if (resize.corner === "se") next = { x: r.x, y: r.y, width: Math.max(10, r.width + dx), height: Math.max(10, r.height + dy) };
    else if (resize.corner === "nw") next = { x: r.x + dx, y: r.y + dy, width: Math.max(10, r.width - dx), height: Math.max(10, r.height - dy) };
    else if (resize.corner === "ne") next = { x: r.x, y: r.y + dy, width: Math.max(10, r.width + dx), height: Math.max(10, r.height - dy) };
    else next = { x: r.x + dx, y: r.y, width: Math.max(10, r.width - dx), height: Math.max(10, r.height + dy) };
    next.x = Math.max(0, Math.min(box.width - next.width, next.x));
    next.y = Math.max(0, Math.min(box.height - next.height, next.y));
    setRegion(next);
    report(next);
  };
  const resizeEnd = () => { resizeRef.current = null; setResizing(false); };
  const capture = async (withOcr: boolean) => {
    const image = imageRef.current;
    const box = bounds();
    if (!image || !box || !region || region.width < 5 || region.height < 5) { toast.info("请先框选图片区域"); return; }
    const scaleX = image.naturalWidth / box.width;
    const scaleY = image.naturalHeight / box.height;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(region.width * scaleX);
    canvas.height = Math.round(region.height * scaleY);
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(image, region.x * scaleX, region.y * scaleY, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
    const imageDataUrl = canvas.toDataURL("image/png");
    if (withOcr) {
      setOcrProgress(0);
      try {
        const result = await ocrImage(imageDataUrl, setOcrProgress);
        const blocks = ocrTextToBlocks(result.text);
        if (blocks.length) { insertOcrBlocks(noteId, blocks); onNoteChange(noteId); }
        else toast.warning("未识别到文字，可重新框选或改为截图。");
      } catch {
        toast.error("OCR 未完成，请重试。");
      } finally {
        setOcrProgress(null);
        setRegion(null);
        report(null);
        onRegionModeChange?.(false);
      }
      return;
    }
    const bbox: BBox = [region.x / box.width, region.y / box.height, (region.x + region.width) / box.width, (region.y + region.height) / box.height];
    const id = await addExcerpt({ asset, noteId, kind: "image_region", page: 1, bbox, imageDataUrl });
    onNoteChange(id);
    setRegion(null);
    report(null);
    onRegionModeChange?.(false);
  };
  return <>
    <div className="image-viewer-toolbar"><span><FileImage size={15} />原始图像 · 缩放不会改变来源坐标</span>{regionMode && <span className="region-hint">在图片上拖拽框选</span>}</div>
    <div className={`image-stage ${regionMode ? "region-active" : ""}`}><div className="image-capture-wrap">
      {url && <img ref={imageRef} src={url} alt={asset.name} draggable={false} />}
      {regionMode && !region && <div className="page-interaction-layer" onPointerDown={down} onPointerMove={move} onPointerUp={() => { start.current = null; }} />}
      {regionMode && region && region.width > 8 && region.height > 8 && <>
        <div className="region-block-overlay" />
        <div className="region-selection" style={{ left: region.x, top: region.y, width: region.width, height: region.height }}>
          <span className="region-size">{Math.round(region.width)} × {Math.round(region.height)}</span>
          <i className="region-handle nw" onPointerDown={startResize("nw")} onPointerMove={resizeMove} onPointerUp={resizeEnd} onPointerCancel={resizeEnd} />
          <i className="region-handle ne" onPointerDown={startResize("ne")} onPointerMove={resizeMove} onPointerUp={resizeEnd} onPointerCancel={resizeEnd} />
          <i className="region-handle sw" onPointerDown={startResize("sw")} onPointerMove={resizeMove} onPointerUp={resizeEnd} onPointerCancel={resizeEnd} />
          <i className="region-handle se" onPointerDown={startResize("se")} onPointerMove={resizeMove} onPointerUp={resizeEnd} onPointerCancel={resizeEnd} />
          <div className="region-float-actions">{!resizing && <><button className="toolbar-button" onClick={() => { setRegion(null); report(null); }}>取消</button><button className="toolbar-button" disabled={ocrProgress !== null} onClick={() => void capture(true)}>{ocrProgress !== null ? "OCR…" : "识别后加入"}</button><button className="primary-button" disabled={ocrProgress !== null} onClick={() => void capture(false)}>截图加入 Note</button></>}</div>
        </div>
      </>}
    </div></div>
  </>;
}

function TextViewer({ asset, noteId }: ViewerProps) {
  const { addExcerpt, assets } = useWorkspace();
  const [text, setText] = useState(asset.textContent ?? "");
  const [selection, setSelection] = useState<{ text: string; top: number; left: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!asset.textContent) void asset.blob.text().then(setText); else setText(asset.textContent); }, [asset]);
  const imageUrls = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of assets.filter((entry) => entry.courseId === asset.courseId && entry.kind === "image")) map.set(item.name, URL.createObjectURL(item.blob));
    return map;
  }, [assets, asset.courseId]);
  useEffect(() => () => { imageUrls.forEach((url) => URL.revokeObjectURL(url)); }, [imageUrls]);
  const resolveImage = (src: string) => {
    if (/^(https?:|data:|blob:)/.test(src)) return src;
    const name = decodeURIComponent(src.split("/").pop()?.split(/[?#]/)[0] ?? "");
    return imageUrls.get(name) ?? src;
  };
  const html = useMemo(() => (asset.kind === "markdown" ? renderMarkdownHtml(text, resolveImage) : ""), [asset.kind, text, imageUrls]);
  const selectText = () => {
    const selected = window.getSelection();
    const value = selected?.toString().trim() ?? "";
    const box = containerRef.current?.getBoundingClientRect();
    if (!selected || !value || !box || !selected.rangeCount) { setSelection(null); return; }
    const rect = selected.getRangeAt(0).getBoundingClientRect();
    setSelection({ text: value, top: Math.max(8, rect.top - box.top - 42), left: Math.max(8, Math.min(box.width - 160, rect.left - box.left)) });
  };
  const add = async () => {
    if (!selection) return;
    const start = text.indexOf(selection.text);
    await addExcerpt({ asset, noteId, kind: "doc_block", text: selection.text, textRange: start >= 0 ? { start, end: start + selection.text.length } : undefined });
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  };
  const rows = asset.kind === "csv" ? text.split(/\r?\n/).slice(0, 100).map((line) => line.split(",")) : [];
  return <div className="text-document-stage" ref={containerRef}>
    {asset.kind === "markdown" ? <article className="markdown-document" onMouseUp={selectText} dangerouslySetInnerHTML={{ __html: html }} /> : asset.kind === "csv" ? <div className="csv-table-wrap"><table><tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => index === 0 ? <th key={cellIndex}>{cell}</th> : <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table>{text.split(/\r?\n/).length > 100 && <p>仅预览前 100 行，完整内容请下载原文件。</p>}</div> : <pre className="plain-document" onMouseUp={selectText}>{text}</pre>}
    {selection && <div className="selection-toolbar text-selection-toolbar" style={{ top: selection.top, left: selection.left }}><button onClick={() => void add()}>加入当前 Note</button></div>}
  </div>;
}

function VideoViewer({ asset, noteId }: ViewerProps) {
  const { addExcerpt } = useWorkspace();
  const [url, setUrl] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => { const value = URL.createObjectURL(asset.blob); setUrl(value); return () => URL.revokeObjectURL(value); }, [asset.blob]);
  const capture = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) { toast.info("请先播放视频，再暂停到要摘录的画面"); return; }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    const startMs = Math.round(video.currentTime * 1000);
    await addExcerpt({ asset, noteId, kind: "video_frame", startMs, endMs: startMs, imageDataUrl: canvas.toDataURL("image/png"), text: `视频画面 · ${new Date(startMs).toISOString().slice(14, 19)}` });
  };
  return <div className="video-stage"><video ref={videoRef} src={url} controls playsInline preload="metadata">你的浏览器不支持此视频格式。</video><div className="video-actions"><span><Play size={15} />暂停到关键画面，截图会记录当前时间点</span><button className="primary-button" onClick={() => void capture()}><Camera size={16} />当前画面加入 Note</button></div></div>;
}

function AudioViewer({ asset }: { asset: Asset }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const value = URL.createObjectURL(asset.blob);
    setUrl(value);
    return () => URL.revokeObjectURL(value);
  }, [asset.blob]);
  return <div className="audio-stage"><AudioLines size={36} /><strong>{asset.name}</strong><audio controls src={url} /></div>;
}

function UnsupportedViewer({ asset }: { asset: Asset }) {
  const office = asset.kind === "office";
  return <div className="unsupported-viewer"><span className="unsupported-icon">{office ? <FileArchive size={38} /> : <File size={38} />}</span><span className="eyebrow">CONTROLLED PREVIEW FALLBACK</span><h3>{asset.name}</h3><p>{office ? "此 Office 文件已安全保留。当前线上版本不执行宏或脚本，也不上传第三方转换服务；请下载后使用本地 Office 查看。" : "当前浏览器无法直接预览此格式，原始文件未受影响。"}</p><div className="file-facts"><span>格式<strong>{asset.mime || "未知"}</strong></span><span>大小<strong>{(asset.size / 1024).toFixed(1)} KB</strong></span><span>原件版本<strong>v{asset.version}</strong></span></div><button className="primary-button" onClick={() => downloadOriginal(asset)}><Download size={16} />下载原始文件</button></div>;
}

export default function AssetViewer(props: ViewerProps) {
  const { asset, showConvert = true, onConvert, onExportPdf } = props;
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const canReconstruct = ["pdf", "image", "markdown", "text"].includes(asset.kind);
  const openConvert = () => { if (onConvert) onConvert(); else navigate(`/courses/${asset.courseId}/convert?file=${asset.id}`); };
  const KindIcon = asset.kind === "pdf" || asset.kind === "markdown" || asset.kind === "text" ? FileText : asset.kind === "image" ? FileImage : asset.kind === "video" ? Video : asset.kind === "audio" ? AudioLines : asset.kind === "csv" ? Table2 : FileArchive;
  return <div className="asset-viewer" ref={containerRef}>
    <div className="asset-viewer-header"><div className="asset-heading"><span className="asset-kind-icon"><KindIcon size={18} /></span><div><strong>{asset.name}</strong><span>原始资料 · v{asset.version} · {(asset.size / 1024).toFixed(1)} KB</span></div></div><div className="asset-header-actions">{(["markdown", "text"].includes(asset.kind)) && <button className="toolbar-button reconstruct-button" onClick={() => onExportPdf?.()} title="编译为 PDF"><FileText size={15} /><span>导出 PDF</span></button>}{showConvert && canReconstruct && <button className="toolbar-button reconstruct-button" onClick={openConvert}><ScanText size={15} /><span>转文字文档</span><ChevronRight size={13} /></button>}<button className="icon-button" onClick={() => downloadOriginal(asset)} title="下载原件" aria-label="下载原件"><Download size={16} /></button><button className="icon-button" onClick={() => void containerRef.current?.requestFullscreen()} title="全屏查看" aria-label="全屏查看"><Expand size={16} /></button></div></div>
    <div className="asset-viewer-content">{asset.kind === "pdf" ? <PdfViewer {...props} /> : asset.kind === "image" ? <ImageViewer {...props} /> : ["markdown", "text", "csv"].includes(asset.kind) ? <TextViewer {...props} /> : asset.kind === "video" ? <VideoViewer {...props} /> : asset.kind === "audio" ? <AudioViewer asset={asset} /> : <UnsupportedViewer asset={asset} />}</div>
  </div>;
}
