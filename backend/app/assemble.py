"""Step 4 — put each word into its cell (bordered and borderless strategies)."""
from __future__ import annotations

import numpy as np

from .grid import Grid
from .models import Merge, Table, Word


# ---------------------------------------------------------------------------
# Bordered: words -> grid cells, merged cells from missing separators
# ---------------------------------------------------------------------------

def assemble_bordered(words: list[Word], grid: Grid) -> Table:
    rows, cols = grid.n_rows, grid.n_cols
    ys, xs = grid.ys, grid.xs

    # Union-find over cells to form merged regions.
    parent = list(range(rows * cols))

    def find(a: int) -> int:
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    def union(a: int, b: int) -> None:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[max(ra, rb)] = min(ra, rb)

    for i in range(rows - 1):
        for j in range(cols):
            if not grid.h_sep[i, j]:
                union(i * cols + j, (i + 1) * cols + j)
    for i in range(rows):
        for j in range(cols - 1):
            if not grid.v_sep[i, j]:
                union(i * cols + j, i * cols + j + 1)

    # Region -> bounding rectangle of member cells
    regions: dict[int, list[int]] = {}
    for idx in range(rows * cols):
        regions.setdefault(find(idx), []).append(idx)
    merges: list[Merge] = []
    region_of: dict[int, tuple[int, int]] = {}  # cell idx -> anchor (r, c)
    for root, members in regions.items():
        rs = [m // cols for m in members]
        cs = [m % cols for m in members]
        r0, r1, c0, c1 = min(rs), max(rs), min(cs), max(cs)
        for m in members:
            region_of[m] = (r0, c0)
        if (r1 - r0, c1 - c0) != (0, 0) and len(members) == (r1 - r0 + 1) * (c1 - c0 + 1):
            merges.append(Merge(r0, c0, r1, c1))

    # Assign words to cells by centre point, bucket by anchor cell.
    buckets: dict[tuple[int, int], list[Word]] = {}
    for w in words:
        r = _bucket(w.cy, ys)
        c = _bucket(w.cx, xs)
        if r is None or c is None:
            continue
        anchor = region_of.get(r * cols + c, (r, c))
        buckets.setdefault(anchor, []).append(w)

    cells = [["" for _ in range(cols)] for _ in range(rows)]
    conf = [[1.0 for _ in range(cols)] for _ in range(rows)]
    for (r, c), ws in buckets.items():
        cells[r][c] = _join(ws)
        conf[r][c] = min(w.conf for w in ws)

    return Table(rows=cells, merges=merges, confidence=conf, source="ocr-bordered")


def _bucket(v: float, bounds: list[int]) -> int | None:
    if v < bounds[0] or v > bounds[-1]:
        return None
    for i in range(len(bounds) - 1):
        if bounds[i] <= v <= bounds[i + 1]:
            return i
    return None


def _join(ws: list[Word]) -> str:
    # Order by line (y), then x. Words on the same visual line get a space;
    # separate lines get a newline (multi-line cells).
    ws = sorted(ws, key=lambda w: (w.cy, w.cx))
    lines: list[list[Word]] = []
    for w in ws:
        if lines and abs(w.cy - lines[-1][-1].cy) < max(w.h, lines[-1][-1].h) * 0.6:
            lines[-1].append(w)
        else:
            lines.append([w])
    return "\n".join(" ".join(x.text for x in sorted(line, key=lambda w: w.cx)) for line in lines)


# ---------------------------------------------------------------------------
# Borderless: rows from y-clustering, columns from whitespace gaps
# ---------------------------------------------------------------------------

def assemble_borderless(words: list[Word]) -> Table | None:
    if len(words) < 2:
        return None

    heights = np.array([w.h for w in words])
    med_h = float(np.median(heights))
    char_w = float(np.median([w.w / max(len(w.text), 1) for w in words]))

    # --- rows -------------------------------------------------------------
    words_sorted = sorted(words, key=lambda w: w.cy)
    rows: list[list[Word]] = []
    for w in words_sorted:
        if rows:
            row_cy = float(np.mean([x.cy for x in rows[-1]]))
            if abs(w.cy - row_cy) <= med_h * 0.55:
                rows[-1].append(w)
                continue
        rows.append([w])

    # --- columns ----------------------------------------------------------
    table_x0 = min(w.x0 for w in words)
    table_x1 = max(w.x1 for w in words)
    table_w = table_x1 - table_x0
    # Words spanning most of the table (titles, notes) must not block gaps.
    normal = [w for w in words if w.w < table_w * 0.6]
    if not normal:
        normal = words

    occupancy = np.zeros(int(table_w) + 2, dtype=bool)
    for w in normal:
        a = int(w.x0 - table_x0)
        b = int(w.x1 - table_x0) + 1
        occupancy[max(a, 0):min(b, occupancy.size)] = True

    min_gap = max(char_w * 1.2, 6.0)
    boundaries: list[float] = []
    in_gap = False
    gap_start = 0
    for i, occ in enumerate(occupancy):
        if not occ and not in_gap:
            in_gap, gap_start = True, i
        elif occ and in_gap:
            in_gap = False
            if gap_start > 0 and (i - gap_start) >= min_gap:
                boundaries.append(table_x0 + (gap_start + i) / 2)
    xs = [table_x0 - 1] + boundaries + [table_x1 + 1]
    cols = len(xs) - 1
    if cols < 2 or len(rows) < 2:
        return None

    cells = [["" for _ in range(cols)] for _ in range(len(rows))]
    conf = [[1.0 for _ in range(cols)] for _ in range(len(rows))]
    merges: list[Merge] = []
    for r, row in enumerate(rows):
        buckets: dict[int, list[Word]] = {}
        for w in row:
            c0 = _bucket(w.x0 + 1, xs)
            c1 = _bucket(w.x1 - 1, xs)
            if c0 is None or c1 is None:
                c = _bucket(w.cx, xs)
                if c is None:
                    continue
                c0 = c1 = c
            if c1 > c0:
                # Word spans several columns -> merged cell
                merges.append(Merge(r, c0, r, c1))
            buckets.setdefault(c0, []).append(w)
        for c, ws in buckets.items():
            cells[r][c] = _join(ws)
            conf[r][c] = min(w.conf for w in ws)

    # Deduplicate overlapping merges per row (keep widest)
    merges = _clean_merges(merges)
    return Table(rows=cells, merges=merges, confidence=conf, source="ocr-borderless")


def _clean_merges(merges: list[Merge]) -> list[Merge]:
    by_row: dict[int, list[Merge]] = {}
    for m in merges:
        by_row.setdefault(m.r0, []).append(m)
    out: list[Merge] = []
    for r, ms in by_row.items():
        ms.sort(key=lambda m: (m.c0, -(m.c1 - m.c0)))
        last_c1 = -1
        for m in ms:
            if m.c0 > last_c1:
                out.append(m)
                last_c1 = m.c1
    return out
