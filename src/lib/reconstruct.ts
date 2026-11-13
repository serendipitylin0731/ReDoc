import type { Asset, NoteBlock, SourceAnchor } from "@app/types";

export interface ReconstructionResult {
  blocks: NoteBlock[];
  anchors: SourceAnchor[];
}

function textBlocks(text: string, asset: Asset, page: number, anchors: SourceAnchor[], confidence?: number) {
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  return lines.map((line, index): NoteBlock => {
    const anchor: SourceAnchor = {
      id: crypto.randomUUID(),
      assetId: asset.id,
      assetVersion: asset.version,
      kind: "doc_block",
      page,
      bbox: [0.04, 0.04, 0.96, 0.96],
      textQuote: line,
      createdAt: new Date().toISOString(),
    };
    anchors.push(anchor);
    const isMath = /[=∂∇∑∫]/.test(line) && line.length < 180;
    const isHeading = (index === 0 && line.length < 60) || (/^\d+(\.\d+)*\s+/.test(line) && line.length < 80);
    return {
      id: crypto.randomUUID(),
      type: isMath ? "math" : isHeading ? "heading2" : "paragraph",
      text: line,
      sourceAnchorId: anchor.id,
      sourceSnapshot: { assetName: asset.name, label: `${asset.name} · 第 ${page} 页`, text: line },
      confidence,
      reviewStatus: confidence !== undefined && confidence < 75 ? "needs_review" : "unreviewed",
    };
  });
}

async function recognizeImage(source: Blob | string, onProgress: (progress: number) => void) {
  const { recognize } = await import("tesseract.js");
  const result = await recognize(source, "chi_sim+eng", {
    logger: (message) => {
      if (message.status === "recognizing text") onProgress(Math.round(message.progress * 100));
    },
  });
  return { text: result.data.text, confidence: result.data.confidence };
}

export async function reconstructAsset(asset: Asset, onProgress: (progress: number) => void): Promise<ReconstructionResult> {
  const anchors: SourceAnchor[] = [];
  if (asset.kind === "image") {
    onProgress(8);
    const result = await recognizeImage(asset.blob, (progress) => onProgress(Math.max(8, progress)));
    if (!result.text.trim()) throw new Error("未识别到文字，请尝试更清晰的图片或改用手动框选。");
    return { blocks: textBlocks(result.text, asset, 1, anchors, result.confidence), anchors };
  }
  if (asset.kind === "markdown" || asset.kind === "text") {
    const text = asset.textContent ?? await asset.blob.text();
    return { blocks: textBlocks(text, asset, 1, anchors, 100), anchors };
  }
  if (asset.kind !== "pdf") throw new Error("当前格式暂不支持结构化重建，可通过手动摘录保留内容。");
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?worker");
  pdfjs.GlobalWorkerOptions.workerPort = new worker.default();
  const data = await asset.blob.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data }).promise;
  const blocks: NoteBlock[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items.map((item) => ("str" in item ? item.str : "")).join("\n");
    if (text.replace(/\s/g, "").length >= 12) {
      blocks.push(...textBlocks(text, asset, pageNumber, anchors, 100));
    } else {
      const viewport = page.getViewport({ scale: 1.6 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("浏览器无法创建 OCR 画布。");
      await page.render({ canvasContext: context, viewport, canvas }).promise;
      const result = await recognizeImage(canvas.toDataURL("image/png"), (progress) => {
        onProgress(Math.round(((pageNumber - 1 + progress / 100) / pdf.numPages) * 100));
      });
      blocks.push(...textBlocks(result.text, asset, pageNumber, anchors, result.confidence));
    }
    onProgress(Math.round((pageNumber / pdf.numPages) * 100));
  }
  if (!blocks.length) throw new Error("未发现可重建的文本，请使用区域截图保留原始内容。");
  return { blocks, anchors };
}

export async function ocrImage(source: Blob | string, onProgress: (progress: number) => void) {
  return recognizeImage(source, onProgress);
}
