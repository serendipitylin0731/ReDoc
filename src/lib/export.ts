import DOMPurify from "dompurify";
import { Document, HeadingLevel, ImageRun, Packer, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import JSZip from "jszip";
import type { Asset, Note, NoteBlock, SourceAnchor } from "@app/types";

function plain(html: string) {
  const element = window.document.createElement("div");
  element.innerHTML = DOMPurify.sanitize(html);
  return (element.textContent ?? "").trim();
}

function safeName(name: string) {
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, "-").slice(0, 100) || "ReDoc-note";
}

function anchorFor(block: NoteBlock, anchors: SourceAnchor[]) {
  return anchors.find((anchor) => anchor.id === block.sourceAnchorId);
}

function imageMime(dataUrl: string) {
  return /^data:image\/jpeg[;,]/.test(dataUrl) ? "image/jpeg" : /^data:image\/webp[;,]/.test(dataUrl) ? "image/webp" : "image/png";
}

function imageExtension(dataUrl: string) {
  const mime = imageMime(dataUrl);
  return mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : "png";
}

export function blocksToMarkdown(note: Note, anchors: SourceAnchor[], includeSources = true) {
  const lines = [`# ${note.title}`, ""];
  let numbered = 0;
  for (const block of note.blocks) {
    const text = plain(block.text);
    if (block.type !== "numbered") numbered = 0;
    switch (block.type) {
      case "heading1": lines.push(`# ${text}`, ""); break;
      case "heading2": lines.push(`## ${text}`, ""); break;
      case "heading3": lines.push(`### ${text}`, ""); break;
      case "bullet": lines.push(`- ${text}`); break;
      case "numbered": numbered += 1; lines.push(`${numbered}. ${text}`); break;
      case "quote": lines.push(`> ${text}`, ""); break;
      case "code": lines.push("```", block.text, "```", ""); break;
      case "math": lines.push("$$", block.text, "$$", ""); break;
      case "table": {
        const rows = block.rows ?? [];
        rows.forEach((row, index) => {
          lines.push(`| ${row.map((cell) => cell.replace(/\|/g, "\\|")).join(" | ")} |`);
          if (index === 0) lines.push(`| ${row.map(() => "---").join(" | ")} |`);
        });
        lines.push("");
        break;
      }
      case "image": if (block.src) lines.push(`![${text || "资料截图"}](assets/${block.id}.${imageExtension(block.src)})`, ""); break;
      case "excerpt": {
        if (block.src) lines.push(`![${text || "资料区域截图"}](assets/${block.id}.${imageExtension(block.src)})`, "");
        if (text) lines.push(`> ${text.split("\n").join("\n> ")}`, "");
        if (includeSources && block.sourceSnapshot) lines.push(`> — 来源：${block.sourceSnapshot.label}`, "");
        break;
      }
      default: if (text) lines.push(text, "");
    }
    if (block.type === "bullet") lines.push("");
    if (includeSources && block.type !== "excerpt" && block.sourceAnchorId) {
      const anchor = anchorFor(block, anchors);
      if (anchor) lines.push(`> 来源：${block.sourceSnapshot?.label ?? "原始资料"}`, "");
    }
  }
  if (note.tags.length) lines.push("---", `标签：${note.tags.map((tag) => `#${tag}`).join(" ")}`, "");
  return lines.join("\n").replace(/\n{4,}/g, "\n\n\n");
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportMarkdown(note: Note, anchors: SourceAnchor[], includeSources: boolean) {
  const filename = safeName(note.title);
  const images = note.blocks.filter((block) => block.src);
  if (!images.length) {
    saveBlob(new Blob([blocksToMarkdown(note, anchors, includeSources)], { type: "text/markdown;charset=utf-8" }), `${filename}.md`);
    return;
  }
  const zip = new JSZip();
  zip.file(`${filename}.md`, blocksToMarkdown(note, anchors, includeSources));
  const assets = zip.folder("assets");
  for (const block of images) {
    if (block.src && assets) assets.file(`${block.id}.${imageExtension(block.src)}`, block.src.split(",")[1], { base64: true });
  }
  saveBlob(await zip.generateAsync({ type: "blob" }), `${filename}-with-assets.zip`);
}

function richRuns(html: string) {
  const doc = new DOMParser().parseFromString(DOMPurify.sanitize(html), "text/html");
  const runs: TextRun[] = [];
  const visit = (node: Node, style: { bold?: boolean; italics?: boolean; code?: boolean } = {}) => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent) runs.push(new TextRun({ text: node.textContent, bold: style.bold, italics: style.italics, font: style.code ? "Consolas" : undefined }));
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    if (node.tagName === "BR") { runs.push(new TextRun({ break: 1 })); return; }
    for (const child of node.childNodes) visit(child, {
      bold: style.bold || node.tagName === "STRONG" || node.tagName === "B",
      italics: style.italics || node.tagName === "EM" || node.tagName === "I",
      code: style.code || node.tagName === "CODE",
    });
  };
  visit(doc.body);
  return runs.length ? runs : [new TextRun("")];
}

