import { getRecord } from "@app/lib/db";
import { correctDocument, markdownToBlocks } from "@app/lib/ai";
import type { Asset, BlockType, NoteBlock, SourceAnchor } from "@app/types";
import type { PDFPageProxy } from "pdfjs-dist";

export interface ReconstructionResult {
  blocks: NoteBlock[];
  anchors: SourceAnchor[];
}

interface PdfTextItem { str: string; hasEOL?: boolean; transform: number[]; width: number; height: number }

interface ParsedBlock {
  type: BlockType;
  text: string;
  rows?: string[][];
}

function joinLines(lines: string[]) {
  return lines.reduce((result, line) => {
    if (!result) return line;
    const chineseBoundary = /[\u3400-\u9fff]$/.test(result) && /^[\u3400-\u9fff]/.test(line);
    return `${result}${chineseBoundary ? "" : " "}${line}`;
  }, "");
}

export function parseText(text: string) {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks: ParsedBlock[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    const value = joinLines(paragraph).trim();
    if (value) blocks.push({ type: "paragraph", text: value });
    paragraph = [];
  };
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) { flush(); continue; }
    if (/^```/.test(line)) {
      flush();
      const language = line.slice(3).trim();
      const code: string[] = [];
      while (index + 1 < lines.length && !/^```/.test(lines[index + 1].trim())) code.push(lines[++index]);
      if (index + 1 < lines.length) index += 1;
      blocks.push({ type: "code", text: `${language ? `${language}\n` : ""}${code.join("\n")}` });
      continue;
    }
    if (line.includes("|") && index + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[index + 1])) {
      flush();
      const rows: string[][] = [];
      const readRow = (value: string) => value.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
      rows.push(readRow(line));
      index += 2;
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) rows.push(readRow(lines[index++]));
      index -= 1;
      blocks.push({ type: "table", text: rows[0]?.join(" ") ?? "表格", rows });
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      flush();
      blocks.push({ type: heading[1].length === 1 ? "heading1" : heading[1].length === 2 ? "heading2" : "heading3", text: heading[2].trim() });
      continue;
    }
    if ((/^\d+(\.\d+)*\s+\S/.test(line) && line.length < 90) || (/^第[一二三四五六七八九十百\d]+[章节讲篇]\s*\S*/.test(line) && line.length < 60)) {
      flush();
      blocks.push({ type: "heading2", text: line });
      continue;
    }
    const bullet = /^[-*•·]\s+(.+)$/.exec(line);
    if (bullet) { flush(); blocks.push({ type: "bullet", text: bullet[1].trim() }); continue; }
    const numbered = /^\d+[.)]\s+(.+)$/.exec(line);
    if (numbered) { flush(); blocks.push({ type: "numbered", text: numbered[1].trim() }); continue; }
    if (/^>\s?/.test(line)) { flush(); blocks.push({ type: "quote", text: line.replace(/^>\s?/, "") }); continue; }
    if ((line.startsWith("$$") && line.endsWith("$$") && line.length > 4) || (line.startsWith("\\[") && line.endsWith("\\]")) || /^\$[^$]+\$$/.test(line)) {
      flush();
      blocks.push({ type: "math", text: line.replace(/^\$\$|\$\$$|^\$|\$$/g, "").replace(/^\\\[|\\\]$/g, "").trim() });
      continue;
    }
    paragraph.push(line);
  }
  flush();
  return blocks;
}

function blocksToMarkdownString(blocks: ParsedBlock[]) {
  const lines: string[] = [];
  for (const block of blocks) {
    if (block.type === "heading1") lines.push(`# ${block.text}`, "");
    else if (block.type === "heading2") lines.push(`## ${block.text}`, "");
    else if (block.type === "heading3") lines.push(`### ${block.text}`, "");
    else if (block.type === "bullet") lines.push(`- ${block.text}`);
    else if (block.type === "numbered") lines.push(`1. ${block.text}`);
    else if (block.type === "quote") lines.push(`> ${block.text}`, "");
    else if (block.type === "code") lines.push("```", block.text, "```", "");
    else if (block.type === "math") lines.push("$$", block.text, "$$", "");
    else if (block.type === "table" && block.rows) {
      block.rows.forEach((row, index) => {
        lines.push(`| ${row.map((cell) => cell.replace(/\|/g, "\\|")).join(" | ")} |`);
        if (index === 0) lines.push(`| ${row.map(() => "---").join(" | ")} |`);
      });
      lines.push("");
    } else lines.push(block.text, "");
  }
  return lines.join("\n").replace(/\n{4,}/g, "\n\n\n");
}

