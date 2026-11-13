"""SnapTable API — FastAPI app.

POST /api/extract   multipart file (png/jpg/webp/pdf) -> {tables: [...], meta: {...}}
POST /api/export    JSON {tables, format, filename} -> .xlsx or .csv download
GET  /health
"""
from __future__ import annotations

import asyncio
import os
import urllib.parse

from . import memory

memory.tune()  # before numpy/OpenCV/onnxruntime spin up threads

from fastapi import FastAPI, File, HTTPException, UploadFile  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import Response  # noqa: E402

from .export import to_csv, to_xlsx  # noqa: E402
from .models import ExportRequest  # noqa: E402
from .pipeline import ExtractionError, extract  # noqa: E402

MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "15"))

# One extraction at a time: each can use ~200 MB at peak and the host allows 512 MB.
# Extra requests wait their turn instead of doubling memory.
_extract_slot = asyncio.Semaphore(int(os.getenv("MAX_CONCURRENT_EXTRACTS", "1")))
ALLOWED_TYPES = {"image/png", "image/jpeg", "image/webp", "image/bmp", "image/tiff", "application/pdf"}

app = FastAPI(title="SnapTable API", version="0.1.0")

origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "memory": memory.report()}


@app.on_event("startup")
def warm_up() -> None:
    # Load OCR models once at boot so the first user request isn't slow.
    if os.getenv("SKIP_WARMUP") != "1":
        from .ocr import get_engine

        get_engine()


@app.post("/api/extract")
async def api_extract(file: UploadFile = File(...)) -> dict:
    ctype = (file.content_type or "").lower()
    name = file.filename or ""
    if ctype not in ALLOWED_TYPES and not name.lower().endswith((".png", ".jpg", ".jpeg", ".webp", ".pdf", ".bmp", ".tif", ".tiff")):
        raise HTTPException(415, "Upload a PNG, JPG, WEBP or PDF file.")
    data = await file.read()
    if len(data) > MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(413, f"File too large. Limit is {MAX_UPLOAD_MB} MB.")
    try:
        # OCR is CPU-bound and takes 30 s+ on a 0.1-CPU host. Running it on the event
        # loop blocked /health for that long, so the host's health check declared the
        # instance dead and restarted it mid-request (502 at ~30 s). A worker thread
        # keeps the loop free; OpenCV and ONNX Runtime release the GIL while computing.
        async with _extract_slot:
            return await asyncio.to_thread(extract, data, name)
    except ExtractionError as e:
        raise HTTPException(422, str(e)) from e


@app.post("/api/export")
def api_export(req: ExportRequest) -> Response:
    if not req.tables:
        raise HTTPException(400, "Nothing to export.")
    base = "".join(ch for ch in (req.filename or "snaptable") if ch.isalnum() or ch in "-_ .").strip() or "snaptable"
    if req.format == "csv":
        body = to_csv(req.tables[0])
        media, ext = "text/csv; charset=utf-8", "csv"
    elif req.format == "xlsx":
        body = to_xlsx(req.tables)
        media, ext = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"
    else:
        raise HTTPException(400, "format must be 'xlsx' or 'csv'.")
    fname = urllib.parse.quote(f"{base}.{ext}")
    return Response(
        content=body,
        media_type=media,
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{fname}"},
    )
