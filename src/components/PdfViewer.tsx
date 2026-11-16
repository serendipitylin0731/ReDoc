import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronLeft, ChevronRight, Clipboard, Crop, FilePlus2, LoaderCircle, Minus, Plus, ScanText, Search, X } from "lucide-react";
import { toast } from "sonner";
import * as pdfjs from "pdfjs-dist";
import PdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?worker";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useWorkspace } from "@app/state/WorkspaceContext";
import { ocrImage, ocrTextToBlocks } from "@app/lib/reconstruct";
import type { Asset, NoteBlock } from "@app/types";

pdfjs.GlobalWorkerOptions.workerPort = new PdfWorker();

type BBox = [number, number, number, number];
interface Region { x: number; y: number; width: number; height: number }
interface TextSelection { text: string; bbox: BBox; left: number; top: number }

interface PdfPageProps {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  zoom: number;
  stageWidth: number;
  query: string;
  asset: Asset;
  noteId: string;
  onNoteChange: (id: string) => void;
  regionMode: boolean;
  onExitRegion: () => void;
  onRegion: (bbox: BBox | null) => void;
  insertBlocks: (blocks: NoteBlock[]) => void;
  addScreenshot: (imageDataUrl: string, bbox: BBox) => void;
}

function PdfPage({ pdf, pageNumber, zoom, stageWidth, query, asset, noteId, onNoteChange, regionMode, onExitRegion, onRegion, insertBlocks, addScreenshot }: PdfPageProps) {
  const { addExcerpt } = useWorkspace();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const [region, setRegion] = useState<Region | null>(null);
  const [selection, setSelection] = useState<TextSelection | null>(null);
  const [ocrProgress, setOcrProgress] = useState<number | null>(null);
  const startPoint = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!pdf || !canvasRef.current || !textLayerRef.current) return;
    let cancelled = false;
    async function render() {
      const page = await pdf!.getPage(pageNumber);
      if (cancelled || !canvasRef.current || !textLayerRef.current) return;
      const baseViewport = page.getViewport({ scale: 1 });
      const availableWidth = Math.max(220, stageWidth - 40);
      const fitScale = Math.min(1.6, Math.max(0.4, availableWidth / baseViewport.width));
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
      await page.render({ canvasContext: context, viewport, canvas, transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined }).promise;
    }
    void render();
    return () => { cancelled = true; };
  }, [pdf, pageNumber, zoom, stageWidth, query]);

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
    startPoint.current = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    setRegion({ x: startPoint.current.x, y: startPoint.current.y, width: 0, height: 0 });
    setSelection(null);
  };
  const pointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!startPoint.current || !regionMode) return;
    const bounds = pageBox();
    if (!bounds) return;
    const currentX = Math.max(0, Math.min(bounds.width, event.clientX - bounds.left));
    const currentY = Math.max(0, Math.min(bounds.height, event.clientY - bounds.top));
    const next = { x: Math.min(startPoint.current.x, currentX), y: Math.min(startPoint.current.y, currentY), width: Math.abs(currentX - startPoint.current.x), height: Math.abs(currentY - startPoint.current.y) };
    setRegion(next);
    onRegion(normalizedRegion(next));
  };
  const pointerUp = () => { startPoint.current = null; };
  const resizeRef = useRef<{ corner: string; start: Region; startX: number; startY: number } | null>(null);
  const startResize = (corner: string) => (event: ReactPointerEvent<HTMLElement>) => {
    if (!region) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeRef.current = { corner, start: { ...region }, startX: event.clientX, startY: event.clientY };
  };
  const resizeMove = (event: ReactPointerEvent<HTMLElement>) => {
    const resize = resizeRef.current;
    const bounds = pageBox();
    if (!resize || !bounds) return;
    const dx = event.clientX - resize.startX;
    const dy = event.clientY - resize.startY;
    const r = resize.start;
    let next: Region;
    if (resize.corner === "se") next = { x: r.x, y: r.y, width: Math.max(10, r.width + dx), height: Math.max(10, r.height + dy) };
    else if (resize.corner === "nw") next = { x: r.x + dx, y: r.y + dy, width: Math.max(10, r.width - dx), height: Math.max(10, r.height - dy) };
    else if (resize.corner === "ne") next = { x: r.x, y: r.y + dy, width: Math.max(10, r.width + dx), height: Math.max(10, r.height - dy) };
    else next = { x: r.x + dx, y: r.y, width: Math.max(10, r.width - dx), height: Math.max(10, r.height + dy) };
    next.x = Math.max(0, Math.min(bounds.width - next.width, next.x));
    next.y = Math.max(0, Math.min(bounds.height - next.height, next.y));
    setRegion(next);
    onRegion(normalizedRegion(next));
  };
  const resizeEnd = () => { resizeRef.current = null; };
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
    const targetId = await addExcerpt({ asset, noteId, createNew, kind: "pdf_text", text: selection.text, page: pageNumber, bbox: selection.bbox });
    if (createNew) onNoteChange(targetId);
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  };
  const capture = async (withOcr: boolean) => {
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
    if (withOcr) {
      setOcrProgress(0);
      try {
        const result = await ocrImage(imageDataUrl, setOcrProgress);
        const blocks = ocrTextToBlocks(result.text);
        if (blocks.length) { insertBlocks(blocks); onNoteChange(noteId); }
        else toast.warning("未识别到文字，可重新框选或改为截图。");
      } catch {
        toast.error("OCR 未完成，请重试。");
      } finally {
        setOcrProgress(null);
        setRegion(null);
        onRegion(null);
        onExitRegion();
      }
      return;
    }
    addScreenshot(imageDataUrl, bbox);
    setRegion(null);
    onRegion(null);
    onExitRegion();
  };
  return <div className={`pdf-page ${regionMode ? "region-active" : ""}`} ref={pageRef}>
    <canvas ref={canvasRef} aria-label={`${asset.name} 第 ${pageNumber} 页`} />
    <div ref={textLayerRef} className="pdf-text-layer" onMouseUp={textSelect} />
    <div className="page-interaction-layer" style={{ pointerEvents: regionMode && !region ? "auto" : "none" }} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} />
    {regionMode && region && region.width > 8 && region.height > 8 && <>
      <div className="region-block-overlay" />
      <div className="region-selection" style={{ left: region.x, top: region.y, width: region.width, height: region.height }}>
        <span className="region-size">{Math.round(region.width)} × {Math.round(region.height)}</span>
        <i className="region-handle nw" onPointerDown={startResize("nw")} onPointerMove={resizeMove} onPointerUp={resizeEnd} onPointerCancel={resizeEnd} />
        <i className="region-handle ne" onPointerDown={startResize("ne")} onPointerMove={resizeMove} onPointerUp={resizeEnd} onPointerCancel={resizeEnd} />
        <i className="region-handle sw" onPointerDown={startResize("sw")} onPointerMove={resizeMove} onPointerUp={resizeEnd} onPointerCancel={resizeEnd} />
        <i className="region-handle se" onPointerDown={startResize("se")} onPointerMove={resizeMove} onPointerUp={resizeEnd} onPointerCancel={resizeEnd} />
        <div className="region-float-actions"><button className="toolbar-button" onClick={() => { setRegion(null); onRegion(null); }}>取消</button><button className="toolbar-button" disabled={ocrProgress !== null} onClick={() => void capture(true)}>{ocrProgress !== null ? <LoaderCircle size={14} className="spin" /> : <ScanText size={14} />}识别后加入</button><button className="primary-button" disabled={ocrProgress !== null} onClick={() => void capture(false)}><Plus size={15} />截图加入 Note</button></div>
      </div>
    </>}
    {selection && !regionMode && <div className="selection-toolbar" style={{ left: selection.left, top: selection.top }} onMouseDown={(event) => event.preventDefault()}><button onClick={() => void addText()}><FilePlus2 size={14} />加入 Note</button><button onClick={() => void addText(true)}>新建 Note</button><button onClick={() => { void navigator.clipboard.writeText(selection.text); toast.success("已复制"); }} aria-label="复制"><Clipboard size={14} /></button></div>}
  </div>;
}

