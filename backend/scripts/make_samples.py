"""Generate sample inputs for manual testing: bordered PNG (with a merged header cell),
borderless PNG, a slightly tilted JPG and a 2-page text PDF.

    python scripts/make_samples.py  [out_dir]
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).parent / "samples")
OUT.mkdir(parents=True, exist_ok=True)


def font(size: int):
    for name in ("arial.ttf", "DejaVuSans.ttf", "segoeui.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


ROWS = [
    ["Name", "Marks", "Grade", "Fees"],
    ["Raghav", "92", "A", "₹1,200"],
    ["Priya", "78", "B", "₹950"],
    ["Arjun", "85", "A", "₹1,050"],
]


def bordered(path: Path, merged_header: bool = True) -> None:
    f = font(26)
    col_w, row_h, x0, y0 = [200, 120, 120, 160], 56, 40, 40
    extra = row_h if merged_header else 0
    w = x0 * 2 + sum(col_w)
    h = y0 * 2 + row_h * len(ROWS) + extra
    img = Image.new("RGB", (w, h), "white")
    d = ImageDraw.Draw(img)
    xs = [x0]
    for cw in col_w:
        xs.append(xs[-1] + cw)
    ys = [y0 + i * row_h for i in range(len(ROWS) + 1 + (1 if merged_header else 0))]
    # outer + rows
    for y in ys:
        d.line([(xs[0], y), (xs[-1], y)], fill="black", width=2)
    for i, x in enumerate(xs):
        start_y = ys[0]
        if merged_header and 0 < i < len(xs) - 1:
            start_y = ys[1]  # top row is one merged cell spanning all columns
        d.line([(x, start_y), (x, ys[-1])], fill="black", width=2)
    if merged_header:
        d.text((xs[0] + 12, ys[0] + 14), "Class 10-B Results", font=f, fill="black")
    for r, row in enumerate(ROWS):
        yy = ys[r + (1 if merged_header else 0)] + 14
        for c, val in enumerate(row):
            d.text((xs[c] + 12, yy), val, font=f, fill="black")
    img.save(path)


def borderless(path: Path) -> None:
    f = font(26)
    img = Image.new("RGB", (760, 330), "white")
    d = ImageDraw.Draw(img)
    xs = [40, 300, 460, 600]
    for r, row in enumerate(ROWS):
        for c, val in enumerate(row):
            d.text((xs[c], 40 + r * 60), val, font=f, fill="black")
    img.save(path)


def tilted(src: Path, path: Path) -> None:
    img = Image.open(src).convert("RGB")
    img = img.rotate(3, expand=True, fillcolor="white", resample=Image.BICUBIC)
    img.save(path, quality=80)


def text_pdf(path: Path) -> None:
    import pymupdf as fitz

    doc = fitz.open()
    pages = [ROWS, [ROWS[0], ["Meera", "88", "A", "₹1,100"], ["Dev", "67", "C", "₹800"]]]
    for rows in pages:
        page = doc.new_page()
        xs = [60, 220, 320, 420, 520]
        y = 80
        for r, row in enumerate(rows):
            for c, val in enumerate(row):
                page.insert_text((xs[c] + 6, y + 18), val, fontsize=12, fontname="helv")
            page.draw_rect(fitz.Rect(xs[0], y, xs[-1], y + 26))
            for x in xs[1:-1]:
                page.draw_line((x, y), (x, y + 26))
            y += 26
    doc.save(path)


bordered(OUT / "bordered_merged.png", merged_header=True)
bordered(OUT / "bordered.png", merged_header=False)
borderless(OUT / "borderless.png")
tilted(OUT / "bordered.png", OUT / "tilted.jpg")
text_pdf(OUT / "text_2pages.pdf")
print("samples written to", OUT)