export function ocrTextToBlocks(text: string) {
  return parseText(text).map((parsed): NoteBlock => ({ id: crypto.randomUUID(), type: parsed.type, text: parsed.text, rows: parsed.rows }));
}

function textBlocks(text: string, asset: Asset, page: number, anchors: SourceAnchor[]) {
  return parseText(text).map((parsed): NoteBlock => {
    const anchor: SourceAnchor = {
      id: crypto.randomUUID(), assetId: asset.id, assetVersion: asset.version, kind: "doc_block", page,
      bbox: [0.04, 0.04, 0.96, 0.96], textQuote: parsed.text, createdAt: new Date().toISOString(),
    };
    anchors.push(anchor);
    return {
      id: crypto.randomUUID(), type: parsed.type, text: parsed.text, rows: parsed.rows, sourceAnchorId: anchor.id,
      sourceSnapshot: { assetName: asset.name, label: `${asset.name} · 第 ${page} 页`, text: parsed.text },
    };
  });
}

function pdfText(items: PdfTextItem[]) {
  const lines: string[] = [];
  let current = "";
  let previous: PdfTextItem | null = null;
  const flush = () => { if (current.trim()) lines.push(current.trim()); current = ""; };
  for (const item of items) {
    const y = item.transform[5] ?? 0;
    const previousY = previous?.transform[5] ?? y;
    const verticalGap = Math.abs(y - previousY);
    if (current && previous && (previous.hasEOL || verticalGap > 2)) {
      flush();
      if (verticalGap > Math.max(18, (previous.height || 10) * 1.8)) lines.push("");
    }
    if (current && previous && verticalGap <= 2) {
      const horizontalGap = item.transform[4] - (previous.transform[4] + previous.width);
      if (horizontalGap > Math.max(2, (previous.height || 10) * 0.25) && !/\s$/.test(current) && !/^\s/.test(item.str)) current += " ";
    }
    current += item.str;
    if (item.hasEOL) flush();
    previous = item;
  }
  flush();
  return lines.join("\n");
}

async function renderPage(page: PDFPageProxy, scale: number) {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("浏览器无法创建页面画布。");
  await page.render({ canvasContext: context, viewport, canvas }).promise;
  return canvas;
}

function trimContent(canvas: HTMLCanvasElement, padding: number) {
  const context = canvas.getContext("2d");
  if (!context) return canvas.toDataURL("image/jpeg", 0.8);
  const { width, height } = canvas;
  const data = context.getImageData(0, 0, width, height).data;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      if (data[offset] < 246 || data[offset + 1] < 246 || data[offset + 2] < 246) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return canvas.toDataURL("image/jpeg", 0.8);
  const left = Math.max(0, minX - padding);
  const top = Math.max(0, minY - padding);
  const right = Math.min(width, maxX + 1 + padding);
  const bottom = Math.min(height, maxY + 1 + padding);
  const output = document.createElement("canvas");
  output.width = right - left;
  output.height = bottom - top;
  output.getContext("2d")?.drawImage(canvas, left, top, output.width, output.height, 0, 0, output.width, output.height);
  return output.toDataURL("image/jpeg", 0.8);
}

async function getOcrLanguage() {
  const language = await getRecord("preferences", "ocr-language");
  return language === "eng" ? "eng" : "chi_sim+eng";
}

async function recognizeImage(source: Blob | string, onProgress: (progress: number) => void, language: string) {
  const { recognize } = await import("tesseract.js");
  const result = await recognize(source, language, {
    logger: (message) => {
      if (message.status === "recognizing text") onProgress(Math.round(message.progress * 100));
    },
  });
  return { text: result.data.text, confidence: result.data.confidence };
}

