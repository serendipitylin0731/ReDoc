import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import JSZip from "jszip";
import DOMPurify from "dompurify";
import { handler } from "../functions/handler.ts";
import { detectAssetKind, formatTime, sourceLabel } from "../src/lib/db.ts";
import { blocksToMarkdown, exportDocx, exportMarkdown } from "../src/lib/export.ts";

if (typeof DOMPurify.sanitize !== "function") DOMPurify.sanitize = (value) => value;

const originalFetch = globalThis.fetch;
const request = (body = { title: "梯度复习", markdown: "公式与来源" }) => new Request("https://example.com/functions/v1/app/api/organize", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("asset detection uses MIME and extensions without changing source data", () => {
  assert.equal(detectAssetKind(new Blob([""], { type: "application/pdf" }), "lecture.bin"), "pdf");
  assert.equal(detectAssetKind(new Blob([""]), "board.JPEG"), "image");
  assert.equal(detectAssetKind(new Blob([""]), "slides.pptx"), "office");
  assert.equal(detectAssetKind(new Blob([""]), "notes.markdown"), "markdown");
  assert.equal(detectAssetKind(new Blob([""]), "archive.exe"), "unsupported");
});

test("source labels preserve page and media time context", () => {
  assert.equal(sourceLabel({ kind: "pdf_text", page: 12 }, "讲义.pdf"), "讲义.pdf · 第 12 页");
  assert.equal(sourceLabel({ kind: "video_segment", startMs: 65000, endMs: 73000 }, "录课.mp4"), "录课.mp4 · 01:05–01:13");
  assert.equal(formatTime(60000), "01:00");
});

test("health, routing and request validation fail explicitly", async () => {
  const health = await handler(new Request("https://example.com/functions/v1/app/health"), "configured-secret");
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ok: true, aiConfigured: true });
  assert.equal((await handler(new Request("https://example.com/functions/v1/app/health"), "")).status, 200);
  assert.equal((await handler(new Request("https://example.com/functions/v1/app/missing"), "")).status, 404);
  assert.equal((await handler(new Request("https://example.com/functions/v1/app/api/organize"), "key")).status, 405);
  assert.equal((await handler(request(), "")).status, 503);
  const invalidJson = await handler(new Request("https://example.com/functions/v1/app/api/organize", { method: "POST", body: "{" }), "key");
  assert.equal(invalidJson.status, 400);
  assert.equal((await invalidJson.json()).error, "invalid_json");
  assert.equal((await handler(request({ title: "x", markdown: "" }), "key")).status, 400);
});

test("organize proxy preserves formulas and source markers in model result", async () => {
  let upstreamPayload;
  globalThis.fetch = async (_url, options) => {
    upstreamPayload = JSON.parse(options.body);
    return Response.json({
      model: "deepseek-chat",
      choices: [{ message: { content: JSON.stringify({ title: "梯度复习", markdown: "## 核心公式\n\n$$\n\\nabla f\n$$\n\n> 来源：讲义.pdf · 第 2 页" }) } }],
    });
  };
  const result = await handler(request(), "test-secret");
  assert.equal(result.status, 200);
  const body = await result.json();
  assert.match(body.markdown, /\\nabla f/);
  assert.match(body.markdown, /来源：讲义\.pdf · 第 2 页/);
  assert.equal(upstreamPayload.model, "deepseek-chat");
  assert.equal(upstreamPayload.response_format.type, "json_object");
  assert.match(upstreamPayload.messages[0].content, /不得补充资料中没有的事实/);
  assert.match(upstreamPayload.messages[0].content, /保留所有公式 LaTeX 与“来源：”标记/);
});

test("upstream rate limits and malformed model JSON are not misreported as timeouts", async () => {
  globalThis.fetch = async () => new Response(null, { status: 429 });
  assert.equal((await handler(request(), "key")).status, 429);
  globalThis.fetch = async () => Response.json({ choices: [{ message: { content: "not-json" } }] });
  const malformed = await handler(request(), "key");
  assert.equal(malformed.status, 502);
  assert.equal((await malformed.json()).error, "invalid_model_result");
  globalThis.fetch = async () => { throw new DOMException("aborted", "AbortError"); };
  assert.equal((await handler(request(), "key")).status, 504);
});

test("organize endpoint rejects cross-origin posts and applies a per-client quota", async () => {
  const crossOrigin = await handler(new Request("https://example.com/functions/v1/app/api/organize", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://attacker.invalid" },
    body: JSON.stringify({ title: "x", markdown: "content" }),
  }), "key");
  assert.equal(crossOrigin.status, 403);
  globalThis.fetch = async () => Response.json({ choices: [{ message: { content: JSON.stringify({ title: "x", markdown: "ok" }) } }] });
  for (let count = 0; count < 12; count += 1) {
    const quotaRequest = request();
    quotaRequest.headers.set("x-forwarded-for", "203.0.113.10");
    assert.equal((await handler(quotaRequest, "key")).status, 200);
  }
  const limited = await handler(new Request("https://example.com/functions/v1/app/api/organize", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.10" },
    body: JSON.stringify({ title: "x", markdown: "content" }),
  }), "key");
  assert.equal(limited.status, 429);
  assert.equal((await limited.json()).error, "rate_limited");
});

