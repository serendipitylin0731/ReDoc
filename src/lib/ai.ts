import { blocksToMarkdown } from "@app/lib/export";
import type { Note, OrganizeResult, SourceAnchor } from "@app/types";

export async function organizeNote(note: Note, anchors: SourceAnchor[], signal?: AbortSignal): Promise<OrganizeResult> {
  const response = await fetch("/functions/v1/app/api/organize", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: note.title, markdown: blocksToMarkdown(note, anchors, true) }),
    signal,
  });
  const result = await response.json().catch(() => null) as { title?: unknown; markdown?: unknown; model?: unknown; error?: unknown } | null;
  if (!response.ok) {
    if (result?.error === "service_not_configured") throw new Error("线上 AI 服务尚未配置密钥，其他编辑与导出功能不受影响。");
    if (response.status === 429) throw new Error("请求较多，请稍后再试。");
    throw new Error("AI 整理暂时不可用，请检查网络后重试。");
  }
  if (!result || typeof result.title !== "string" || typeof result.markdown !== "string" || typeof result.model !== "string") throw new Error("AI 返回内容不完整，请重试。");
  return { title: result.title, markdown: result.markdown, model: result.model };
}

export function markdownToBlocks(markdown: string) {
  return markdown.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean).map((part) => {
    const id = crypto.randomUUID();
    if (part.startsWith("### ")) return { id, type: "heading3" as const, text: part.replace(/^###\s+/, "") };
    if (part.startsWith("## ")) return { id, type: "heading2" as const, text: part.replace(/^##\s+/, "") };
    if (part.startsWith("# ")) return { id, type: "heading1" as const, text: part.replace(/^#\s+/, "") };
    if (part.startsWith("$$")) return { id, type: "math" as const, text: part.replace(/^\$\$|\$\$$/g, "").trim() };
    if (part.startsWith("```")) return { id, type: "code" as const, text: part.replace(/^```[^\n]*\n?|```$/g, "").trim() };
    if (part.startsWith("> ")) return { id, type: "quote" as const, text: part.replace(/^>\s?/gm, "") };
    const lines = part.split("\n");
    if (lines.every((line) => /^[-*]\s+/.test(line))) return lines.map((line) => ({ id: crypto.randomUUID(), type: "bullet" as const, text: line.replace(/^[-*]\s+/, "") }));
    if (lines.every((line) => /^\d+[.)]\s+/.test(line))) return lines.map((line) => ({ id: crypto.randomUUID(), type: "numbered" as const, text: line.replace(/^\d+[.)]\s+/, "") }));
    return { id, type: "paragraph" as const, text: part.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>") };
  }).flat();
}

