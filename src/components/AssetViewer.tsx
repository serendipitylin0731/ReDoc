import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { AudioLines, Camera, ChevronRight, Crop, Download, Expand, File, FileArchive, FileImage, FileText, LoaderCircle, Play, ScanText, Table2, Video } from "lucide-react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import PdfViewer from "@app/components/PdfViewer";
import { downloadOriginal } from "@app/lib/export";
import { ocrImage } from "@app/lib/reconstruct";
import { useWorkspace } from "@app/state/WorkspaceContext";
import type { Asset, SourceAnchor } from "@app/types";

interface ViewerProps { asset: Asset; noteId: string; onNoteChange: (id: string) => void; focusAnchor?: SourceAnchor | null }
type BBox = [number, number, number, number];
interface Region { x: number; y: number; width: number; height: number }

function ImageViewer({ asset, noteId, onNoteChange, focusAnchor }: ViewerProps) {
  const { addExcerpt } = useWorkspace();
  const [url, setUrl] = useState("");
  const [regionMode, setRegionMode] = useState(false);
  const [region, setRegion] = useState<Region | null>(null);
  const [highlight, setHighlight] = useState<BBox | null>(focusAnchor?.bbox ?? null);
  const [ocrProgress, setOcrProgress] = useState<number | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => { const value = URL.createObjectURL(asset.blob); setUrl(value); return () => URL.revokeObjectURL(value); }, [asset.blob]);
  useEffect(() => { setHighlight(focusAnchor?.bbox ?? null); }, [focusAnchor]);
  const bounds = () => imageRef.current?.getBoundingClientRect();
  const point = (event: ReactPointerEvent) => { const box = bounds(); return { x: event.clientX - (box?.left ?? 0), y: event.clientY - (box?.top ?? 0) }; };
  const down = (event: ReactPointerEvent<HTMLDivElement>) => { if (!regionMode) return; event.currentTarget.setPointerCapture(event.pointerId); const value = point(event); start.current = value; setRegion({ ...value, width: 0, height: 0 }); };
  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!start.current || !regionMode) return;
    const value = point(event);
    setRegion({ x: Math.min(start.current.x, value.x), y: Math.min(start.current.y, value.y), width: Math.abs(value.x - start.current.x), height: Math.abs(value.y - start.current.y) });
  };
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
    const bbox: BBox = [region.x / box.width, region.y / box.height, (region.x + region.width) / box.width, (region.y + region.height) / box.height];
    let text: string | undefined;
    if (withOcr) {
      setOcrProgress(0);
      try { text = (await ocrImage(imageDataUrl, setOcrProgress)).text.trim(); }
      catch { toast.warning("OCR 未完成，原图仍会保留在笔记中"); }
      finally { setOcrProgress(null); }
    }
    const id = await addExcerpt({ asset, noteId, kind: "image_region", page: 1, bbox, imageDataUrl, text });
    onNoteChange(id);
    setHighlight(bbox);
    setRegion(null);
    setRegionMode(false);
  };
  return <>
    <div className="image-viewer-toolbar"><span><FileImage size={15} />原始图像 · 缩放不会改变来源坐标</span><button className={`toolbar-button ${regionMode ? "selected" : ""}`} onClick={() => { setRegionMode((value) => !value); setRegion(null); }}><Crop size={15} />{regionMode ? "退出框选" : "框选摘录"}</button></div>
    <div className={`image-stage ${regionMode ? "region-active" : ""}`}><div className="image-capture-wrap">
      {url && <img ref={imageRef} src={url} alt={asset.name} draggable={false} />}
      {highlight && <div className="source-highlight" style={{ left: `${highlight[0] * 100}%`, top: `${highlight[1] * 100}%`, width: `${(highlight[2] - highlight[0]) * 100}%`, height: `${(highlight[3] - highlight[1]) * 100}%` }} />}
      {regionMode && <div className="page-interaction-layer" onPointerDown={down} onPointerMove={move} onPointerUp={() => { start.current = null; }} />}
      {region && <div className="region-selection" style={{ left: region.x, top: region.y, width: region.width, height: region.height }} />}
    </div></div>
    {regionMode && <div className="region-action-bar"><span>框选要保留的图像或文字区域</span><div><button className="toolbar-button" disabled={ocrProgress !== null} onClick={() => void capture(true)}>{ocrProgress !== null ? `OCR ${ocrProgress}%` : "OCR 后加入"}</button><button className="primary-button" disabled={ocrProgress !== null} onClick={() => void capture(false)}>截图加入 Note</button></div></div>}
  </>;
}

