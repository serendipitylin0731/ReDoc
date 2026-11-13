interface OrganizePayload {
  title?: unknown;
  markdown?: unknown;
}

function response(body: object, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

function parseResult(content: string) {
  const cleaned = content.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  const parsed = JSON.parse(cleaned) as { title?: unknown; markdown?: unknown };
  if (typeof parsed.title !== "string" || typeof parsed.markdown !== "string" || !parsed.markdown.trim()) throw new Error("invalid_model_result");
  return { title: parsed.title.slice(0, 120), markdown: parsed.markdown.slice(0, 24000) };
}

export async function handler(request: Request, apiKey = Deno.env.get("DEEPSEEK_API")): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (request.method === "GET" && path.endsWith("/health")) return response({ ok: true });
  if (!path.endsWith("/api/organize")) return response({ ok: false, error: "not_found" }, 404);
  if (request.method !== "POST") return response({ ok: false, error: "method_not_allowed" }, 405);
  if (!apiKey) return response({ ok: false, error: "service_not_configured" }, 503);
  let payload: OrganizePayload;
  try {
    payload = await request.json() as OrganizePayload;
  } catch {
    return response({ ok: false, error: "invalid_json" }, 400);
  }
  if (typeof payload.title !== "string" || typeof payload.markdown !== "string" || !payload.markdown.trim() || payload.title.length > 160 || payload.markdown.length > 30000) {
    return response({ ok: false, error: "invalid_note" }, 400);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const upstream = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "deepseek-chat",
        temperature: 0.2,
        max_tokens: 1800,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "你是 ReDoc 的学习笔记整理助手。只能重组和概括用户提供的笔记，不得补充资料中没有的事实、公式、数值或引用。保留所有公式 LaTeX 与“来源：”标记，不得编造来源。输出一个适合复习的中文提纲：按主题组织，保留关键概念和自测问题，合并重复表达，使用二级或三级标题、短段落和列表。所有不确定内容明确写“待核对”。只输出 JSON，格式为 {\"title\":\"简短标题\",\"markdown\":\"整理后的 Markdown\"}，markdown 不要包含一级标题。",
          },
          { role: "user", content: `笔记标题：${payload.title}\n\n原始笔记：\n${payload.markdown}` },
        ],
      }),
      signal: controller.signal,
    });
    if (!upstream.ok) {
      if (upstream.status === 429) return response({ ok: false, error: "rate_limited" }, 429);
      return response({ ok: false, error: "upstream_unavailable" }, 502);
    }
    const data = await upstream.json() as { choices?: { message?: { content?: unknown } }[]; model?: unknown };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string") return response({ ok: false, error: "invalid_model_result" }, 502);
    const result = parseResult(content);
    return response({ ok: true, ...result, model: typeof data.model === "string" ? data.model : "deepseek-chat" });
  } catch (error) {
    if (error instanceof Error && error.message === "invalid_model_result") return response({ ok: false, error: "invalid_model_result" }, 502);
    return response({ ok: false, error: "upstream_timeout" }, 504);
  } finally {
    clearTimeout(timeout);
  }
}
