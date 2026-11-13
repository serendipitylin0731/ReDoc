import { AlertCircle, ArrowRight, Check, CheckCircle2, Clock3, FileWarning, LoaderCircle, RefreshCw, ScanText } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useWorkspace } from "@app/state/WorkspaceContext";
import type { Job } from "@app/types";

const statusLabels: Record<Job["status"], string> = { queued: "等待处理", running: "正在转换", succeeded: "已完成", failed: "转换失败", cancelled: "已取消" };

export default function JobsPage() {
  const { jobs, assets, courses, documents, startReconstruction } = useWorkspace();
  const navigate = useNavigate();
  const sorted = [...jobs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const running = jobs.filter((job) => ["queued", "running"].includes(job.status)).length;
  const retry = async (job: Job) => {
    const asset = assets.find((item) => item.id === job.assetId);
    if (!asset) return;
    const created = await startReconstruction(asset, job);
    navigate(`/courses/${job.courseId}/convert/${created.documentId}?file=${asset.id}`);
  };
  return <div className="page-container jobs-page"><div className="page-heading-row compact-heading"><div><h1>转换任务</h1><p>查看文件转换进度，或重新打开本次会话中的结果。</p></div><div className="job-summary"><span className={running ? "status-dot pulsing" : "status-dot"} />{running ? `${running} 个任务进行中` : "任务队列已空闲"}</div></div><div className="job-info-banner"><ScanText size={20} /><div><strong>完成后请下载到本地</strong><p>数字 PDF 使用原始文字层，图片与扫描页使用中英文 OCR。生成的文档保留在当前会话中，不会另存为课程资料。</p></div></div><div className="jobs-list">{sorted.map((job) => {
    const asset = assets.find((item) => item.id === job.assetId);
    const course = courses.find((item) => item.id === job.courseId);
    const document = documents.find((item) => item.id === job.documentId && item.status === "ready");
    return <article className={`job-card job-${job.status}`} key={job.id}><span className="job-status-icon">{job.status === "succeeded" ? <CheckCircle2 size={22} /> : job.status === "failed" ? <AlertCircle size={22} /> : <LoaderCircle size={22} className={job.status === "running" ? "spin" : ""} />}</span><div className="job-main"><div className="job-title"><strong>{job.assetName}</strong><span>{statusLabels[job.status]}</span></div><p>{course?.title ?? "课程"} · 转文字文档 · 第 {job.retryCount + 1} 次执行</p>{["running", "queued"].includes(job.status) && <div className="job-progress"><span><i style={{ width: `${job.progress}%` }} /></span><strong>{job.progress}%</strong></div>}{job.status === "failed" && <div className="job-error-message"><FileWarning size={15} /><span>{job.errorMessage ?? "转换失败，请重试。"}</span></div>}{job.status === "succeeded" && <div className="job-success-message"><Check size={14} />{document ? "文档已生成，可打开并下载" : "本次会话中的文档已关闭，可重新转换"}</div>}<div className="job-time"><Clock3 size={12} />更新于 {new Date(job.updatedAt).toLocaleString("zh-CN")}</div></div><div className="job-actions">{job.status === "failed" && asset && <button className="toolbar-button" onClick={() => void retry(job)}><RefreshCw size={15} />重试</button>}{job.status === "succeeded" && asset && <button className="toolbar-button" onClick={() => navigate(document ? `/courses/${job.courseId}/convert/${document.id}?file=${asset.id}` : `/courses/${job.courseId}/convert?file=${asset.id}`)}>{document ? "打开并下载" : "重新转换"}<ArrowRight size={15} /></button>}</div></article>;
  })}</div>{!jobs.length && <div className="large-empty-state"><ScanText size={32} /><h3>还没有转换任务</h3><p>在课程资料或转文字工作台中选择文件开始转换。</p><button className="primary-button" onClick={() => navigate("/courses")}>前往课程资料<ArrowRight size={15} /></button></div>}</div>;
}
