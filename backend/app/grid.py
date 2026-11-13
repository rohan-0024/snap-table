"""Step 2 — find the table grid.

Bordered tables: detect horizontal + vertical rules with morphology, cluster them
into row/column boundaries, and check which separators are *missing* (merged cells).

Borderless tables: handled in assemble.py from word positions.
"""
from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np


@dataclass
class Grid:
    ys: list[int]          # row boundaries (len = rows + 1)
    xs: list[int]          # column boundaries (len = cols + 1)
    # h_sep[i][j] -> is the horizontal line *below* row i present within column j?
    h_sep: np.ndarray      # shape (rows-1, cols) bool
    # v_sep[i][j] -> is the vertical line *right of* column j present within row i?
    v_sep: np.ndarray      # shape (rows, cols-1) bool

    @property
    def n_rows(self) -> int:
        return len(self.ys) - 1

    @property
    def n_cols(self) -> int:
        return len(self.xs) - 1


def _binarize(gray: np.ndarray) -> np.ndarray:
    thr = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 25, 12
    )
    return thr


def _line_masks(binary: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    h, w = binary.shape
    hk = cv2.getStructuringElement(cv2.MORPH_RECT, (max(w // 25, 15), 1))
    vk = cv2.getStructuringElement(cv2.MORPH_RECT, (1, max(h // 25, 15)))
    horiz = cv2.morphologyEx(binary, cv2.MORPH_OPEN, hk, iterations=1)
    vert = cv2.morphologyEx(binary, cv2.MORPH_OPEN, vk, iterations=1)
    # thicken slightly so slightly broken rules connect
    horiz = cv2.dilate(horiz, cv2.getStructuringElement(cv2.MORPH_RECT, (5, 1)))
    vert = cv2.dilate(vert, cv2.getStructuringElement(cv2.MORPH_RECT, (1, 5)))
    return horiz, vert


def _cluster_positions(positions: np.ndarray, gap: int) -> list[int]:
    """Collapse runs of neighbouring indices (e.g. a 3px-thick line) to one centre."""
    if positions.size == 0:
        return []
    groups: list[list[int]] = [[int(positions[0])]]
    for p in positions[1:]:
        if p - groups[-1][-1] <= gap:
            groups[-1].append(int(p))
        else:
            groups.append([int(p)])
    return [int(round(sum(g) / len(g))) for g in groups]


def detect_grid(gray: np.ndarray) -> Grid | None:
    """Return a Grid if the image contains a ruled table, else None."""
    binary = _binarize(gray)
    horiz, vert = _line_masks(binary)
    h, w = gray.shape

    # Table extent = bounding box of all detected rules.
    both = cv2.bitwise_or(horiz, vert)
    pts = cv2.findNonZero(both)
    if pts is None:
        return None
    bx, by, bw, bh = cv2.boundingRect(pts)
    if bw < w * 0.2 or bh < h * 0.1:
        return None

    # A row boundary is a y where the horizontal mask covers most of the table width.
    row_cov = horiz[by:by + bh, bx:bx + bw].sum(axis=1) / 255.0
    col_cov = vert[by:by + bh, bx:bx + bw].sum(axis=0) / 255.0
    ys = _cluster_positions(np.where(row_cov >= bw * 0.5)[0] + by, gap=6)
    xs = _cluster_positions(np.where(col_cov >= bh * 0.5)[0] + bx, gap=6)

    # Allow the outer border to be missing: pad with table extent if needed.
    if ys and ys[0] - by > 15:
        ys.insert(0, by)
    if ys and (by + bh) - ys[-1] > 15:
        ys.append(by + bh)
    if xs and xs[0] - bx > 15:
        xs.insert(0, bx)
    if xs and (bx + bw) - xs[-1] > 15:
        xs.append(bx + bw)

    # Drop boundaries that are suspiciously close (min cell size ~ 12px).
    ys = _dedupe(ys, 12)
    xs = _dedupe(xs, 12)

    if len(ys) < 3 or len(xs) < 2:
        # Need at least 2 rows. Columns: tables with only horizontal rules are common
        # (e.g. academic style) — treat those as borderless for columns.
        return None
    if len(xs) < 3:
        return None

    rows, cols = len(ys) - 1, len(xs) - 1
    band = 4  # px either side of a boundary to look for the rule

    h_sep = np.zeros((rows - 1, cols), dtype=bool)
    for i in range(1, rows):
        y = ys[i]
        strip = horiz[max(y - band, 0):y + band + 1, :]
        present = strip.max(axis=0) > 0  # per-x: is there a rule pixel near y?
        for j in range(cols):
            x0, x1 = xs[j], xs[j + 1]
            inner = present[x0 + 3:x1 - 3]
            h_sep[i - 1, j] = inner.size == 0 or inner.mean() >= 0.5

    v_sep = np.zeros((rows, cols - 1), dtype=bool)
    for j in range(1, cols):
        x = xs[j]
        strip = vert[:, max(x - band, 0):x + band + 1]
        present = strip.max(axis=1) > 0
        for i in range(rows):
            y0, y1 = ys[i], ys[i + 1]
            inner = present[y0 + 3:y1 - 3]
            v_sep[i, j - 1] = inner.size == 0 or inner.mean() >= 0.5

    return Grid(ys=ys, xs=xs, h_sep=h_sep, v_sep=v_sep)


def _dedupe(vals: list[int], min_gap: int) -> list[int]:
    out: list[int] = []
    for v in vals:
        if not out or v - out[-1] >= min_gap:
            out.append(v)
    return out
