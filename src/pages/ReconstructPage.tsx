import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowLeft, Download, FileText, LoaderCircle, RefreshCw, ScanText } from "lucide-react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import AssetViewer from "@app/components/AssetViewer";
import DocumentPreview from "@app/components/DocumentPreview";
import { exportDocx, exportMarkdown } from "@app/lib/export";
import { useWorkspace } from "@app/state/WorkspaceContext";

export default function ReconstructPage() {
  const { courseId = "", documentId } = useParams();
  const { documents, assets, jobs, startReconstruction } = useWorkspace();
  const [searchParams] = useSearchParams();
  const [format, setFormat] = useState<"markdown" | "docx">("docx");
  const [downloadAfter, setDownloadAfter] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const navigate = useNavigate();
  const courseAssets = assets.filter((asset) => asset.courseId === courseId && ["pdf", "image", "markdown", "text"].includes(asset.kind));
  const requestedDocument = documents.find((document) => document.id === documentId);
  const asset = assets.find((item) => item.id === requestedDocument?.assetId) ?? courseAssets.find((item) => item.id === searchParams.get("file")) ?? courseAssets[0];
  const currentDocument = requestedDocument ?? documents.filter((document) => document.assetId === asset?.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const job = jobs.find((item) => item.documentId === currentDocument?.id) ?? jobs.filter((item) => item.assetId === asset?.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const exportNote = useMemo(() => ({
    id: currentDocument?.id ?? "conversion", courseId, folderId: null, title: `${asset?.name.replace(/\.[^.]+$/, "") ?? "转换文档"} · 文字版`, blocks: currentDocument?.blocks ?? [], tags: [], favorite: false, version: 1, createdAt: currentDocument?.updatedAt ?? new Date().toISOString(), updatedAt: currentDocument?.updatedAt ?? new Date().toISOString(),
  }), [currentDocument, asset, courseId]);

  const download = useCallback(async () => {
    if (currentDocument?.status !== "ready") return;
    setDownloading(true);
    try {
      if (format === "markdown") await exportMarkdown(exportNote, [], false);
      else await exportDocx(exportNote, false);
      toast.success(format === "markdown" && exportNote.blocks.some((block) => block.src) ? "Markdown 与图片已打包下载" : "文档已下载到本地");
    } catch {
      toast.error("下载失败，请重试。");
    } finally {
      setDownloading(false);
    }
  }, [currentDocument?.status, exportNote, format]);

  useEffect(() => {
    if (downloadAfter && currentDocument?.status === "ready") {
      setDownloadAfter(false);
      void download();
    }
    if (downloadAfter && currentDocument?.status === "failed") setDownloadAfter(false);
  }, [currentDocument?.status, download, downloadAfter]);

  const convert = async (withDownload: boolean) => {
    if (!asset) return;
    setDownloadAfter(withDownload);
    try {
      const created = await startReconstruction(asset);
      navigate(`/courses/${courseId}/convert/${created.documentId}?file=${asset.id}`);
    } catch {
      setDownloadAfter(false);
      toast.error("无法启动转换，请重试。");
    }
  };
  const selectAsset = (id: string) => {
    setDownloadAfter(false);
    navigate(`/courses/${courseId}/convert?file=${id}`);
  };
  const processing = currentDocument?.status === "processing";
  return <div className="reconstruct-page conversion-page"><header className="reconstruct-header"><div><button className="back-link" onClick={() => navigate(`/courses/${courseId}`)}><ArrowLeft size={15} />返回课程</button><span className="eyebrow">DOCUMENT CONVERTER</span><h1>图片 / PDF 转文字</h1></div><div className="reconstruct-header-actions"><label className="conversion-asset-select"><ScanText size={15} /><select aria-label="选择要转换的资料" value={asset?.id ?? ""} onChange={(event) => selectAsset(event.target.value)}>{courseAssets.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><select className="conversion-format-select" aria-label="下载格式" value={format} onChange={(event) => setFormat(event.target.value as "markdown" | "docx")}><option value="docx">Word (.docx)</option><option value="markdown">Markdown{currentDocument?.blocks.some((block) => block.src) ? " (.zip)" : " (.md)"}</option></select>{currentDocument?.status === "ready" && <button className="toolbar-button" onClick={() => void convert(false)} disabled={processing}><RefreshCw size={15} />重新转换</button>}<button className="primary-button" disabled={!asset || processing || downloading} onClick={() => currentDocument?.status === "ready" ? void download() : void convert(true)}>{processing || downloading ? <LoaderCircle size={15} className="spin" /> : <Download size={15} />}{processing ? "正在转换" : downloading ? "正在生成下载" : currentDocument?.status === "ready" ? `下载 ${format === "docx" ? "Word" : "Markdown"}` : "转换并下载"}</button></div></header>
    {processing && <div className="reconstruct-progress"><LoaderCircle size={19} className="spin" /><div><strong>正在生成文字文档…</strong><span>文字层直接提取，图片和扫描页进行中英文 OCR，同时保留原始页面。</span></div><span>{job?.progress ?? 0}%</span><i style={{ width: `${job?.progress ?? 0}%` }} /></div>}
    {currentDocument?.status === "failed" && <div className="reconstruct-failed"><AlertCircle size={18} /><span>{job?.errorMessage ?? "转换未完成，请重试。"}</span><button onClick={() => void convert(false)}>重新转换</button></div>}
    <div className="reconstruct-columns"><section className="reconstruct-original"><div className="reconstruct-column-heading"><span><ScanText size={16} />原始文件</span><small>{asset?.name ?? "尚未选择文件"}</small></div>{asset ? <AssetViewer asset={asset} noteId="" onNoteChange={() => undefined} showConvert={false} /> : <div className="large-empty-state"><ScanText size={28} /><p>请先在课程中导入 PDF、图片或文本文件。</p></div>}</section><section className="reconstruct-editor"><div className="reconstruct-column-heading"><span><FileText size={16} />文字文档</span><small>{currentDocument?.status === "ready" ? "原页图像与可编辑文字一并保留" : "转换后可下载到本地"}</small></div><div className="conversion-document-scroll">{currentDocument?.status === "ready" ? <DocumentPreview blocks={currentDocument.blocks} /> : documentId && !requestedDocument ? <div className="large-empty-state"><FileText size={28} /><h3>本次转换结果已结束</h3><p>转换文档只保留在当前会话中，请重新转换并下载。</p><button className="primary-button" onClick={() => void convert(true)} disabled={!asset}>重新转换</button></div> : <div className="large-empty-state"><FileText size={28} /><h3>{processing ? "正在生成文档" : "准备转换"}</h3><p>{processing ? "完成后会在这里显示整篇文档。" : "选择资料与格式，点击“转换并下载”。"}</p></div>}</div></section></div>
  </div>;
}
