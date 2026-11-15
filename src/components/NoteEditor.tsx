import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from "react";
import { ArrowDown, ArrowUp, Bold, Check, ChevronDown, Code2, FileImage, GripVertical, Heading2, Italic, List, ListOrdered, LoaderCircle, MoreHorizontal, Pilcrow, Plus, Quote, Redo2, Replace, Search, Sigma, Sparkles, Table2, Trash2, Undo2, X } from "lucide-react";
import DOMPurify from "dompurify";
import katex from "katex";
import { marked } from "marked";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { markdownToBlocks, organizeNote } from "@app/lib/ai";
import { useWorkspace } from "@app/state/WorkspaceContext";
import type { BlockType, Note, NoteBlock, OrganizeResult } from "@app/types";

const clean = (html: string) => DOMPurify.sanitize(html, { FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form"], FORBID_ATTR: ["style", "class"] });

function EditableText({ block, onChange, onEnter, onEmpty }: { block: NoteBlock; onChange: (html: string) => void; onEnter: () => void; onEmpty: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current && document.activeElement !== ref.current) ref.current.innerHTML = clean(block.text); }, [block.text, block.id]);
  const input = () => { if (ref.current) onChange(clean(ref.current.innerHTML)); };
  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !["code", "excerpt"].includes(block.type)) { event.preventDefault(); onEnter(); }
    if (event.key === "Backspace" && !(ref.current?.textContent ?? "").trim() && block.type !== "excerpt") { event.preventDefault(); onEmpty(); }
  };
  const paste = (event: ClipboardEvent<HTMLDivElement>) => { event.preventDefault(); document.execCommand("insertText", false, event.clipboardData.getData("text/plain")); };
  return <div ref={ref} className={`editable-block editable-${block.type}`} contentEditable suppressContentEditableWarning spellCheck data-placeholder={block.type === "paragraph" ? "输入想法，或从左侧资料加入摘录…" : "输入内容…"} onInput={input} onBlur={() => { if (ref.current) ref.current.innerHTML = clean(ref.current.innerHTML); }} onKeyDown={keyDown} onPaste={paste} />;
}

function MathBlock({ block, onChange }: { block: NoteBlock; onChange: (text: string) => void }) {
  const rendered = useMemo(() => {
    try { return katex.renderToString(block.text || "\\text{输入 LaTeX 公式}", { displayMode: true, throwOnError: true }); }
    catch { return ""; }
  }, [block.text]);
  return <div className="math-block"><div className="math-source"><Sigma size={15} /><input aria-label="LaTeX 公式" value={block.text} onChange={(event) => onChange(event.target.value)} placeholder="输入 LaTeX，例如 \\nabla f" /><span>LaTeX</span></div>{rendered ? <div className="math-rendered" dangerouslySetInnerHTML={{ __html: rendered }} /> : <div className="math-error">公式语法待修正 · 原字符串已保留</div>}</div>;
}

function TableBlock({ block, onChange }: { block: NoteBlock; onChange: (rows: string[][]) => void }) {
  const rows = block.rows ?? [["概念", "我的理解"], ["", ""]];
  const update = (row: number, column: number, value: string) => onChange(rows.map((cells, rowIndex) => rowIndex === row ? cells.map((cell, columnIndex) => columnIndex === column ? value : cell) : cells));
  return <div className="editor-table-wrap"><table className="editor-table"><tbody>{rows.map((cells, rowIndex) => <tr key={rowIndex}>{cells.map((cell, columnIndex) => <td key={columnIndex}><input aria-label={`表格 ${rowIndex + 1} 行 ${columnIndex + 1} 列`} className={rowIndex === 0 ? "table-heading-cell" : ""} value={cell} onChange={(event) => update(rowIndex, columnIndex, event.target.value)} /></td>)}</tr>)}</tbody></table><div className="table-actions"><button onClick={() => onChange([...rows, rows[0].map(() => "")])}>+ 添加行</button><button onClick={() => onChange(rows.map((cells) => [...cells, ""]))}>+ 添加列</button></div></div>;
}

const blockNames: Record<BlockType, string> = { heading1: "一级标题", heading2: "二级标题", heading3: "三级标题", paragraph: "正文", bullet: "项目列表", numbered: "编号列表", quote: "引用", code: "代码块", math: "公式", table: "表格", image: "图片", excerpt: "资料摘录" };

