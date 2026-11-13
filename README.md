# ReDoc · 让笔记回到来源

ReDoc 是一个本地优先的课程资料与可追溯笔记工作台。它把课程资料导入、统一预览、区域/文本摘录、结构化识别、笔记整理和导出放在同一个工作流中，并为摘录保留可回跳的来源锚点。

## 已实现功能

- 课程创建、编辑、归档；课程内资料上传、重命名、文件夹分类、下载与软删除。
- PDF、图片、Markdown、文本、CSV、音视频预览；Office 与不支持格式保留原件并提供明确的下载降级。
- PDF 文字层选择、页码/缩放/搜索、区域框选截图；图片区域摘录与视频帧截图。
- 来源锚点保存资料 ID、版本、页码、归一化坐标、文本快照或视频时间；Note 中的引用可回跳。
- 结构化 Note 块编辑、标题、列表、引用、代码、KaTeX 公式、表格、图片、拖拽排序、撤销/重做、标签与课程内搜索。
- 800 ms 防抖自动保存、当前标签页草稿日志、刷新恢复和版本冲突保护。
- 数字 PDF 文字层提取与图片/扫描 PDF 的本地 Tesseract OCR；结构化重建稿对照修订、只读 Markdown 预览和独立版本保留。
- 任务进度、失败原因与重试；重建失败或重跑不会覆盖已有校对稿。
- Markdown 导出；含图片时导出 ZIP 与 `assets/`；DOCX 导出保留标题、表格、公式文本与可嵌入图片，可选择是否显示来源。
- 可选 DeepSeek 笔记整理：默认关闭，发送前明确确认，生成结果预览后才作为新章节插入，不覆盖原笔记。
- 笔记与来源元数据 JSON 备份；原始资料可分别下载。

## 本地运行

要求 Node.js `^22.13.0 || >=24.0.0`。

```bash
npm ci
npm run dev
```

使用 Vite 输出的 loopback 地址。首次打开会载入一套可删除的高等数学演示课程；之后上传、编辑和重建的数据均保存在当前浏览器的 IndexedDB 中。

```bash
npm test          # Node 原生测试：来源、Function、Markdown/ZIP、DOCX 等
npm run build     # TypeScript 检查与生产构建
npm run preview   # 本地预览 dist/
npm audit --audit-level=high
```

PDF.js worker、CMap 与标准字体由构建准备脚本复制到本地静态目录，不依赖第三方 CDN。

## 可选 AI 整理

前端不会读取或打包 API 密钥。本地 Function 检查可在项目根目录创建不提交的 `.env`：

```dotenv
DEEPSEEK_API=你的服务端密钥
```

也兼容已有变量名 `DEEPSEEK_api`。不要将真实值写入源码、README、聊天或 Git。

```bash
node --env-file=.env scripts/check-ai.mjs
npm run dev:function
```

`dev:function` 与 `check:function` 需要本机 Deno。没有 Deno 时，前端、IndexedDB、OCR 和不依赖云端的导出仍可运行；`npm test` 使用 Node 24 的 TypeScript 支持验证 Function 业务逻辑，但不等同于 Deno 兼容性检查。

AI 请求只发送当前 Note 的标题、整理用 Markdown 和来源标签，不发送原始 PDF、图片或音视频。云端功能不可用时，资料预览、手动摘录、编辑与导出不受影响。

## Qoder Sites 发布

```bash
npm run build
```

在 Qoder Sites 中使用以下发布配置：

- 静态目录：`dist/`
- SPA 回退：开启
- Function 目录：`functions/`
- Function 入口：`functions/index.ts`
- 服务端 Secret：`DEEPSEEK_API`

Secret 值只能通过 Sites Settings 的安全输入配置。线上地址、作品帖和验收记录见 `DESIGN.md`。

## 数据与隐私

- 原件 Blob、Note、SourceAnchor、重建文档、任务与偏好分别存储；编辑衍生内容不会覆盖原件。
- 资料删除采用软删除，Note 同时保留摘录时的来源与内容快照。
- OCR 在当前设备执行；首次使用语言模型时可能需要下载语言数据。
- AI 默认关闭，需先开启偏好并在每次发送前确认；模型结果不会自动覆盖原笔记。
- 数据默认只属于当前浏览器配置文件。清除站点数据会删除本地资料；跨设备同步和多人协作尚未实现，请定期导出与下载备份。

## 当前边界

- OCR 适合清晰中英文文本与基础结构提取；复杂版面、表格、插图和手写内容仍需人工校对，公式上标等可能误识别，不宣称完整 LaTeX OCR。
- PDF 文本引用以页码、区域和快照定位；并非所有文本选择都能实现字符级精确回跳。
- Office 当前采用原件保留与下载降级，未实现服务端 DOCX/PPTX/XLSX 转换预览。
- 视频转写、字幕同步、跨设备同步、完整全文索引和多人权限不在当前版本内。
- Function 的客户端配额是进程内 best-effort 限制，不是身份认证或全局持久化额度。
- 自动保存、导出与核心流程已做真实浏览器回归；当前环境未完成桌面截图视觉验收。

## 技术栈

React 19 · TypeScript · Vite · Tailwind CSS · Radix UI · IndexedDB/idb · PDF.js · Tesseract.js · KaTeX · JSZip · docx · Qoder Sites Edge Function · DeepSeek