export default function PdfViewer({ asset, noteId, onNoteChange, regionMode = false, onRegionModeChange, onRegion }: { asset: Asset; noteId: string; onNoteChange: (id: string) => void; regionMode?: boolean; onRegionModeChange?: (value: boolean) => void; onRegion?: (bbox: BBox | null) => void }) {
  const { addExcerpt, insertOcrBlocks } = useWorkspace();
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [stageWidth, setStageWidth] = useState(800);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef(new Map<number, HTMLDivElement>());

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
      setPageNumber(1);
      setLoading(false);
    }).catch(() => {
      if (active) { setError("PDF 无法打开，文件可能已损坏或加密。原始文件仍可下载。"); setLoading(false); }
    });
    return () => { active = false; void loadingTask?.destroy(); };
  }, [asset.id, asset.blob]);

  useEffect(() => {
    const stage = scrollRef.current;
    if (!stage) return;
    const observer = new ResizeObserver(([entry]) => setStageWidth(entry.contentRect.width));
    observer.observe(stage);
    setStageWidth(stage.clientWidth);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const stage = scrollRef.current;
    if (!stage) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      setZoom((value) => Math.max(0.5, Math.min(3, value + (event.deltaY < 0 ? 0.12 : -0.12))));
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    const stage = scrollRef.current;
    if (!stage || !pdf) return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const number = Number((entry.target as HTMLElement).dataset.pageNumber);
          if (number) setPageNumber(number);
        }
      }
    }, { root: stage, threshold: 0.4 });
    pageRefs.current.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [pdf, pageCount]);

  const search = async () => {
    if (!pdf || !query.trim()) return;
    for (let offset = 0; offset < pdf.numPages; offset += 1) {
      const number = ((pageNumber - 1 + offset) % pdf.numPages) + 1;
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      const found = content.items.some((item) => "str" in item && item.str.toLowerCase().includes(query.trim().toLowerCase()));
      if (found) {
        setPageNumber(number);
        pageRefs.current.get(number)?.scrollIntoView({ behavior: "smooth", block: "start" });
        toast.success(`已在第 ${number} 页标出匹配内容`);
        return;
      }
    }
    toast.info("这份 PDF 中没有找到匹配文本");
  };

  const insertBlocks = (blocks: NoteBlock[]) => insertOcrBlocks(noteId, blocks);
  const addScreenshot = (imageDataUrl: string, bbox: BBox) => {
    void addExcerpt({ asset, noteId, kind: "page_region", page: pageNumber, bbox, imageDataUrl }).then((id) => onNoteChange(id));
  };

  return <div className="pdf-viewer">
    <div className="viewer-controls">
      <div className="page-controls"><button className="icon-button" disabled={pageNumber <= 1} onClick={() => pageRefs.current.get(pageNumber - 1)?.scrollIntoView({ behavior: "smooth" })} aria-label="上一页"><ChevronLeft size={17} /></button><label><input aria-label="当前页码" value={pageNumber} onChange={(event) => { const value = Number(event.target.value); if (value >= 1 && value <= pageCount) pageRefs.current.get(value)?.scrollIntoView({ behavior: "smooth" }); }} /> <span>/ {pageCount || "–"}</span></label><button className="icon-button" disabled={!pageCount || pageNumber >= pageCount} onClick={() => pageRefs.current.get(pageNumber + 1)?.scrollIntoView({ behavior: "smooth" })} aria-label="下一页"><ChevronRight size={17} /></button></div>
      <div className="viewer-control-group"><button className={`icon-button ${searchOpen ? "selected" : ""}`} onClick={() => setSearchOpen((value) => !value)} aria-label="搜索 PDF"><Search size={16} /></button></div>
      <div className="zoom-controls"><button className="icon-button" onClick={() => setZoom((value) => Math.max(.6, value - .15))} aria-label="缩小"><Minus size={16} /></button><button onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button><button className="icon-button" onClick={() => setZoom((value) => Math.min(2.2, value + .15))} aria-label="放大"><Plus size={16} /></button></div>
    </div>
    {searchOpen && <div className="pdf-search-bar"><Search size={15} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void search(); }} placeholder="在这份 PDF 中查找…" /><button onClick={() => void search()}>查找</button><button className="icon-button" onClick={() => { setSearchOpen(false); setQuery(""); }} aria-label="关闭搜索"><X size={15} /></button></div>}
    <div className={`pdf-stage continuous-pdf-stage ${regionMode ? "region-active" : ""}`} ref={scrollRef}>
      {loading && <div className="viewer-loading"><LoaderCircle className="spin" size={24} /><span>正在准备 PDF 与文字层…</span></div>}
      {error && <div className="viewer-error"><ScanText size={32} /><strong>暂时无法预览</strong><p>{error}</p></div>}
      {!loading && !error && pdf && <div className="pdf-pages">{Array.from({ length: pageCount }, (_, index) => index + 1).map((number) => <div className="pdf-page-wrap" key={number} data-page-number={number} ref={(element) => { if (element) pageRefs.current.set(number, element); else pageRefs.current.delete(number); }}><span className="pdf-page-number">第 {number} 页</span><PdfPage pdf={pdf} pageNumber={number} zoom={zoom} stageWidth={stageWidth} query={query} asset={asset} noteId={noteId} onNoteChange={onNoteChange} regionMode={regionMode} onExitRegion={() => onRegionModeChange?.(false)} onRegion={onRegion ?? (() => undefined)} insertBlocks={insertBlocks} addScreenshot={addScreenshot} /></div>)}</div>}
    </div>
  </div>;
}
