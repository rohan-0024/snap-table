"""Shared data structures used across the pipeline."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional

from pydantic import BaseModel, Field


@dataclass
class Word:
    """A piece of text with its bounding box in image/page pixel coordinates."""

    text: str
    x0: float
    y0: float
    x1: float
    y1: float
    conf: float = 1.0

    @property
    def cx(self) -> float:
        return (self.x0 + self.x1) / 2

    @property
    def cy(self) -> float:
        return (self.y0 + self.y1) / 2

    @property
    def w(self) -> float:
        return self.x1 - self.x0

    @property
    def h(self) -> float:
        return self.y1 - self.y0


@dataclass
class Merge:
    r0: int
    c0: int
    r1: int
    c1: int


@dataclass
class Table:
    rows: list[list[Any]]
    has_header: bool = False
    merges: list[Merge] = field(default_factory=list)
    confidence: list[list[float]] = field(default_factory=list)
    source: str = "ocr"
    page: Optional[int] = None
    name: str = "Table 1"

    @property
    def n_rows(self) -> int:
        return len(self.rows)

    @property
    def n_cols(self) -> int:
        return max((len(r) for r in self.rows), default=0)

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "rows": self.rows,
            "has_header": self.has_header,
            "merges": [m.__dict__ for m in self.merges],
            "confidence": self.confidence,
            "source": self.source,
            "page": self.page,
        }


# ---- API schemas -----------------------------------------------------------

class MergeIn(BaseModel):
    r0: int
    c0: int
    r1: int
    c1: int


class TableIn(BaseModel):
    name: str = "Table 1"
    rows: list[list[Any]]
    has_header: bool = False
    merges: list[MergeIn] = Field(default_factory=list)


class ExportRequest(BaseModel):
    tables: list[TableIn]
    format: str = "xlsx"  # "xlsx" | "csv"
    filename: str = "snaptable"