function imageBlock(asset: Asset, page: number, src: string): NoteBlock {
  return {
    id: crypto.randomUUID(), type: "image", text: asset.kind === "image" ? "原始图片" : `第 ${page} 页`, src,
    sourceSnapshot: { assetName: asset.name, label: `${asset.name} · 第 ${page} 页`, imageDataUrl: src },
  };
}

async function correctBlocks(parsed: ParsedBlock[]) {
  try {
    const corrected = await correctDocument(blocksToMarkdownString(parsed));
    const blocks = markdownToBlocks(corrected);
    if (blocks.length) return blocks;
  } catch {
    // 校正不可用或失败时保留原始提取结果，不阻塞转换。
  }
  return null;
}

export type RegionBBox = [number, number, number, number];

function cropCanvas(canvas: HTMLCanvasElement, bbox: RegionBBox) {
  const w = canvas.width, h = canvas.height;
  const sx = Math.max(0, Math.round(bbox[0] * w));
  const sy = Math.max(0, Math.round(bbox[1] * h));
  const sw = Math.max(1, Math.min(w - sx, Math.round((bbox[2] - bbox[0]) * w)));
  const sh = Math.max(1, Math.min(h - sy, Math.round((bbox[3] - bbox[1]) * h)));
  const out = document.createElement("canvas");
  out.width = sw; out.height = sh;
  out.getContext("2d")?.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
  return out;
}

function filterItems(items: PdfTextItem[], bbox: RegionBBox, pageWidth: number, pageHeight: number) {
  return items.filter((item) => {
    const x = item.transform[4] / pageWidth;
    const yTop = 1 - (item.transform[5] + (item.height || 0)) / pageHeight;
    return x >= bbox[0] && x <= bbox[2] && yTop >= bbox[1] && yTop <= bbox[3];
  });
}

async function cropImageBlob(blob: Blob, bbox: RegionBBox) {
  const url = URL.createObjectURL(blob);
  const img = await new Promise<HTMLImageElement>((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = url; });
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
  canvas.getContext("2d")?.drawImage(img, 0, 0);
  URL.revokeObjectURL(url);
  const crop = cropCanvas(canvas, bbox);
  return new Promise<Blob>((resolve, reject) => crop.toBlob((value) => value ? resolve(value) : reject(new Error("crop_failed")), "image/png"));
}

export interface ReconstructOptions { region?: RegionBBox; ignoreHeaderFooter?: boolean }

function normalizedText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function removeRunningLines(texts: string[]) {
  const perPage = texts.map((value) => value.split("\n").map((line) => line.trim()).filter(Boolean));
  if (perPage.length < 3) return texts;
  const counts = new Map<string, number>();
  for (const lines of perPage) {
    for (const line of new Set(lines)) counts.set(line, (counts.get(line) ?? 0) + 1);
  }
  const threshold = Math.max(2, Math.round(perPage.length * 0.6));
  const running = new Set([...counts.entries()].filter(([, count]) => count >= threshold).map(([line]) => line));
  return perPage.map((lines) => lines.filter((line) => !running.has(line)).join("\n"));
}

function similarPages(a: string, b: string) {
  const x = normalizedText(a);
  const y = normalizedText(b);
  if (!x || !y) return false;
  if (x === y) return true;
  if (Math.abs(x.length - y.length) > Math.max(x.length, y.length) * 0.25) return false;
  const set = new Set(x.split(""));
  let shared = 0;
  for (const ch of y) if (set.has(ch)) shared += 1;
  return shared / Math.max(x.length, y.length) > 0.85;
}

function mergeSimilarPages(texts: string[], images: NoteBlock[]) {
  const mergedTexts: string[] = [];
  const mergedImages: NoteBlock[] = [];
  for (let index = 0; index < texts.length; index += 1) {
    if (mergedTexts.length && similarPages(texts[index], mergedTexts[mergedTexts.length - 1])) {
      mergedTexts[mergedTexts.length - 1] = texts[index];
      mergedImages[mergedImages.length - 1] = images[index];
    } else {
      mergedTexts.push(texts[index]);
      mergedImages.push(images[index]);
    }
  }
  return { text: mergedTexts.join("\n\n").trim(), images: mergedImages };
}