export default function NoteEditor({ note }: { note: Note }) {
  const { updateNote, saveStates, anchors, getPreference, setNoteCursor } = useWorkspace();
  const past = useRef<Note[]>([]);
  const future = useRef<Note[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [aiOpen, setAiOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<OrganizeResult | null>(null);
  const [aiError, setAiError] = useState("");
  const [insertMenu, setInsertMenu] = useState(false);
  const imageInput = useRef<HTMLInputElement>(null);
  const saveState = saveStates[note.id] ?? "saved";

  useEffect(() => { past.current = []; future.current = []; setAiResult(null); setAiError(""); }, [note.id]);

  const commit = (next: Note) => {
    past.current.push(note);
    if (past.current.length > 80) past.current.shift();
    future.current = [];
    updateNote({ ...next, version: note.version });
  };
  const patch = (value: Partial<Note>) => commit({ ...note, ...value });
  const patchBlock = (id: string, value: Partial<NoteBlock>) => patch({ blocks: note.blocks.map((block) => block.id === id ? { ...block, ...value } : block) });
  const addBlock = (type: BlockType, afterId?: string) => {
    const block: NoteBlock = { id: crypto.randomUUID(), type, text: "", rows: type === "table" ? [["标题", "内容"], ["", ""]] : undefined };
    const index = afterId ? note.blocks.findIndex((item) => item.id === afterId) + 1 : note.blocks.length;
    const blocks = [...note.blocks]; blocks.splice(index < 0 ? note.blocks.length : index, 0, block);
    patch({ blocks });
    setInsertMenu(false);
    setTimeout(() => document.querySelector<HTMLElement>(`[data-block-id="${block.id}"] .editable-block`)?.focus(), 30);
  };
  const deleteBlock = (id: string) => { if (note.blocks.length > 1) patch({ blocks: note.blocks.filter((block) => block.id !== id) }); };
  const moveBlock = (id: string, direction: -1 | 1) => {
    const index = note.blocks.findIndex((block) => block.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= note.blocks.length) return;
    const blocks = [...note.blocks]; [blocks[index], blocks[target]] = [blocks[target], blocks[index]]; patch({ blocks });
  };
  const dropBlock = (event: DragEvent, targetId: string) => {
    event.preventDefault();
    const sourceId = event.dataTransfer.getData("text/redoc-block");
    if (!sourceId || sourceId === targetId) return;
    const blocks = [...note.blocks];
    const sourceIndex = blocks.findIndex((block) => block.id === sourceId);
    const targetIndex = blocks.findIndex((block) => block.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const [moved] = blocks.splice(sourceIndex, 1);
    blocks.splice(targetIndex, 0, moved);
    patch({ blocks });
  };
  const undo = () => {
    const previous = past.current.pop();
    if (!previous) return;
    future.current.push(note);
    updateNote({ ...previous, version: note.version }, true);
  };
  const redo = () => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(note);
    updateNote({ ...next, version: note.version }, true);
  };
  const replaceAll = () => {
    if (!findText) return;
    patch({ blocks: note.blocks.map((block) => ({ ...block, text: block.text.split(findText).join(replaceText) })) });
  };
  const addImage = (file?: File) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) return;
    const reader = new FileReader();
    reader.onload = () => {
      const block: NoteBlock = { id: crypto.randomUUID(), type: "image", text: file.name, src: String(reader.result) };
      patch({ blocks: [...note.blocks, block] });
    };
    reader.readAsDataURL(file);
  };
  const runAi = async () => {
    setAiLoading(true); setAiError(""); setAiResult(null);
    try {
      if (!await getPreference("allow-cloud-ai", false)) throw new Error("云端 AI 整理已关闭，可在偏好设置中重新开启。");
      setAiResult(await organizeNote(note, anchors));
    } catch (error) { setAiError(error instanceof Error ? error.message : "AI 整理暂时不可用"); }
    finally { setAiLoading(false); }
  };
  const openAi = () => { setAiOpen(true); if (!aiResult) setAiError(""); };
  const applyAi = () => {
    if (!aiResult) return;
    const generated = markdownToBlocks(aiResult.markdown);
    patch({ blocks: [{ id: crypto.randomUUID(), type: "heading2", text: "AI 整理提纲 · 待核对" }, ...generated, { id: crypto.randomUUID(), type: "heading2", text: "原始笔记与来源摘录" }, ...note.blocks] });
    setAiOpen(false);
  };
  const format = (command: "bold" | "italic") => document.execCommand(command);
  const words = note.blocks.reduce((total, block) => total + (block.text.replace(/<[^>]+>/g, "").length), 0);

  return <div className="note-editor">
    <div className="note-editor-topbar"><div className={`save-indicator ${saveState}`}>{saveState === "saving" ? <LoaderCircle size={14} className="spin" /> : saveState === "conflict" ? <X size={14} /> : <Check size={14} />}<span>{saveState === "saving" ? "正在保存" : saveState === "conflict" ? "版本冲突" : "所有更改已保存"}</span></div><div className="note-top-actions"><button className={`toolbar-button ${searchOpen ? "selected" : ""}`} onClick={() => setSearchOpen((value) => !value)} title="查找替换"><Search size={15} /><span>查找</span></button><button className="ai-organize-button" onClick={openAi}><Sparkles size={15} />AI 整理<span>预览</span></button></div></div>
    {searchOpen && <div className="replace-toolbar"><Search size={14} /><input value={findText} onChange={(event) => setFindText(event.target.value)} placeholder="查找" /><Replace size={14} /><input value={replaceText} onChange={(event) => setReplaceText(event.target.value)} placeholder="替换为" /><button onClick={replaceAll}>全部替换</button><button className="icon-button" onClick={() => setSearchOpen(false)}><X size={14} /></button></div>}
    <div className="format-toolbar" role="toolbar" aria-label="笔记格式">
      <div className="format-group"><button className="icon-button" onClick={undo} disabled={!past.current.length} title="撤销"><Undo2 size={16} /></button><button className="icon-button" onClick={redo} disabled={!future.current.length} title="重做"><Redo2 size={16} /></button></div>
      <div className="format-group"><button className="icon-button" onMouseDown={(event) => event.preventDefault()} onClick={() => format("bold")} title="粗体"><Bold size={16} /></button><button className="icon-button" onMouseDown={(event) => event.preventDefault()} onClick={() => format("italic")} title="斜体"><Italic size={16} /></button><button className="icon-button" onClick={() => addBlock("code")} title="代码块"><Code2 size={16} /></button><button className="icon-button" onClick={() => addBlock("math")} title="公式"><Sigma size={16} /></button><button className="icon-button" onClick={() => addBlock("table")} title="表格"><Table2 size={16} /></button><button className="icon-button" onClick={() => imageInput.current?.click()} title="图片"><FileImage size={16} /></button></div>
      <input ref={imageInput} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { addImage(event.target.files?.[0]); event.target.value = ""; }} />
      <DropdownMenu open={insertMenu} onOpenChange={setInsertMenu}><DropdownMenuTrigger asChild><button className="insert-block-button"><Plus size={15} />插入块<ChevronDown size={13} /></button></DropdownMenuTrigger><DropdownMenuContent align="end">{(["heading2", "paragraph", "bullet", "numbered", "quote", "code", "math", "table"] as BlockType[]).map((type) => <DropdownMenuItem key={type} onSelect={() => addBlock(type)}>{blockNames[type]}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>
    </div>
    <div className="note-scroll"><div className="note-paper">
      <div className="note-kicker"><span>COURSE NOTE</span><i /><span>{new Date(note.updatedAt).toLocaleDateString("zh-CN", { month: "long", day: "numeric" })}</span></div>
      <textarea className="note-title-input" aria-label="笔记标题" rows={2} value={note.title} onChange={(event) => patch({ title: event.target.value })} />
      <div className="note-tags">{note.tags.map((tag) => <span key={tag}>#{tag}<button aria-label={`移除标签 ${tag}`} onClick={() => patch({ tags: note.tags.filter((item) => item !== tag) })}><X size={11} /></button></span>)}<input value={tagDraft} onChange={(event) => setTagDraft(event.target.value)} onKeyDown={(event) => { if ((event.key === "Enter" || event.key === ",") && tagDraft.trim()) { event.preventDefault(); if (!note.tags.includes(tagDraft.trim())) patch({ tags: [...note.tags, tagDraft.trim()] }); setTagDraft(""); } }} placeholder="+ 添加标签" /></div>
      <div className="note-divider"><span /></div>
      <div className="note-blocks">{note.blocks.map((block, index) => <div className={`note-block note-block-${block.type}`} data-block-id={block.id} key={block.id} onFocusCapture={() => setNoteCursor(note.id, index)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => dropBlock(event, block.id)}>
        <div className="block-grip" draggable onDragStart={(event) => { event.dataTransfer.setData("text/redoc-block", block.id); event.dataTransfer.effectAllowed = "move"; }} title="拖动排序"><GripVertical size={15} /></div>
        {block.type === "bullet" && <span className="list-marker">•</span>}{block.type === "numbered" && <span className="numbered-marker">{note.blocks.slice(0, index + 1).filter((item) => item.type === "numbered").length}.</span>}
        <div className="block-content">{block.type === "math" ? <MathBlock block={block} onChange={(text) => patchBlock(block.id, { text })} /> : block.type === "table" ? <TableBlock block={block} onChange={(rows) => patchBlock(block.id, { rows })} /> : block.type === "image" ? <div className="note-image-block">{block.src && <img src={block.src} alt={block.text} />}<EditableText block={block} onChange={(text) => patchBlock(block.id, { text })} onEnter={() => addBlock("paragraph", block.id)} onEmpty={() => deleteBlock(block.id)} /></div> : <EditableText block={block} onChange={(text) => patchBlock(block.id, { text })} onEnter={() => addBlock("paragraph", block.id)} onEmpty={() => deleteBlock(block.id)} />}</div>
        <div className="block-actions"><DropdownMenu><DropdownMenuTrigger asChild><button className="icon-button" aria-label="块操作"><MoreHorizontal size={15} /></button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => moveBlock(block.id, -1)}><ArrowUp size={14} />上移</DropdownMenuItem><DropdownMenuItem onSelect={() => moveBlock(block.id, 1)}><ArrowDown size={14} />下移</DropdownMenuItem><DropdownMenuItem onSelect={() => addBlock("paragraph", block.id)}><Plus size={14} />在下方插入</DropdownMenuItem><DropdownMenuItem variant="destructive" onSelect={() => deleteBlock(block.id)}><Trash2 size={14} />删除块</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>
      </div>)}</div>
      <button className="add-block-hint" onClick={() => addBlock("paragraph")}><Plus size={15} />添加一个内容块</button>
      <div className="note-endmark"><span>END OF NOTE</span><i /></div>
    </div></div>
    <div className="note-statusbar"><span>{words} 字符 · {note.blocks.length} 个内容块</span><span>本地自动保存 · v{note.version}</span></div>
    <Dialog open={aiOpen} onOpenChange={setAiOpen}><DialogContent className="ai-dialog"><DialogHeader><DialogTitle><Sparkles size={19} />AI 整理预览</DialogTitle><DialogDescription>只整理现有笔记，不添加无法验证的事实。确认后以新章节插入，原始内容与来源保持不变。</DialogDescription></DialogHeader>{!aiLoading && !aiResult && !aiError && <div className="ai-consent"><Sparkles size={25} /><strong>发送前确认</strong><p>继续后，当前 Note 的标题、正文和来源标签会发送给 DeepSeek；原始 PDF、图片和音视频不会上传。</p><button className="primary-button" onClick={() => void runAi()}>确认发送并生成预览</button><small>云端 AI 默认关闭，可在偏好设置中更改。</small></div>}{aiLoading && <div className="ai-loading"><LoaderCircle size={26} className="spin" /><strong>正在梳理主题与来源…</strong><span>通常需要几秒，当前笔记仍可继续编辑。</span></div>}{aiError && <div className="ai-error"><strong>这次没有生成整理稿</strong><p>{aiError}</p><button className="toolbar-button" onClick={() => void runAi()}>重新尝试</button></div>}{aiResult && <div className="ai-result"><div className="ai-result-meta"><span>{aiResult.model}</span><span>原 {note.blocks.length} 块将全部保留</span></div><h3>{aiResult.title}</h3><article className="markdown-document" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(marked.parse(aiResult.markdown) as string) }} /></div>}<DialogFooter><button className="toolbar-button" onClick={() => setAiOpen(false)}>取消</button><button className="primary-button" disabled={!aiResult || aiLoading} onClick={applyAi}><Check size={15} />确认插入整理提纲</button></DialogFooter></DialogContent></Dialog>
  </div>;
}