test("Markdown export keeps structure, sources and original image formats", async () => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousCreateObjectURL = URL.createObjectURL;
  const previousRevokeObjectURL = URL.revokeObjectURL;
  let downloaded;
  globalThis.window = {
    document: {
      createElement: () => ({
        _html: "",
        textContent: "",
        set innerHTML(value) { this._html = value; this.textContent = value.replace(/<[^>]+>/g, ""); },
        get innerHTML() { return this._html; },
      }),
    },
  };
  globalThis.document = { createElement: () => ({ click() {}, set href(_) {}, set download(_) {} }) };
  URL.createObjectURL = (blob) => { downloaded = blob; return "blob:markdown-test"; };
  URL.revokeObjectURL = () => {};
  try {
    const note = {
      id: "note-1", title: "梯度与方向导数", tags: ["第三章"], blocks: [
        { id: "h", type: "heading2", text: "核心概念" },
        { id: "m", type: "math", text: "\\nabla f=(f_x,f_y)" },
        { id: "e", type: "excerpt", text: "梯度指向增长最快的方向", sourceAnchorId: "a", sourceSnapshot: { assetName: "讲义.pdf", label: "讲义.pdf · 第 2 页" } },
        { id: "jpeg", type: "image", text: "板书", src: "data:image/jpeg;base64,/9j/2Q==" },
      ],
    };
    const markdown = blocksToMarkdown(note, [{ id: "a" }], true);
    assert.match(markdown, /^# 梯度与方向导数/);
    assert.match(markdown, /## 核心概念/);
    assert.match(markdown, /\$\$\n\\nabla f=\(f_x,f_y\)\n\$\$/);
    assert.match(markdown, /> — 来源：讲义\.pdf · 第 2 页/);
    assert.match(markdown, /assets\/jpeg\.jpg/);
    assert.doesNotMatch(blocksToMarkdown(note, [{ id: "a" }], false), /来源：/);
    await exportMarkdown(note, [{ id: "a" }], true);
    const zip = await JSZip.loadAsync(await downloaded.arrayBuffer());
    assert.equal(await zip.file("assets/jpeg.jpg").async("base64"), "/9j/2Q==");
    assert.ok(!zip.file("assets/jpeg.png"));
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    URL.createObjectURL = previousCreateObjectURL;
    URL.revokeObjectURL = previousRevokeObjectURL;
  }
});

test("DOCX export creates a readable Office package with editable structure", async () => {
  const previous = { window: globalThis.window, document: globalThis.document, DOMParser: globalThis.DOMParser, HTMLElement: globalThis.HTMLElement, Node: globalThis.Node, Image: globalThis.Image, createObjectURL: URL.createObjectURL, revokeObjectURL: URL.revokeObjectURL };
  let downloaded;
  class MockHTMLElement {
    constructor(tagName = "BODY") { this.tagName = tagName; this.childNodes = []; }
  }
  globalThis.HTMLElement = MockHTMLElement;
  globalThis.Node = { TEXT_NODE: 3 };
  globalThis.Image = class { naturalWidth = 320; naturalHeight = 200; set src(_) { this.onload?.(); } };
  globalThis.DOMParser = class {
    parseFromString(html) {
      const body = new MockHTMLElement();
      body.childNodes = [{ nodeType: 3, textContent: html.replace(/<[^>]+>/g, "") }];
      return { body };
    }
  };
  globalThis.window = {
    document: {
      createElement: () => ({
        textContent: "",
        set innerHTML(value) { this.textContent = value.replace(/<[^>]+>/g, ""); },
      }),
    },
  };
  globalThis.document = { createElement: () => ({ click() {}, set href(_) {}, set download(_) {} }) };
  URL.createObjectURL = (blob) => { downloaded = blob; return "blob:docx-test"; };
  URL.revokeObjectURL = () => {};
  try {
    await exportDocx({
      id: "note-1", title: "梯度复习", tags: [], blocks: [
        { id: "h", type: "heading2", text: "核心概念" },
        { id: "p", type: "paragraph", text: "梯度指向增长最快的方向" },
        { id: "n", type: "numbered", text: "第一条" },
        { id: "t", type: "table", text: "", rows: [["概念", "说明"], ["梯度", "偏导数向量"]] },
        { id: "jpeg", type: "image", text: "板书", src: "data:image/jpeg;base64,/9j/2Q==" },
      ],
    }, true);
    assert.ok(downloaded instanceof Blob);
    assert.ok(downloaded.size > 1000);
    const zip = await JSZip.loadAsync(await downloaded.arrayBuffer());
    const xml = await zip.file("word/document.xml").async("string");
    assert.match(xml, /梯度复习/);
    assert.match(xml, /核心概念/);
    assert.match(xml, /偏导数向量/);
    const text = xml.replace(/<[^>]+>/g, "");
    assert.equal(text.match(/第一条/g)?.length, 1);
    assert.ok(!text.includes("1. 第一条第一条"));
    assert.ok(Object.keys(zip.files).some((name) => name.startsWith("word/media/") && name.endsWith(".jpg")));
    assert.ok(zip.file("[Content_Types].xml"));
  } finally {
    for (const key of ["window", "document", "DOMParser", "HTMLElement", "Node", "Image"]) {
      if (previous[key] === undefined) delete globalThis[key];
      else globalThis[key] = previous[key];
    }
    URL.createObjectURL = previous.createObjectURL;
    URL.revokeObjectURL = previous.revokeObjectURL;
  }
});
