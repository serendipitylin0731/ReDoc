import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowDown, ArrowLeft, ArrowUp, Check, CheckCircle2, Code2, Eye, FileText, Link2, LoaderCircle, Save, ScanText } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import AssetViewer from "@app/components/AssetViewer";
import ExportMenu from "@app/components/ExportMenu";
import { blocksToMarkdown } from "@app/lib/export";
import { useWorkspace } from "@app/state/WorkspaceContext";
import type { NoteBlock, ReconstructionDocument, SourceAnchor } from "@app/types";

export default function ReconstructPage() {
  const { courseId = "", documentId = "" } = useParams();
  const { documents, assets, notes, jobs, anchors, saveDocument, resolveAnchor } = useWorkspace();
  const stored = documents.find((document) => document.id === documentId);
  const asset = assets.find((item) => item.id === stored?.assetId);
  const job = jobs.find((item) => item.documentId === stored?.id) ?? jobs.filter((item) => item.assetId === stored?.assetId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const [draft, setDraft] = useState<ReconstructionDocument | null>(stored ?? null);
  const [dirty, setDirty] = useState(false);
  const [activeBlock, setActiveBlock] = useState("");
  const [focusAnchor, setFocusAnchor] = useState<SourceAnchor | null>(null);
  const [sourceMode, setSourceMode] = useState(false);
  const [sourceText, setSourceText] = useState("");
  const editRevision = useRef(0);
  const navigate = useNavigate();
  useEffect(() => { if (stored && !dirty) setDraft(stored); }, [stored, dirty]);
  useEffect(() => {
    if (!dirty || !draft) return;
    const revision = editRevision.current;
    const timer = setTimeout(() => {
      void saveDocument(draft).then(() => {
        if (editRevision.current === revision) setDirty(false);
      }).catch(() => toast.error("校对稿保存失败，请检查浏览器存储空间。"));
    }, 1000);
    return () => clearTimeout(timer);
  }, [draft, dirty, saveDocument]);
  const exportNote = useMemo(() => ({
    id: draft?.id ?? "reconstruction", courseId, folderId: null, title: `${asset?.name.replace(/\.[^.]+$/, "") ?? "重建文档"} · 校对稿`, blocks: draft?.blocks ?? [], tags: ["结构化重建"], favorite: false, version: 1, createdAt: draft?.updatedAt ?? new Date().toISOString(), updatedAt: draft?.updatedAt ?? new Date().toISOString(),
  }), [draft, asset, courseId]);
  if (!stored || !asset) return <div className="large-empty-state"><ScanText size={30} /><h3>重建文档不可用</h3><p>原始资料可能已被移出，既有 Note 不受影响。</p><button className="primary-button" onClick={() => navigate(`/courses/${courseId}/workspace`)}>返回工作台</button></div>;
  const currentDraft = draft ?? stored;
  const update = (blocks: NoteBlock[]) => { editRevision.current += 1; setDraft({ ...currentDraft, blocks }); setDirty(true); };
  const patchBlock = (id: string, patch: Partial<NoteBlock>) => update(currentDraft.blocks.map((block) => block.id === id ? { ...block, ...patch } : block));
  const locate = async (block: NoteBlock) => {
    setActiveBlock(block.id);
    if (!block.sourceAnchorId) return;
    const resolved = await resolveAnchor(block.sourceAnchorId);
    if (resolved?.anchor) setFocusAnchor(resolved.anchor);
  };
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= currentDraft.blocks.length) return;
    const blocks = [...currentDraft.blocks]; [blocks[index], blocks[target]] = [blocks[target], blocks[index]]; update(blocks);
  };
  const switchMode = () => {
    if (!sourceMode) setSourceText(blocksToMarkdown(exportNote, anchors, false));
    setSourceMode((value) => !value);
  };
  const save = async () => {
    const revision = editRevision.current;
    await saveDocument(currentDraft);
    if (editRevision.current === revision) setDirty(false);
    toast.success("校对稿已保存，原始资料未修改");
  };
  return <div className="reconstruct-page"><header className="reconstruct-header"><div><button className="back-link" onClick={() => navigate(`/courses/${courseId}/workspace?file=${asset.id}`)}><ArrowLeft size={15} />返回工作台</button><span className="eyebrow">SOURCE-ALIGNED RECONSTRUCTION</span><h1>原文 / 重建稿对照</h1></div><div className="reconstruct-header-actions"><span className={`revision-status ${dirty ? "dirty" : ""}`}>{dirty ? <LoaderCircle size={14} className="spin" /> : <Check size={14} />}{dirty ? "正在自动保存修订" : "修订稿已保存"}</span><button className="toolbar-button" onClick={switchMode}>{sourceMode ? <Eye size={15} /> : <Code2 size={15} />}{sourceMode ? "可视化编辑" : "Markdown 预览"}</button><button className="toolbar-button" onClick={() => void save()}><Save size={15} />保存</button><ExportMenu note={exportNote} compact /></div></header>{currentDraft.status === "processing" && <div className="reconstruct-progress"><LoaderCircle size={19} className="spin" /><div><strong>正在识别原始资料…</strong><span>数字文本直接提取，扫描页在本地 OCR。你可以离开此页，在任务中心查看进度。</span></div><span>{job?.progress ?? 0}%</span><i style={{ width: `${job?.progress ?? 0}%` }} /></div>}{currentDraft.status === "failed" && <div className="reconstruct-failed"><AlertCircle size={18} /><span>{job?.errorMessage ?? "识别未完成，请前往任务中心重试。"}</span><button onClick={() => navigate("/jobs")}>查看任务</button></div>}<div className="reconstruct-columns"><section className="reconstruct-original"><div className="reconstruct-column-heading"><span><ScanText size={16} />原始资料</span><small>点击右侧内容块定位来源区域</small></div><AssetViewer asset={asset} noteId={notes.find((note) => note.courseId === courseId)?.id ?? ""} onNoteChange={() => undefined} focusAnchor={focusAnchor} /></section><section className="reconstruct-editor"><div className="reconstruct-column-heading"><span><FileText size={16} />结构化校对稿 <i>{currentDraft.blocks.length} 块</i></span><small>低置信度内容需人工确认</small></div>{sourceMode ? <div className="reconstruction-source-panel"><p>只读预览 · JSON 校对稿与来源锚点保持为唯一权威状态，请使用可视化编辑修订。</p><textarea className="reconstruction-source" aria-label="Markdown 只读预览" value={sourceText} readOnly spellCheck={false} /></div> : <div className="reconstruction-blocks">{currentDraft.blocks.map((block, index) => <article className={`reconstruction-block ${activeBlock === block.id ? "active" : ""} ${block.reviewStatus === "needs_review" ? "needs-review" : ""}`} key={block.id} onClick={() => void locate(block)}><div className="reconstruction-block-tools"><select aria-label="块类型" value={block.type} onChange={(event) => patchBlock(block.id, { type: event.target.value as NoteBlock["type"] })}><option value="heading2">标题</option><option value="paragraph">正文</option><option value="bullet">列表</option><option value="math">公式</option><option value="quote">引用</option><option value="code">代码</option></select><span>{block.confidence !== undefined ? `${Math.round(block.confidence)}% 置信度` : "数字文本"}</span><button title="上移" disabled={index === 0} onClick={(event) => { event.stopPropagation(); move(index, -1); }}><ArrowUp size={13} /></button><button title="下移" disabled={index === currentDraft.blocks.length - 1} onClick={(event) => { event.stopPropagation(); move(index, 1); }}><ArrowDown size={13} /></button></div><textarea value={block.text} aria-label={`重建块 ${index + 1}`} rows={Math.max(2, Math.ceil(block.text.length / 60))} onFocus={() => void locate(block)} onChange={(event) => patchBlock(block.id, { text: event.target.value, reviewStatus: "unreviewed" })} /><div className="reconstruction-block-footer"><button className="block-source-link" onClick={(event) => { event.stopPropagation(); void locate(block); }}><Link2 size={12} />{block.sourceSnapshot?.label ?? "来源待核对"}</button><button className={`review-button ${block.reviewStatus === "confirmed" ? "confirmed" : ""}`} onClick={(event) => { event.stopPropagation(); patchBlock(block.id, { reviewStatus: block.reviewStatus === "confirmed" ? "unreviewed" : "confirmed" }); }}>{block.reviewStatus === "confirmed" ? <CheckCircle2 size={13} /> : <Check size={13} />}{block.reviewStatus === "confirmed" ? "已确认" : "确认内容"}</button></div></article>)}{!currentDraft.blocks.length && currentDraft.status === "ready" && <div className="large-empty-state"><FileText size={26} /><p>没有生成内容块，请重试或使用手动摘录。</p></div>}</div>}</section></div></div>;
}