function dedupeHeadings(blocks: NoteBlock[]) {
  const result: NoteBlock[] = [];
  let lastHeading = "";
  for (const block of blocks) {
    if (block.type === "heading1" || block.type === "heading2" || block.type === "heading3") {
      const key = `${block.type}:${normalizedText(block.text)}`;
      if (key === lastHeading) continue;
      lastHeading = key;
    } else {
      lastHeading = "";
    }
    result.push(block);
  }
  return result;
}

export async function reconstructAsset(asset: Asset, onProgress: (progress: number) => void, options: ReconstructOptions = {}): Promise<ReconstructionResult> {
  const anchors: SourceAnchor[] = [];
  const region = options.region ?? null;
  const ignoreHeaderFooter = options.ignoreHeaderFooter !== false;
  if (asset.kind === "image") {
    onProgress(8);
    const source = region ? await cropImageBlob(asset.blob, region) : asset.blob;
    const result = await recognizeImage(source, (progress) => onProgress(Math.max(8, progress)), await getOcrLanguage());
    if (!result.text.trim()) throw new Error("未识别到文字，请尝试更清晰的图片。");
    const parsed = parseText(result.text);
    const corrected = await correctBlocks(parsed);
    onProgress(100);
    return { blocks: corrected ?? textBlocks(result.text, asset, 1, anchors), anchors };
  }
  if (asset.kind === "markdown" || asset.kind === "text") {
    const text = asset.textContent ?? await asset.blob.text();
    const parsed = parseText(text);
    if (!parsed.length) throw new Error("文件中没有可转换的文字。");
    const corrected = await correctBlocks(parsed);
    onProgress(100);
    return { blocks: corrected ?? textBlocks(text, asset, 1, anchors), anchors };
  }
  if (asset.kind !== "pdf") throw new Error("当前格式暂不支持转换，请选择 PDF、图片或文本文件。");
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?worker");
  pdfjs.GlobalWorkerOptions.workerPort = new worker.default();
  const data = await asset.blob.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data, cMapUrl: "/pdfjs/cmaps/", cMapPacked: true, standardFontDataUrl: "/pdfjs/standard_fonts/" }).promise;
  const pageImages: NoteBlock[] = [];
  const pageTexts: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const baseViewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const rawText = pdfText(content.items as PdfTextItem[]);
    const scanned = rawText.replace(/\s/g, "").length < 12;
    const canvas = await renderPage(page, scanned ? 1.6 : 1.3);
    let text = "";
    if (scanned) {
      const source = region ? cropCanvas(canvas, region).toDataURL("image/png") : canvas.toDataURL("image/png");
      const result = await recognizeImage(source, (progress) => {
        onProgress(Math.round(((pageNumber - 1 + progress / 100) / pdf.numPages) * 100));
      }, await getOcrLanguage());
      text = result.text.trim();
    } else {
      const items = region ? filterItems(content.items as PdfTextItem[], region, baseViewport.width, baseViewport.height) : content.items as PdfTextItem[];
      text = pdfText(items);
    }
    const imageDataUrl = region ? cropCanvas(canvas, region).toDataURL("image/jpeg", 0.8) : trimContent(canvas, 10);
    pageTexts.push(text.trim());
    if (imageDataUrl) pageImages.push(imageBlock(asset, pageNumber, imageDataUrl));
    onProgress(Math.round((pageNumber / pdf.numPages) * 100));
  }
  const cleanTexts = ignoreHeaderFooter ? removeRunningLines(pageTexts) : pageTexts;
  const merged = mergeSimilarPages(cleanTexts, pageImages);
  const fullText = merged.text;
  const parsed = parseText(fullText);
  if (!parsed.length) throw new Error("未发现可转换的文字，请尝试更清晰的文件。");
  onProgress(96);
  let blocks = await correctBlocks(parsed);
  if (!blocks) blocks = textBlocks(fullText, asset, 1, anchors);
  blocks = dedupeHeadings(blocks);
  if (merged.images.length) {
    blocks = [...blocks, { id: crypto.randomUUID(), type: "heading2", text: "原始页面与插图" }, ...merged.images];
  }
  onProgress(100);
  return { blocks, anchors };
}

export async function ocrImage(source: Blob | string, onProgress: (progress: number) => void) {
  return recognizeImage(source, onProgress, await getOcrLanguage());
}
