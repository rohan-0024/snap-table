"""Glue: bytes in -> list of Tables out. Chooses the OCR path or the PDF-text path."""
from __future__ import annotations

import io
import os
import time

import cv2
import numpy as np

from .assemble import assemble_bordered, assemble_borderless
from .grid import detect_grid
from .models import Table, Word
from .ocr import ocr_words
from .preprocess import preprocess
from .tidy import tidy

PDF_MAGIC = b"%PDF"
RASTER_DPI = 200
# Free hosting has 0.1 CPU; OCR on a long scanned PDF would time out. Cap pages processed.
MAX_PDF_PAGES = int(os.getenv("MAX_PDF_PAGES", "15"))


class ExtractionError(Exception):
    pass


def extract(data: bytes, filename: str = "") -> dict:
    t0 = time.perf_counter()
    if data[:5].startswith(PDF_MAGIC) or filename.lower().endswith(".pdf"):
        tables, path = extract_pdf(data)
    else:
        tables, path = extract_image_bytes(data)
    tables = merge_continuations(tables)
    for i, t in enumerate(tables, 1):
        if not t.name or t.name.startswith("Table "):
            t.name = f"Table {i}"  # keep a lifted title if the table has one
    if not tables:
        raise ExtractionError(
            "No table found. Try a tighter crop around the table, or a sharper image."
        )
    return {
        "tables": [t.to_dict() for t in tables],
        "meta": {"ms": int((time.perf_counter() - t0) * 1000), "path": path},
    }


# ---- images ----------------------------------------------------------------

def extract_image_bytes(data: bytes) -> tuple[list[Table], str]:
    arr = np.frombuffer(data, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_UNCHANGED)
    if img is None:
        raise ExtractionError("Could not decode the image. Use PNG, JPG or WEBP.")
    table = extract_image(img)
    return ([table] if table else []), (table.source if table else "ocr-none")


def extract_image(img: np.ndarray, page: int | None = None) -> Table | None:
    pre = preprocess(img)
    gray = pre["gray"]
    words = ocr_words(gray)
    if not words:
        return None
    grid = detect_grid(gray)
    table = None
    if grid is not None:
        table = assemble_bordered(words, grid)
        # If almost nothing landed in the grid, the "grid" was probably noise.
        filled = sum(1 for r in table.rows for c in r if str(c).strip())
        if filled < max(2, len(words) * 0.4):
            table = None
    if table is None:
        table = assemble_borderless(words)
    if table is None:
        return None
    table.page = page
    return tidy(table)


# ---- PDFs ------------------------------------------------------------------

def extract_pdf(data: bytes) -> tuple[list[Table], str]:
    import pdfplumber
    import pymupdf as fitz

    tables: list[Table] = []
    paths: set[str] = set()
    doc = fitz.open(stream=data, filetype="pdf")
    plumber = pdfplumber.open(io.BytesIO(data))
    try:
        if len(doc) > MAX_PDF_PAGES:
            paths.add(f"first-{MAX_PDF_PAGES}-pages")
        for pno in range(min(len(doc), MAX_PDF_PAGES)):
            page = doc[pno]
            text = page.get_text("text").strip()
            if len(text) >= 20:
                # Text layer present -> direct extraction, ~100% accurate
                ppage = plumber.pages[pno]
                found = _pdf_text_tables(ppage, pno + 1)
                if not found:
                    # Borderless text PDF: reuse the word-position assembler
                    found = _pdf_words_table(ppage, pno + 1)
                tables.extend(found)
                paths.add("pdf-text")
            else:
                # Scanned page -> rasterise and OCR
                pix = page.get_pixmap(dpi=RASTER_DPI, colorspace=fitz.csRGB)
                img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
                img = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)
                t = extract_image(img, page=pno + 1)
                if t:
                    tables.append(t)
                paths.add("pdf-scan-ocr")
    finally:
        plumber.close()
        doc.close()
    return tables, "+".join(sorted(paths)) or "pdf"


def _pdf_text_tables(ppage, pno: int) -> list[Table]:
    out: list[Table] = []
    settings_list = [
        {"vertical_strategy": "lines", "horizontal_strategy": "lines"},
        {"vertical_strategy": "text", "horizontal_strategy": "text",
         "snap_tolerance": 4, "intersection_tolerance": 6},
    ]
    for settings in settings_list:
        try:
            found = ppage.extract_tables(table_settings=settings)
        except Exception:
            found = []
        for raw in found:
            rows = [[(c or "").strip() for c in r] for r in raw if r]
            rows = [r for r in rows if any(c for c in r)]
            if len(rows) >= 2 and max(len(r) for r in rows) >= 2:
                t = Table(rows=rows, source="pdf-text", page=pno)
                t.confidence = [[1.0] * len(r) for r in rows]
                out.append(tidy(t))
        if out:
            break
    return out


def _pdf_words_table(ppage, pno: int) -> list[Table]:
    words_raw = ppage.extract_words(keep_blank_chars=False, use_text_flow=False, x_tolerance=1.5)
    words = [Word(w["text"], w["x0"], w["top"], w["x1"], w["bottom"], 1.0) for w in words_raw]
    t = assemble_borderless(words)
    if not t:
        return []
    t.source, t.page = "pdf-text", pno
    return [tidy(t)]


# ---- multi-page join -------------------------------------------------------

def merge_continuations(tables: list[Table]) -> list[Table]:
    """Join tables that continue over several pages (same width, same/no header)."""
    out: list[Table] = []
    for t in tables:
        if out:
            prev = out[-1]
            same_width = prev.n_cols == t.n_cols and t.n_cols > 0
            consecutive = prev.page is not None and t.page is not None and t.page == prev.page + 1
            if same_width and consecutive:
                rows = t.rows
                conf = t.confidence
                if prev.has_header and rows and _norm(rows[0]) == _norm(prev.rows[0]):
                    rows, conf = rows[1:], conf[1:]  # drop repeated header
                offset = len(prev.rows)
                prev.rows.extend(rows)
                prev.confidence.extend(conf)
                for m in t.merges:
                    shift = offset - (1 if len(rows) != len(t.rows) else 0)
                    if m.r0 + shift >= offset:
                        prev.merges.append(type(m)(m.r0 + shift, m.c0, m.r1 + shift, m.c1))
                prev.page = t.page
                continue
        out.append(t)
    return out


def _norm(row: list) -> list[str]:
    return [str(c).strip().lower() for c in row]
