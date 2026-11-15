import katex from "katex";
import katexCss from "katex/dist/katex.min.css?raw";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { blocksToMarkdown } from "@app/lib/export";
import type { Note } from "@app/types";

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function inlineMarkdown(html: string) {
  return html
    .replace(/<strong>([\s\S]*?)<\/strong>/g, "<strong>$1</strong>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

export function noteToPrintHtml(note: Note): string {
  const parts: string[] = [];
  let listOpen = "";
  let numbered = 0;
  const closeList = () => { if (listOpen) { parts.push(`</${listOpen}>`); listOpen = ""; } };
  for (const block of note.blocks) {
    if (block.type !== "numbered") numbered = 0;
    if (block.type === "heading1") { closeList(); parts.push(`<h1>${inlineMarkdown(escapeHtml(block.text))}</h1>`); }
    else if (block.type === "heading2") { closeList(); parts.push(`<h2>${inlineMarkdown(escapeHtml(block.text))}</h2>`); }
    else if (block.type === "heading3") { closeList(); parts.push(`<h3>${inlineMarkdown(escapeHtml(block.text))}</h3>`); }
    else if (block.type === "quote") { closeList(); parts.push(`<blockquote>${escapeHtml(block.text)}</blockquote>`); }
    else if (block.type === "code") { closeList(); parts.push(`<pre><code>${escapeHtml(block.text)}</code></pre>`); }
    else if (block.type === "math") {
      closeList();
      try { parts.push(`<div class="math">${katex.renderToString(block.text, { displayMode: true, throwOnError: false })}</div>`); }
      catch { parts.push(`<pre>${escapeHtml(block.text)}</pre>`); }
    }
    else if (block.type === "table" && block.rows) {
      closeList();
      parts.push("<table>" + block.rows.map((row, r) => `<tr>${row.map((cell) => (r === 0 ? `<th>${escapeHtml(cell)}</th>` : `<td>${escapeHtml(cell)}</td>`)).join("")}</tr>`).join("") + "</table>");
    }
    else if (block.type === "image" && block.src) { closeList(); parts.push(`<figure><img src="${block.src}" alt="${escapeHtml(block.text || "")}" /><figcaption>${escapeHtml(block.text || "")}</figcaption></figure>`); }
    else if (block.type === "bullet") {
      if (listOpen !== "ul") { closeList(); parts.push("<ul>"); listOpen = "ul"; }
      parts.push(`<li>${inlineMarkdown(escapeHtml(block.text))}</li>`);
    }
    else if (block.type === "numbered") {
      numbered += 1;
      if (listOpen !== "ol") { closeList(); parts.push("<ol>"); listOpen = "ol"; }
      parts.push(`<li>${inlineMarkdown(escapeHtml(block.text))}</li>`);
    }
    else { closeList(); parts.push(`<p>${inlineMarkdown(escapeHtml(block.text))}</p>`); }
  }
  closeList();
  const body = parts.join("\n");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8" /><title>${escapeHtml(note.title)}</title>
<style>${katexCss}</style>
<style>
  @page { margin: 22mm 20mm; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 0; color: #1f2937; font-family: "PingFang SC", "Microsoft YaHei", "Songti SC", system-ui, sans-serif; font-size: 14px; line-height: 1.85; }
  h1, h2, h3 { color: #172033; line-height: 1.4; }
  h1 { font-size: 26px; margin: 0 0 18px; }
  h2 { font-size: 20px; margin: 26px 0 10px; padding-bottom: 6px; border-bottom: 1px solid #e5e7eb; }
  h3 { font-size: 17px; margin: 20px 0 8px; }
  p { margin: 0 0 12px; }
  blockquote { margin: 14px 0; padding: 8px 16px; border-left: 3px solid #93b4f8; background: #f8faff; color: #526075; }
  pre { margin: 14px 0; padding: 14px; border-radius: 6px; background: #0f172a; color: #e2e8f0; white-space: pre-wrap; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: .9em; }
  table { width: 100%; border-collapse: collapse; margin: 14px 0; }
  th, td { border: 1px solid #dce3ec; padding: 8px 10px; text-align: left; }
  th { background: #f1f5f9; }
  .math { margin: 16px 0; text-align: center; overflow-x: auto; }
  figure { margin: 16px 0; }
  figure img { display: block; max-width: 100%; height: auto; }
  figcaption { margin-top: 6px; color: #94a3b8; font-size: 12px; text-align: center; }
</style></head><body>${body}</body></html>`;
}

export function noteToMarkdown(note: Note) {
  return blocksToMarkdown(note, [], false);
}

export function renderMarkdownHtml(markdown: string) {
  return DOMPurify.sanitize(marked.parse(markdown) as string);
}

export function openPrintWindow(html: string, title: string) {
  const win = window.open("", "_blank", "noopener,noreferrer,width=900,height=1200");
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.document.title = title;
  const print = () => { try { win.focus(); win.print(); } catch { /* ignore */ } };
  win.addEventListener("load", () => setTimeout(print, 250));
  setTimeout(print, 500);
}