function TextViewer({ asset, noteId, focusAnchor }: ViewerProps) {
  const { addExcerpt } = useWorkspace();
  const [text, setText] = useState(asset.textContent ?? "");
  const [selection, setSelection] = useState<{ text: string; top: number; left: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!asset.textContent) void asset.blob.text().then(setText); else setText(asset.textContent); }, [asset]);
  const html = useMemo(() => asset.kind === "markdown" ? DOMPurify.sanitize(marked.parse(text) as string) : "", [asset.kind, text]);
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
    {focusAnchor?.textQuote && <div className="text-source-callout"><ScanText size={16} /><div><strong>来源原文</strong><p>{focusAnchor.textQuote}</p></div></div>}
    {asset.kind === "markdown" ? <article className="markdown-document" onMouseUp={selectText} dangerouslySetInnerHTML={{ __html: html }} /> : asset.kind === "csv" ? <div className="csv-table-wrap"><table><tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => index === 0 ? <th key={cellIndex}>{cell}</th> : <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table>{text.split(/\r?\n/).length > 100 && <p>仅预览前 100 行，完整内容请下载原文件。</p>}</div> : <pre className="plain-document" onMouseUp={selectText}>{text}</pre>}
    {selection && <div className="selection-toolbar text-selection-toolbar" style={{ top: selection.top, left: selection.left }}><button onClick={() => void add()}>加入当前 Note</button></div>}
  </div>;
}

function VideoViewer({ asset, noteId, focusAnchor }: ViewerProps) {
  const { addExcerpt } = useWorkspace();
  const [url, setUrl] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => { const value = URL.createObjectURL(asset.blob); setUrl(value); return () => URL.revokeObjectURL(value); }, [asset.blob]);
  useEffect(() => { if (focusAnchor?.startMs !== undefined && videoRef.current) videoRef.current.currentTime = focusAnchor.startMs / 1000; }, [focusAnchor]);
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
  const { asset } = props;
  const { startReconstruction } = useWorkspace();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [starting, setStarting] = useState(false);
  const canReconstruct = ["pdf", "image", "markdown", "text"].includes(asset.kind);
  const reconstruct = async () => {
    setStarting(true);
    try { const job = await startReconstruction(asset); navigate(`/courses/${asset.courseId}/reconstruct/${job.documentId}`); }
    finally { setStarting(false); }
  };
  const KindIcon = asset.kind === "pdf" || asset.kind === "markdown" || asset.kind === "text" ? FileText : asset.kind === "image" ? FileImage : asset.kind === "video" ? Video : asset.kind === "audio" ? AudioLines : asset.kind === "csv" ? Table2 : FileArchive;
  return <div className="asset-viewer" ref={containerRef}>
    <div className="asset-viewer-header"><div className="asset-heading"><span className="asset-kind-icon"><KindIcon size={18} /></span><div><strong>{asset.name}</strong><span>{asset.demo ? "独立演示资料" : "我的原始资料"} · v{asset.version} · {(asset.size / 1024).toFixed(1)} KB</span></div></div><div className="asset-header-actions">{canReconstruct && <button className="toolbar-button reconstruct-button" onClick={() => void reconstruct()} disabled={starting}>{starting ? <LoaderCircle size={15} className="spin" /> : <ScanText size={15} />}<span>结构化重建</span><ChevronRight size={13} /></button>}<button className="icon-button" onClick={() => downloadOriginal(asset)} title="下载原件" aria-label="下载原件"><Download size={16} /></button><button className="icon-button" onClick={() => void containerRef.current?.requestFullscreen()} title="全屏查看" aria-label="全屏查看"><Expand size={16} /></button></div></div>
    <div className="asset-viewer-content">{asset.kind === "pdf" ? <PdfViewer {...props} /> : asset.kind === "image" ? <ImageViewer {...props} /> : ["markdown", "text", "csv"].includes(asset.kind) ? <TextViewer {...props} /> : asset.kind === "video" ? <VideoViewer {...props} /> : asset.kind === "audio" ? <AudioViewer asset={asset} /> : <UnsupportedViewer asset={asset} />}</div>
  </div>;
}
