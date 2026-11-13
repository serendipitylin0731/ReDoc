import { AlertCircle, ArrowRight, Check, CheckCircle2, Clock3, FileWarning, LoaderCircle, RefreshCw, ScanText } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useWorkspace } from "@app/state/WorkspaceContext";
import type { Job } from "@app/types";

const statusLabels: Record<Job["status"], string> = { queued: "等待处理", running: "正在识别", succeeded: "已完成", failed: "需要处理", cancelled: "已取消" };

export default function JobsPage() {
  const { jobs, assets, courses, documents, startReconstruction } = useWorkspace();
  const navigate = useNavigate();
  const sorted = [...jobs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const running = jobs.filter((job) => ["queued", "running"].includes(job.status)).length;
  return <div className="page-container jobs-page"><div className="page-heading-row compact-heading"><div><span className="eyebrow">OBSERVABLE PROCESSING</span><h1>处理任务</h1><p>识别在浏览器后台执行。失败可安全重试，不影响资料预览、手动摘录和导出。</p></div><div className="job-summary"><span className={running ? "status-dot pulsing" : "status-dot"} />{running ? `${running} 个任务进行中` : "任务队列已空闲"}</div></div><div className="job-info-banner"><ScanText size={20} /><div><strong>真实 OCR，不是模拟结果</strong><p>数字 PDF 优先使用原始文字层；图片与扫描页使用 Tesseract 中英文识别。低置信度内容会在对照页标记为“待核对”。</p></div></div><div className="jobs-list">{sorted.map((job) => {
    const asset = assets.find((item) => item.id === job.assetId);
    const course = courses.find((item) => item.id === job.courseId);
    return <article className={`job-card job-${job.status}`} key={job.id}><span className="job-status-icon">{job.status === "succeeded" ? <CheckCircle2 size={22} /> : job.status === "failed" ? <AlertCircle size={22} /> : <LoaderCircle size={22} className={job.status === "running" ? "spin" : ""} />}</span><div className="job-main"><div className="job-title"><strong>{job.assetName}</strong><span>{statusLabels[job.status]}</span></div><p>{course?.title ?? "课程"} · 结构化重建 · 第 {job.retryCount + 1} 次执行</p>{["running", "queued"].includes(job.status) && <div className="job-progress"><span><i style={{ width: `${job.progress}%` }} /></span><strong>{job.progress}%</strong></div>}{job.status === "failed" && <div className="job-error-message"><FileWarning size={15} /><span>{job.errorMessage ?? "识别失败，请重试。"}</span></div>}{job.status === "succeeded" && <div className="job-success-message"><Check size={14} />重建稿已保存，可逐段编辑、确认并导出</div>}<div className="job-time"><Clock3 size={12} />更新于 {new Date(job.updatedAt).toLocaleString("zh-CN")}</div></div><div className="job-actions">{job.status === "failed" && asset && <button className="toolbar-button" onClick={() => void startReconstruction(asset, job)}><RefreshCw size={15} />重试</button>}{job.status === "succeeded" && <button className="toolbar-button" onClick={() => navigate(`/courses/${job.courseId}/reconstruct/${job.documentId ?? documents.filter((document) => document.assetId === job.assetId).sort((a, b) => b.extractionVersion - a.extractionVersion)[0]?.id ?? `document-${job.assetId}`}`)}>打开重建稿<ArrowRight size={15} /></button>}</div></article>;
  })}</div>{!jobs.length && <div className="large-empty-state"><ScanText size={32} /><h3>还没有识别任务</h3><p>在资料查看器点击“结构化重建”，这里会显示实时进度与结果。</p><button className="primary-button" onClick={() => navigate("/courses")}>前往课程资料<ArrowRight size={15} /></button></div>}</div>;
}
