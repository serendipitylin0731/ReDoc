from pathlib import Path
import fitz
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "samples"
OUT.mkdir(parents=True, exist_ok=True)

pdf = fitz.open()
for page_number in range(3):
    page = pdf.new_page(width=720, height=960)
    font = "china-s"
    page.draw_rect(fitz.Rect(0, 0, 720, 12), color=None, fill=(0.12, 0.29, 0.24))
    page.insert_text((58, 68), "REDOC  /  MATHEMATICS 101", fontsize=10, fontname="helv", color=(0.25, 0.35, 0.31))
    page.insert_text((620, 68), f"0{page_number + 1}", fontsize=10, fontname="helv", color=(0.25, 0.35, 0.31))
    if page_number == 0:
        page.insert_text((58, 132), "偏导数与梯度", fontsize=30, fontname=font, color=(0.08, 0.16, 0.13))
        page.insert_text((58, 165), "CHAPTER 03  ·  MULTIVARIABLE CALCULUS", fontsize=10, fontname="helv", color=(0.45, 0.48, 0.43))
        page.draw_line(fitz.Point(58, 195), fitz.Point(662, 195), color=(0.82, 0.82, 0.76), width=1)
        page.insert_text((58, 238), "3.1 从变化率理解偏导数", fontsize=17, fontname=font, color=(0.12, 0.29, 0.24))
        body = "对于二元函数 f(x, y)，偏导数描述当一个变量发生微小变化时，函数值如何变化。计算关于 x 的偏导数时，将 y 视为常数；计算关于 y 的偏导数时，将 x 视为常数。"
        page.insert_textbox(fitz.Rect(58, 270, 650, 350), body, fontsize=13, fontname=font, lineheight=1.8, color=(0.17, 0.20, 0.18))
        page.draw_rect(fitz.Rect(58, 375, 662, 500), color=(0.77, 0.82, 0.75), fill=(0.95, 0.96, 0.91), width=1)
        page.insert_text((88, 411), "核心定义", fontsize=12, fontname=font, color=(0.35, 0.43, 0.33))
        page.insert_text((88, 461), "∂f/∂x = lim(h→0) [f(x+h,y) − f(x,y)] / h", fontsize=20, fontname="helv", color=(0.10, 0.24, 0.19))
        page.insert_text((58, 560), "例：f(x, y) = x²y + 3y³", fontsize=16, fontname=font, color=(0.12, 0.29, 0.24))
        page.insert_text((88, 610), "∂f/∂x = 2xy        ∂f/∂y = x² + 9y²", fontsize=20, fontname="helv", color=(0.15, 0.18, 0.16))
        page.insert_textbox(fitz.Rect(58, 680, 650, 770), "几何上，偏导数对应曲面分别沿 x 方向与 y 方向切线的斜率。它只刻画局部的一个方向，并不完整描述函数在所有方向上的变化。", fontsize=13, fontname=font, lineheight=1.8, color=(0.17, 0.20, 0.18))
    elif page_number == 1:
        page.insert_text((58, 132), "梯度：最速上升的方向", fontsize=28, fontname=font, color=(0.08, 0.16, 0.13))
        page.insert_text((58, 176), "3.2 GRADIENT AS A VECTOR", fontsize=11, fontname="helv", color=(0.45, 0.48, 0.43))
        page.insert_textbox(fitz.Rect(58, 220, 650, 300), "梯度将所有一阶偏导数组织成向量。它既指出函数值增长最快的方向，也用向量长度表示这一方向上的变化率。", fontsize=13, fontname=font, lineheight=1.8, color=(0.17, 0.20, 0.18))
        page.draw_rect(fitz.Rect(58, 325, 662, 435), color=None, fill=(0.12, 0.29, 0.24))
        page.insert_text((110, 392), "∇f(x,y) = (∂f/∂x, ∂f/∂y)", fontsize=25, fontname="helv", color=(0.96, 0.95, 0.85))
        page.insert_text((58, 495), "方向导数与梯度的关系", fontsize=17, fontname=font, color=(0.12, 0.29, 0.24))
        page.insert_text((58, 548), "Dᵤf = ∇f · u = |∇f| cos θ", fontsize=21, fontname="helv", color=(0.15, 0.18, 0.16))
        page.insert_textbox(fitz.Rect(58, 595, 650, 695), "当单位向量 u 与梯度同向时，cos θ = 1，方向导数取得最大值；当 u 与梯度垂直时，方向导数为零，这也是等高线切线方向的含义。", fontsize=13, fontname=font, lineheight=1.8, color=(0.17, 0.20, 0.18))
        page.insert_text((58, 760), "学习提示：先判断方向，再比较变化率大小。", fontsize=13, fontname=font, color=(0.54, 0.35, 0.15))
    else:
        page.insert_text((58, 132), "概念对照与直观图像", fontsize=28, fontname=font, color=(0.08, 0.16, 0.13))
        rows = [("概念", "回答的问题", "几何意义"), ("偏导数", "沿坐标轴变化多快？", "坐标方向的切线斜率"), ("梯度", "哪个方向增长最快？", "垂直于等高线的向量"), ("方向导数", "沿指定方向变化多快？", "梯度在单位方向上的投影")]
        y = 205
        for r, row in enumerate(rows):
            fill = (0.12, 0.29, 0.24) if r == 0 else ((0.95, 0.96, 0.91) if r % 2 else (1, 1, 1))
            page.draw_rect(fitz.Rect(58, y, 662, y + 62), color=(0.82, 0.84, 0.79), fill=fill, width=.6)
            for x in (228, 445):
                page.draw_line(fitz.Point(x, y), fitz.Point(x, y + 62), color=(0.82, 0.84, 0.79), width=.6)
            for x, text in zip((76, 246, 463), row):
                page.insert_text((x, y + 38), text, fontsize=11, fontname=font, color=(1, 1, 1) if r == 0 else (0.17, 0.20, 0.18))
            y += 62
        chart = fitz.Rect(85, 535, 635, 825)
        page.draw_rect(chart, color=(0.84, 0.85, 0.8), fill=(0.98, 0.98, 0.95), width=1)
        for i in range(1, 6):
            yy = 535 + i * 48
            page.draw_line(fitz.Point(85, yy), fitz.Point(635, yy), color=(0.9, 0.9, 0.85), width=.5)
        points = []
        for i in range(100):
            x = 95 + i * 5.25
            t = i / 99
            y = 745 - 150 * (t - .45) ** 2 * 2 - 60 * t
            points.append(fitz.Point(x, y))
        page.draw_polyline(points, color=(0.12, 0.29, 0.24), width=3)
        page.draw_line(fitz.Point(405, 635), fitz.Point(520, 580), color=(0.75, 0.42, 0.18), width=3)
        page.draw_circle(fitz.Point(405, 635), 6, color=None, fill=(0.75, 0.42, 0.18))
        page.insert_text((492, 565), "梯度方向", fontsize=12, fontname=font, color=(0.62, 0.32, 0.12))
    page.insert_text((58, 910), "ReDoc 示例讲义 · 仅用于功能演示", fontsize=9, fontname=font, color=(0.5, 0.52, 0.48))
    page.insert_text((58, 932), "来源锚点以页码与归一化坐标记录，摘录不会修改原始 PDF。", fontsize=9, fontname=font, color=(0.5, 0.52, 0.48))

