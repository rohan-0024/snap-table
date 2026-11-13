"""Step 3 — OCR: read every text line and where it sits.

Uses RapidOCR (PaddleOCR's detection + recognition models running on ONNX Runtime).
Light enough for a free Hugging Face Space, no PaddlePaddle install required.

Supports both the newer `rapidocr` (2.x) package and the older `rapidocr_onnxruntime`.
"""
from __future__ import annotations

import threading

import cv2
import numpy as np

from .models import Word

# Short tokens (single letters like a grade "A") score low; the default 0.5 cutoff
# silently drops them. 0.3 keeps them and the confidence is surfaced to the user.
TEXT_SCORE = 0.3

_engine = None
_flavour = ""
_lock = threading.Lock()


def get_engine():
    global _engine, _flavour
    if _engine is None:
        with _lock:
            if _engine is None:
                try:
                    from rapidocr import RapidOCR  # 2.x

                    _engine = RapidOCR(params={"Global.text_score": TEXT_SCORE})
                    _flavour = "rapidocr"
                except ImportError:
                    from rapidocr_onnxruntime import RapidOCR  # 1.x

                    _engine = RapidOCR(text_score=TEXT_SCORE)
                    _flavour = "rapidocr_onnxruntime"
    return _engine


def ocr_words(gray: np.ndarray) -> list[Word]:
    """Run OCR on a grayscale image and return text boxes as Word objects."""
    engine = get_engine()
    img = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
    out = engine(img)

    if _flavour == "rapidocr":
        if out is None or out.boxes is None:
            return []
        triples = zip(out.boxes, out.txts, out.scores)
    else:
        result, _elapse = out
        triples = result or []

    words: list[Word] = []
    for box, text, score in triples:
        text = (text or "").strip()
        if not text:
            continue
        pts = np.asarray(box, dtype=np.float32).reshape(-1, 2)
        x0, y0 = pts[:, 0].min(), pts[:, 1].min()
        x1, y1 = pts[:, 0].max(), pts[:, 1].max()
        words.append(Word(text, float(x0), float(y0), float(x1), float(y1), float(score)))
    return words
