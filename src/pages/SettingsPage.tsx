import { useEffect, useState } from "react";
import { ArrowLeft, Check, Cloud, Database, Download, HardDrive, Languages, LoaderCircle, Palette, ShieldCheck, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { applyTheme, type ThemePreference } from "@app/lib/theme";
import { useWorkspace } from "@app/state/WorkspaceContext";

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "跟随系统" },
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
];

export default function SettingsPage() {
  const { assets, notes, anchors, getPreference, setPreference } = useWorkspace();
  const navigate = useNavigate();
  const [usage, setUsage] = useState<{ used: number; quota: number } | null>(null);
  const [language, setLanguage] = useState("chi_sim+eng");
  const [cloudAllowed, setCloudAllowed] = useState(false);
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const [theme, setTheme] = useState<ThemePreference>("system");
  useEffect(() => {
    void navigator.storage?.estimate().then((estimate) => setUsage({ used: estimate.usage ?? 0, quota: estimate.quota ?? 0 }));
    void getPreference("ocr-language", "chi_sim+eng").then(setLanguage);
    void getPreference("allow-cloud-ai", false).then(setCloudAllowed);
    void getPreference<ThemePreference>("theme", "system").then(setTheme);
    void fetch("/functions/v1/app/health").then((response) => response.json()).then((result) => setAiConfigured(result.aiConfigured === true)).catch(() => setAiConfigured(null));
  }, [getPreference]);
  const megabytes = assets.reduce((total, asset) => total + asset.size, 0) / 1024 / 1024;
  const backup = () => {
    const payload = JSON.stringify({ exportedAt: new Date().toISOString(), notes, anchors }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `redoc-backup-${new Date().toISOString().slice(0, 10)}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
    toast.success("笔记与来源元数据已备份", { description: "原始文件请通过资料列表分别下载。" });
  };
  const changeTheme = (value: ThemePreference) => { setTheme(value); applyTheme(value); void setPreference("theme", value); };
  return <div className="page-container settings-page"><button className="back-link" onClick={() => navigate("/courses")}><ArrowLeft size={15} />返回课程</button><div className="page-heading-row compact-heading"><div><span className="eyebrow">WORKSPACE PREFERENCES</span><h1>偏好设置</h1><p>清楚知道资料保存在哪里、何时会发送到云端，以及识别能力边界。</p></div><span className="settings-saved"><Check size={14} />设置自动保存</span></div><div className="settings-layout"><div className="settings-main">
    <section className="settings-section"><div className="settings-section-heading"><span className="settings-icon"><Palette size={19} /></span><div><h2>外观</h2><p>选择界面的明暗模式</p></div></div><div className="theme-options">{THEME_OPTIONS.map((option) => <button key={option.value} className={`theme-option ${theme === option.value ? "active" : ""}`} onClick={() => changeTheme(option.value)}>{option.label}</button>)}</div></section>
    <section className="settings-section"><div className="settings-section-heading"><span className="settings-icon"><HardDrive size={19} /></span><div><h2>本地存储</h2><p>IndexedDB 持久化 · 无需注册</p></div></div><div className="storage-meter"><div><span>浏览器已用空间</span><strong>{usage ? `${(usage.used / 1024 / 1024).toFixed(1)} MB` : `${megabytes.toFixed(1)} MB`}</strong></div><span className="storage-track"><i style={{ width: `${usage?.quota ? Math.max(2, Math.min(100, usage.used / usage.quota * 100)) : 2}%` }} /></span><small>{usage?.quota ? `当前设备可用配额约 ${(usage.quota / 1024 / 1024 / 1024).toFixed(1)} GB` : "浏览器会根据设备空间自动分配配额"}</small></div><div className="settings-facts"><span><Database size={15} />{assets.length} 份原始资料</span><span>{notes.length} 篇持久化笔记</span><span>{anchors.length} 条来源锚点</span></div><button className="toolbar-button" onClick={backup}><Download size={15} />备份笔记与来源元数据</button></section>
    <section className="settings-section"><div className="settings-section-heading"><span className="settings-icon"><Languages size={19} /></span><div><h2>结构化识别</h2><p>本地 Tesseract OCR · 数字 PDF 优先文字层</p></div></div><label className="settings-field"><span><strong>识别语言</strong><small>扫描件与图片使用中英文混合模型，首次识别需下载语言数据。</small></span><select value={language} onChange={(event) => { setLanguage(event.target.value); void setPreference("ocr-language", event.target.value); }}><option value="chi_sim+eng">简体中文 + English</option><option value="eng">English</option></select></label><div className="setting-note"><ShieldCheck size={16} /><span>OCR 在当前设备执行，不会把课程图片发送到第三方 OCR 服务。刷新会中断任务，可在任务页安全重试。</span></div></section>
    <section className="settings-section"><div className="settings-section-heading"><span className="settings-icon"><Sparkles size={19} /></span><div><h2>AI 笔记整理</h2><p>DeepSeek · 仅在点击整理时发送当前 Note</p></div><span className={`service-badge ${aiConfigured ? "online" : ""}`}>{aiConfigured === null ? "未检测" : aiConfigured ? "服务已配置" : "等待密钥配置"}</span></div><label className="settings-toggle"><span><strong>允许云端 AI 整理</strong><small>发送前会显示整理预览；确认后才写回，原始摘录永远保留。</small></span><button role="switch" aria-checked={cloudAllowed} className={cloudAllowed ? "toggle active" : "toggle"} onClick={() => { const value = !cloudAllowed; setCloudAllowed(value); void setPreference("allow-cloud-ai", value); }}><i /></button></label><div className="setting-note"><Cloud size={16} /><span>AI 密钥只保存在 Qoder Sites 服务端 Secret 中，不会进入前端代码、浏览器存储或导出文件。</span></div></section>
  </div></div></div>;
}
