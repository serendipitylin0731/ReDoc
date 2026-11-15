import katex from "katex";
import { marked } from "marked";
import DOMPurify from "dompurify";

marked.setOptions({ gfm: true, breaks: true });

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderMath(markdown: string): string {
  const math: string[] = [];
  let index = 0;
  const withPlaceholders = markdown.replace(/\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g, (match, block, inline) => {
    const source = (block ?? inline ?? "").trim();
    let html: string;
    try { html = katex.renderToString(source, { displayMode: Boolean(block), throwOnError: false }); }
    catch { html = escapeHtml(match); }
    math.push(html);
    return `@@KATEX${index++}@@`;
  });
  const parsed = marked.parse(withPlaceholders) as string;
  return parsed.replace(/@@KATEX(\d+)@@/g, (_match, id) => math[Number(id)] ?? "");
}

export function renderMarkdownHtml(markdown: string, resolveImage?: (src: string) => string): string {
  let html = renderMath(markdown);
  html = DOMPurify.sanitize(html);
  if (resolveImage) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    doc.querySelectorAll("img").forEach((img) => {
      const src = img.getAttribute("src");
      if (src) {
        const resolved = resolveImage(src);
        if (resolved) img.setAttribute("src", resolved);
      }
    });
    html = doc.body.innerHTML;
  }
  return html;
}
