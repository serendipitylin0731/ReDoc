import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Check, ChevronLeft, ChevronRight, Clipboard, Crop, FilePlus2, Highlighter, LoaderCircle, Minus, Plus, ScanText, Search, X } from "lucide-react";
import { toast } from "sonner";
import * as pdfjs from "pdfjs-dist";
import PdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?worker";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useWorkspace } from "@app/state/WorkspaceContext";
import { ocrImage } from "@app/lib/reconstruct";
import type { Asset, SourceAnchor } from "@app/types";

pdfjs.GlobalWorkerOptions.workerPort = new PdfWorker();

type BBox = [number, number, number, number];
interface Region { x: number; y: number; width: number; height: number }
interface TextSelection { text: string; bbox: BBox; left: number; top: number }

export default function PdfViewer({ asset, noteId, onNoteChange, focusAnchor }: { asset: Asset; noteId: string; onNoteChange: (id: string) => void; focusAnchor?: SourceAnchor | null }) {
  const { addExcerpt } = useWorkspace();
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [regionMode, setRegionMode] = useState(false);
  const [region, setRegion] = useState<Region | null>(null);
  const [selection, setSelection] = useState<TextSelection | null>(null);
  const [highlight, setHighlight] = useState<BBox | null>(focusAnchor?.bbox ?? null);
  const [ocrProgress, setOcrProgress] = useState<number | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageWidth, setStageWidth] = useState(0);
  const renderTask = useRef<{ cancel: () => void } | null>(null);
  const startPoint = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    let active = true;
    let loadingTask: pdfjs.PDFDocumentLoadingTask | undefined;
    setLoading(true);
    setError("");
    setPdf(null);
    void asset.blob.arrayBuffer().then((data) => {
      loadingTask = pdfjs.getDocument({ data, cMapUrl: "/pdfjs/cmaps/", cMapPacked: true, standardFontDataUrl: "/pdfjs/standard_fonts/" });
      return loadingTask.promise;
    }).then((loaded) => {
      if (!active) return;
      setPdf(loaded);
      setPageCount(loaded.numPages);
      setPageNumber(focusAnchor?.page ?? 1);
      setLoading(false);
    }).catch(() => {
      if (active) { setError("PDF 无法打开，文件可能已损坏或加密。原始文件仍可下载。"); setLoading(false); }
    });
    return () => { active = false; void loadingTask?.destroy(); };
  }, [asset.id, asset.blob]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver(([entry]) => setStageWidth(entry.contentRect.width));
    observer.observe(stage);
    setStageWidth(stage.clientWidth);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (focusAnchor?.assetId !== asset.id) return;
    if (focusAnchor.page) setPageNumber(focusAnchor.page);
    setHighlight(focusAnchor.bbox ?? null);
  }, [focusAnchor, asset.id]);

  useEffect(() => {
    if (!pdf || !canvasRef.current || !textLayerRef.current) return;
    let cancelled = false;
    async function render() {
      const page = await pdf!.getPage(pageNumber);
      if (cancelled || !canvasRef.current || !textLayerRef.current) return;
      const baseViewport = page.getViewport({ scale: 1 });
      const availableWidth = Math.max(260, (stageWidth || stageRef.current?.clientWidth || 800) - 50);
      const fitScale = Math.min(1.35, Math.max(0.4, availableWidth / baseViewport.width));
      const viewport = page.getViewport({ scale: fitScale * zoom });
      const outputScale = Math.min(window.devicePixelRatio || 1, 2);
      const canvas = canvasRef.current;
      const context = canvas.getContext("2d");
      if (!context) return;
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      canvas.style.aspectRatio = `${viewport.width} / ${viewport.height}`;
      const textContent = await page.getTextContent();
      if (cancelled || !textLayerRef.current) return;
      const textLayer = textLayerRef.current;
      textLayer.innerHTML = "";
      textLayer.style.setProperty("--scale-factor", String(viewport.scale));
      for (const item of textContent.items) {
        if (!("str" in item) || !item.str) continue;
        const transform = pdfjs.Util.transform(viewport.transform, item.transform);
        const fontHeight = Math.hypot(transform[2], transform[3]);
        const span = document.createElement("span");
        span.textContent = item.str;
        span.style.left = `${transform[4]}px`;
        span.style.top = `${transform[5] - fontHeight}px`;
        span.style.fontSize = `${fontHeight}px`;
        if (query && item.str.toLowerCase().includes(query.toLowerCase())) span.className = "pdf-search-match";
        textLayer.appendChild(span);
        if ("width" in item && span.offsetWidth > 0) {
          const targetWidth = item.width * viewport.scale;
          if (targetWidth > 0) { span.style.transform = `scaleX(${targetWidth / span.offsetWidth})`; span.style.transformOrigin = "left top"; }
        }
      }
      const task = page.render({ canvasContext: context, viewport, canvas, transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined });
      renderTask.current = task;
      await task.promise;
    }
    void render().catch((renderError: unknown) => {
      if (!cancelled && !(renderError instanceof Error && renderError.name === "RenderingCancelledException")) setError("这一页渲染失败，请尝试其他页面或下载原件。");
    });
    return () => { cancelled = true; renderTask.current?.cancel(); };
  }, [pdf, pageNumber, zoom, query, stageWidth]);

  const pageBox = () => pageRef.current?.getBoundingClientRect();
  const normalizedRegion = (value: Region): BBox => {
    const bounds = pageBox();
    if (!bounds) return [0, 0, 1, 1];
    return [value.x / bounds.width, value.y / bounds.height, (value.x + value.width) / bounds.width, (value.y + value.height) / bounds.height];
  };

  const pointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!regionMode) return;
    const bounds = pageBox();
    if (!bounds) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    startPoint.current = { x, y };
    setRegion({ x, y, width: 0, height: 0 });
    setSelection(null);
  };
  const pointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!startPoint.current || !regionMode) return;
    const bounds = pageBox();
    if (!bounds) return;
    const currentX = Math.max(0, Math.min(bounds.width, event.clientX - bounds.left));
    const currentY = Math.max(0, Math.min(bounds.height, event.clientY - bounds.top));
    setRegion({ x: Math.min(startPoint.current.x, currentX), y: Math.min(startPoint.current.y, currentY), width: Math.abs(currentX - startPoint.current.x), height: Math.abs(currentY - startPoint.current.y) });
  };
  const pointerUp = () => { startPoint.current = null; };

  const textSelect = () => {
    if (regionMode) return;
    const selected = window.getSelection();
    const text = selected?.toString().trim() ?? "";
    if (!selected || !text || !selected.rangeCount || !textLayerRef.current?.contains(selected.anchorNode)) { setSelection(null); return; }
    const rect = selected.getRangeAt(0).getBoundingClientRect();
    const bounds = pageBox();
    if (!bounds) return;
    setSelection({
      text,
      bbox: [(rect.left - bounds.left) / bounds.width, (rect.top - bounds.top) / bounds.height, (rect.right - bounds.left) / bounds.width, (rect.bottom - bounds.top) / bounds.height],
      left: Math.max(10, Math.min(bounds.width - 250, rect.left - bounds.left)),
      top: Math.max(8, rect.top - bounds.top - 48),
    });
  };

  const addText = async (createNew = false) => {
    if (!selection) return;
    const note = await addExcerpt({ asset, noteId, createNew, kind: "pdf_text", text: selection.text, page: pageNumber, bbox: selection.bbox });
    if (createNew) onNoteChange(note);
    setHighlight(selection.bbox);
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  };

  const capture = async (withOcr = false) => {
    if (!region || !canvasRef.current || region.width < 5 || region.height < 5) { toast.info("请先在页面上框选一个区域"); return; }
    const canvas = canvasRef.current;
    const bounds = pageBox();
    if (!bounds) return;
    const scaleX = canvas.width / bounds.width;
    const scaleY = canvas.height / bounds.height;
    const output = document.createElement("canvas");
    output.width = Math.max(1, Math.round(region.width * scaleX));
    output.height = Math.max(1, Math.round(region.height * scaleY));
    const context = output.getContext("2d");
    if (!context) return;
    context.drawImage(canvas, region.x * scaleX, region.y * scaleY, output.width, output.height, 0, 0, output.width, output.height);
    const imageDataUrl = output.toDataURL("image/png");
    const bbox = normalizedRegion(region);
    let text: string | undefined;
    if (withOcr) {
      setOcrProgress(0);
      try {
        const result = await ocrImage(imageDataUrl, setOcrProgress);
        text = result.text.trim();
        if (!text) toast.warning("未识别到文字，已保留清晰截图，可手动补充。");
      } catch {
        toast.error("OCR 未完成，已将原图加入 Note，可稍后手动修订。");
      } finally {
        setOcrProgress(null);
      }
    }
    const note = await addExcerpt({ asset, noteId, kind: "page_region", page: pageNumber, bbox, imageDataUrl, text });
    onNoteChange(note);
    setHighlight(bbox);
    setRegion(null);
    setRegionMode(false);
  };

  const search = async () => {
    if (!pdf || !query.trim()) return;
    for (let offset = 0; offset < pdf.numPages; offset += 1) {
      const number = ((pageNumber - 1 + offset) % pdf.numPages) + 1;
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      const found = content.items.some((item) => "str" in item && item.str.toLowerCase().includes(query.trim().toLowerCase()));
      if (found) { setPageNumber(number); toast.success(`已在第 ${number} 页标出匹配内容`); return; }
    }
    toast.info("这份 PDF 中没有找到匹配文本");
  };

  return <div className="pdf-viewer">
    <div className="viewer-controls">
      <div className="page-controls"><button className="icon-button" disabled={pageNumber <= 1} onClick={() => setPageNumber((page) => Math.max(1, page - 1))} aria-label="上一页"><ChevronLeft size={17} /></button><label><input aria-label="当前页码" value={pageNumber} onChange={(event) => { const value = Number(event.target.value); if (value >= 1 && value <= pageCount) setPageNumber(value); }} /> <span>/ {pageCount || "–"}</span></label><button className="icon-button" disabled={!pageCount || pageNumber >= pageCount} onClick={() => setPageNumber((page) => Math.min(pageCount, page + 1))} aria-label="下一页"><ChevronRight size={17} /></button></div>
      <div className="viewer-control-group"><button className={`toolbar-button ${regionMode ? "selected" : ""}`} onClick={() => { setRegionMode((value) => !value); setRegion(null); setSelection(null); }}><Crop size={15} />{regionMode ? "退出框选" : "框选摘录"}</button><button className={`icon-button ${searchOpen ? "selected" : ""}`} onClick={() => setSearchOpen((value) => !value)} aria-label="搜索 PDF"><Search size={16} /></button></div>
      <div className="zoom-controls"><button className="icon-button" onClick={() => setZoom((value) => Math.max(.6, value - .15))} aria-label="缩小"><Minus size={16} /></button><button onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button><button className="icon-button" onClick={() => setZoom((value) => Math.min(2.2, value + .15))} aria-label="放大"><Plus size={16} /></button></div>
    </div>
    {searchOpen && <div className="pdf-search-bar"><Search size={15} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void search(); }} placeholder="在这份 PDF 中查找…" /><button onClick={() => void search()}>查找</button><button className="icon-button" onClick={() => { setSearchOpen(false); setQuery(""); }} aria-label="关闭搜索"><X size={15} /></button></div>}
    <div className={`pdf-stage ${regionMode ? "region-active" : ""}`} ref={stageRef}>
      {loading && <div className="viewer-loading"><LoaderCircle className="spin" size={24} /><span>正在准备 PDF 与文字层…</span></div>}
      {error && <div className="viewer-error"><ScanText size={32} /><strong>暂时无法预览</strong><p>{error}</p></div>}
      {!loading && !error && <div className="pdf-page" ref={pageRef} style={{ aspectRatio: canvasRef.current?.style.aspectRatio }}>
        <canvas ref={canvasRef} aria-label={`${asset.name} 第 ${pageNumber} 页`} />
        <div ref={textLayerRef} className="pdf-text-layer" onMouseUp={textSelect} />
        {highlight && <div className="source-highlight" style={{ left: `${highlight[0] * 100}%`, top: `${highlight[1] * 100}%`, width: `${(highlight[2] - highlight[0]) * 100}%`, height: `${(highlight[3] - highlight[1]) * 100}%` }}><span><Check size={12} />来源位置</span></div>}
        <div className="page-interaction-layer" style={{ pointerEvents: regionMode ? "auto" : "none" }} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} />
        {region && regionMode && <div className="region-selection" style={{ left: region.x, top: region.y, width: region.width, height: region.height }}>{region.width > 20 && region.height > 20 && <div className="region-size">{Math.round(region.width)} × {Math.round(region.height)}</div>}</div>}
        {selection && !regionMode && <div className="selection-toolbar" style={{ left: selection.left, top: selection.top }} onMouseDown={(event) => event.preventDefault()}><button onClick={() => void addText()}><FilePlus2 size={14} />加入 Note</button><button onClick={() => void addText(true)}>新建 Note</button><button onClick={() => { void navigator.clipboard.writeText(selection.text); toast.success("已复制"); }} aria-label="复制"><Clipboard size={14} /></button><button onClick={() => { setHighlight(selection.bbox); setSelection(null); toast.success("已高亮本页位置"); }} aria-label="高亮"><Highlighter size={14} /></button></div>}
      </div>}
    </div>
    {regionMode && <div className="region-action-bar"><span><Crop size={16} />{region?.width ? "已选择区域，加入后可点击来源回跳" : "在页面上拖动，框选公式、图表或段落"}</span><div><button className="toolbar-button" onClick={() => { setRegion(null); setRegionMode(false); }}>取消</button><button className="toolbar-button" disabled={ocrProgress !== null} onClick={() => void capture(true)}>{ocrProgress !== null ? <><LoaderCircle size={14} className="spin" />OCR {ocrProgress}%</> : <><ScanText size={14} />OCR 后加入</>}</button><button className="primary-button" disabled={ocrProgress !== null} onClick={() => void capture(false)}><Plus size={15} />截图加入 Note</button></div></div>}
  </div>;
}