pdf.save(OUT / "gradient-lecture.pdf")
pdf.close()

(OUT / "reading-notes.md").write_text("""# 偏导数阅读卡

## 学习目标

- 能从定义计算一阶偏导数
- 能解释梯度的方向与模长
- 能区分方向导数、偏导数与梯度

## 一道例题

设 $f(x,y)=x^2y+3y^3$，则：

$$\nabla f=(2xy, x^2+9y^2)$$

> 计算偏导数时，另一个变量只是暂时固定，并不是永远为常数。
""", encoding="utf-8")

image = Image.new("RGB", (1400, 900), "#f4f3ea")
draw = ImageDraw.Draw(image)
draw.rectangle((0, 0, 1400, 20), fill="#244d40")
for i in range(1, 10):
    draw.line((100, 100 + i * 65, 1300, 100 + i * 65), fill="#dcded3", width=2)
for i in range(1, 12):
    draw.line((100 + i * 100, 100, 100 + i * 100, 750), fill="#e5e6dd", width=2)
points = []
for i in range(500):
    x = 110 + i * 2.35
    t = i / 499
    y = 600 - 260 * t - 100 * (t - .5) ** 2
    points.append((x, y))
draw.line(points, fill="#315e50", width=8)
draw.line((760, 440, 1110, 275), fill="#bf7845", width=8)
draw.ellipse((744, 424, 776, 456), fill="#bf7845")
image.save(OUT / "gradient-diagram.png")
print(OUT)
