"""Step 6 — export to .xlsx (real numbers, bold header, merged cells) or CSV."""
from __future__ import annotations

import csv
import io

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

from .models import TableIn
from .tidy import coerce

_HEADER_FILL = PatternFill("solid", fgColor="0B1F3A")
_HEADER_FONT = Font(bold=True, color="FFFFFF")
_THIN = Side(style="thin", color="D5DBE3")
_BORDER = Border(left=_THIN, right=_THIN, top=_THIN, bottom=_THIN)


def to_xlsx(tables: list[TableIn]) -> bytes:
    wb = Workbook()
    wb.remove(wb.active)
    used_names: set[str] = set()
    for idx, t in enumerate(tables, 1):
        name = _safe_sheet_name(t.name or f"Table {idx}", used_names)
        ws = wb.create_sheet(title=name)
        widths: dict[int, int] = {}
        for r, row in enumerate(t.rows, 1):
            for c, val in enumerate(row, 1):
                val = coerce(val) if isinstance(val, str) else val
                cell = ws.cell(row=r, column=c, value=val)
                cell.border = _BORDER
                cell.alignment = Alignment(vertical="top", wrap_text="\n" in str(val))
                if t.has_header and r == 1:
                    cell.fill = _HEADER_FILL
                    cell.font = _HEADER_FONT
                widths[c] = max(widths.get(c, 0), *(len(s) for s in str(val).split("\n")))
        for c, w in widths.items():
            ws.column_dimensions[get_column_letter(c)].width = min(max(w + 2, 8), 60)
        for m in t.merges:
            if (m.r1, m.c1) != (m.r0, m.c0):
                ws.merge_cells(start_row=m.r0 + 1, start_column=m.c0 + 1,
                               end_row=m.r1 + 1, end_column=m.c1 + 1)
        if t.has_header:
            ws.freeze_panes = "A2"
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def to_csv(table: TableIn) -> bytes:
    buf = io.StringIO()
    writer = csv.writer(buf, lineterminator="\n")
    for row in table.rows:
        writer.writerow([coerce(v) if isinstance(v, str) else v for v in row])
    return ("﻿" + buf.getvalue()).encode("utf-8")  # BOM so Excel opens UTF-8 correctly


def _safe_sheet_name(name: str, used: set[str]) -> str:
    bad = '[]:*?/\\'
    clean = "".join("_" if ch in bad else ch for ch in name).strip()[:31] or "Sheet"
    base, n = clean, 2
    while clean in used:
        suffix = f" ({n})"
        clean = base[: 31 - len(suffix)] + suffix
        n += 1
    used.add(clean)
    return clean
