"""Step 5 — tidy the data: numbers, currency, common OCR slips, header detection."""
from __future__ import annotations

import re
from typing import Any

from .models import Table

CURRENCY = "₹$€£¥"
_NUM_RE = re.compile(
    rf"^\(?\s*[{CURRENCY}]?\s*[-+]?\s*(\d{{1,3}}(,\d{{2,3}})+|\d+)(\.\d+)?\s*[{CURRENCY}]?\s*\)?%?$"
)
_DIGIT_FIX = str.maketrans({"O": "0", "o": "0", "l": "1", "I": "1", "|": "1", "S": "5", "B": "8"})
_STRAY = re.compile(r"^[\s\.\-_:;,'\"`´~]+|[\s\-_:;'\"`´~]+$")
# OCR models rarely know ₹; it comes out as '?', '·', 'R', 'Rs', 'Rs.' or similar.
_CURRENCY_JUNK = re.compile(r"^(Rs\.?|R|INR|USD|EUR|GBP|[?·•*¤]|[^\w\s])\s*(?=[\d(\-+])", re.IGNORECASE)


def coerce(value: Any) -> Any:
    """'₹1,200' -> 1200 ; '92' -> 92 ; '(45.5)' -> -45.5 ; '12%' stays '12%'."""
    if not isinstance(value, str):
        return value
    s = value.strip()
    if not s:
        return ""
    if s.endswith("%"):
        return s  # keep percentages as typed; spreadsheets handle them
    if _NUM_RE.match(s):
        neg = s.startswith("(") and s.endswith(")") or "-" in s
        digits = re.sub(rf"[{CURRENCY}\s,()+\-]", "", s)
        try:
            num = float(digits)
        except ValueError:
            return s
        if neg:
            num = -num
        return int(num) if num.is_integer() and "." not in digits else num
    return s


def strip_stray(s: str) -> str:
    if not isinstance(s, str):
        return s
    cleaned = _STRAY.sub("", s)
    return cleaned if cleaned else s.strip()


def _fix_numeric_cell(s: str) -> str:
    """Strip a mangled currency prefix, then map look-alike letters to digits."""
    s = _CURRENCY_JUNK.sub("", s.strip())
    return s.translate(_DIGIT_FIX)


def _looks_numeric_after_fix(s: str) -> bool:
    return bool(_NUM_RE.match(_fix_numeric_cell(s)))


def tidy(table: Table) -> Table:
    rows = [[strip_stray(c) if isinstance(c, str) else c for c in r] for r in table.rows]
    ncols = max((len(r) for r in rows), default=0)
    rows = [r + [""] * (ncols - len(r)) for r in rows]
    if table.confidence:
        table.confidence = [c + [1.0] * (ncols - len(c)) for c in table.confidence]

    # Pass 1: coerce obvious numbers.
    rows = [[coerce(c) for c in r] for r in rows]

    # Pass 2: in mostly-numeric columns, fix classic OCR slips (O->0, l->1, '?1,200')
    body = rows[1:] if len(rows) > 1 else rows
    for j in range(ncols):
        col = [r[j] for r in body if str(r[j]).strip() != ""]
        if not col:
            continue
        numeric = sum(isinstance(v, (int, float)) for v in col)
        fixable = sum(isinstance(v, str) and _looks_numeric_after_fix(v) for v in col)
        # Either already mostly numeric, or would be once the OCR slips are repaired.
        if (numeric + fixable) / len(col) >= 0.6 and numeric + fixable >= 2:
            for r in body:
                v = r[j]
                if isinstance(v, str) and v.strip() and _looks_numeric_after_fix(v):
                    r[j] = coerce(_fix_numeric_cell(v))

    table.rows = rows
    _lift_title(table)
    table.has_header = detect_header(table.rows)
    return table


def _lift_title(table: Table) -> None:
    """A first row with a single full-width cell ("Class 10-B Results") is a caption,
    not data. Move it into the table name so the real header row becomes row 0."""
    rows = table.rows
    if len(rows) < 3 or len(rows[0]) < 2:
        return
    filled = [c for c in rows[0] if str(c).strip()]
    if len(filled) != 1 or isinstance(filled[0], (int, float)):
        return
    spans_all = any(m.r0 == 0 and m.r1 == 0 and m.c0 == 0 and m.c1 == len(rows[0]) - 1 for m in table.merges)
    # Borderless tables have no merge record; accept a lone text cell above a fuller row.
    second_filled = sum(1 for c in rows[1] if str(c).strip())
    if not spans_all and second_filled < 2:
        return
    table.name = str(filled[0]).strip()[:31]
    table.rows = rows[1:]
    if table.confidence:
        table.confidence = table.confidence[1:]
    table.merges = [
        type(m)(m.r0 - 1, m.c0, m.r1 - 1, m.c1) for m in table.merges if m.r0 >= 1
    ]


def detect_header(rows: list[list[Any]]) -> bool:
    if len(rows) < 2:
        return False
    first, rest = rows[0], rows[1:]
    first_texts = [c for c in first if str(c).strip()]
    if not first_texts:
        return False
    if any(isinstance(c, (int, float)) for c in first):
        return False
    body_has_numbers = any(isinstance(c, (int, float)) for r in rest for c in r)
    unique = len(set(map(str, first_texts))) == len(first_texts)
    return body_has_numbers or unique
