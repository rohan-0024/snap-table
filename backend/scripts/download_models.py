"""Load the OCR engine once so its model files are downloaded at build time, not on first request.

    python scripts/download_models.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.ocr import get_engine  # noqa: E402

get_engine()
print("OCR models ready")