function dataUrlBytes(dataUrl: string) {
  const binary = atob(dataUrl.split(",")[1]);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function loadImage(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("image_decode_failed"));
    image.src = dataUrl;
  });
}

async function imageSize(dataUrl: string): Promise<{ width: number; height: number }> {
  const image = await loadImage(dataUrl);
  const width = Math.min(560, image.naturalWidth);
  return { width, height: Math.round(width * image.naturalHeight / image.naturalWidth) };
}

async function docxImage(dataUrl: string) {
  if (imageMime(dataUrl) === "image/webp") {
    const image = await loadImage(dataUrl);
    const canvas = window.document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("webp_conversion_failed");
    context.drawImage(image, 0, 0);
    return { type: "png" as const, data: dataUrlBytes(canvas.toDataURL("image/png")) };
  }
  return { type: imageMime(dataUrl) === "image/jpeg" ? "jpg" as const : "png" as const, data: dataUrlBytes(dataUrl) };
}

export async function buildDocxBlob(note: Pick<Note, "title" | "blocks">): Promise<Blob> {
  const children: (Paragraph | Table)[] = [new Paragraph({ text: note.title, heading: HeadingLevel.TITLE }), new Paragraph({ children: [new TextRun({ text: `导出自 ReDoc · ${new Date().toLocaleString("zh-CN")}`, color: "7A8178", size: 18 })] })];
  let listIndex = 0;
  for (const block of note.blocks) {
    if (block.type !== "numbered") listIndex = 0;
    if (["heading1", "heading2", "heading3"].includes(block.type)) {
      children.push(new Paragraph({ children: richRuns(block.text), heading: block.type === "heading1" ? HeadingLevel.HEADING_1 : block.type === "heading2" ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3, spacing: { before: 260, after: 120 } }));
    } else if (["paragraph", "excerpt", "quote"].includes(block.type) && plain(block.text)) {
      children.push(new Paragraph({ children: richRuns(block.text), indent: block.type === "quote" || block.type === "excerpt" ? { left: 280 } : undefined, spacing: { after: 140 }, border: block.type === "quote" || block.type === "excerpt" ? { left: { color: "6D8B70", size: 10, style: "single", space: 8 } } : undefined }));
    } else if (block.type === "bullet" || block.type === "numbered") {
      listIndex += 1;
      children.push(new Paragraph({ children: block.type === "numbered" ? [new TextRun({ text: `${listIndex}. ` }), ...richRuns(block.text)] : richRuns(block.text), bullet: block.type === "bullet" ? { level: 0 } : undefined, spacing: { after: 80 } }));
    } else if (block.type === "math" || block.type === "code") {
      children.push(new Paragraph({ children: [new TextRun({ text: block.type === "math" ? `$$ ${block.text} $$` : block.text, font: "Consolas", size: 21 })], shading: { type: ShadingType.CLEAR, fill: "F2F3ED" }, spacing: { before: 100, after: 160 } }));
    } else if (block.type === "table" && block.rows?.length) {
      children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: block.rows.map((row, rowIndex) => new TableRow({ children: row.map((cell) => new TableCell({ shading: rowIndex === 0 ? { type: ShadingType.CLEAR, fill: "E7EBDD" } : undefined, children: [new Paragraph({ text: cell })] })) })) }));
    }
    if (block.src) {
      try {
        const image = await docxImage(block.src);
        children.push(new Paragraph({ children: [new ImageRun({ type: image.type, data: image.data, transformation: await imageSize(block.src) })], spacing: { after: 100 } }));
      } catch {
        children.push(new Paragraph({ text: `[图片无法嵌入：${block.id}]` }));
      }
    }
  }
  const doc = new Document({ creator: "ReDoc", title: note.title, description: "课程笔记", sections: [{ properties: {}, children }] });
  const blob = await Packer.toBlob(doc);
  if (blob.size < 1000) throw new Error("Word 文件生成失败");
  return blob;
}

export async function exportDocx(note: Note, includeSources: boolean) {
  void includeSources;
  saveBlob(await buildDocxBlob(note), `${safeName(note.title)}.docx`);
}

export function downloadOriginal(asset: Asset) {
  saveBlob(asset.blob, asset.name);
}
