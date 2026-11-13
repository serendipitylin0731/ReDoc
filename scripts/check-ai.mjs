import { handler } from "../functions/handler.ts";

const apiKey = process.env.DEEPSEEK_API ?? process.env.DEEPSEEK_api;
if (!apiKey) throw new Error("请在 .env 中配置 DEEPSEEK_API 后运行此检查。");

const markdown = `# 梯度与方向导数｜第三章

这一章的关键不是记住三个公式，而是把“方向”和“变化率”放在同一个向量里理解。

## 核心概念

> 梯度将所有一阶偏导数组织成向量。它既指出函数值增长最快的方向，也用向量长度表示这一方向上的变化率。

> — 来源：03 · 偏导数与梯度.pdf · 第 2 页

$$
\\nabla f(x,y)=\\left(\\frac{\\partial f}{\\partial x},\\frac{\\partial f}{\\partial y}\\right)
$$

当单位向量 u 与梯度同向时，方向导数最大；与梯度垂直时，方向导数为零。

## 用一道例题固定记忆

> ∂f/∂x = 2xy；∂f/∂y = x² + 9y²

> — 来源：03 · 偏导数与梯度.pdf · 第 1 页

自测：梯度为什么垂直于等高线？尝试从方向导数为零开始解释。`;

const response = await handler(new Request("https://redoc.local/functions/v1/app/api/organize", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ title: "梯度与方向导数｜第三章", markdown }),
}), apiKey);
const result = await response.json();
if (!response.ok) throw new Error(`DeepSeek 样例检查失败：HTTP ${response.status} ${result.error ?? "unknown_error"}`);

const required = ["\\nabla f", "\\frac{\\partial f}", "来源：03 · 偏导数与梯度.pdf · 第 2 页", "来源：03 · 偏导数与梯度.pdf · 第 1 页", "自测"];
const missing = required.filter((value) => !result.markdown.includes(value));
console.log(JSON.stringify({ model: result.model, title: result.title, characters: result.markdown.length, checks: required.length - missing.length, total: required.length, missing }, null, 2));
console.log("\n--- 整理预览 ---\n");
console.log(result.markdown);
if (missing.length) process.exitCode = 1;
