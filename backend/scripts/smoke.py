"""Run the extraction pipeline on every file in scripts/samples and print the result.

    python scripts/smoke.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.pipeline import ExtractionError, extract  # noqa: E402

samples = Path(__file__).parent / "samples"
for p in sorted(samples.iterdir()):
    print("=" * 70)
    print(p.name)
    try:
        res = extract(p.read_bytes(), p.name)
    except ExtractionError as e:
        print("  ERROR:", e)
        continue
    print("  meta:", res["meta"])
    for t in res["tables"]:
        print(f"  {t['name']}  source={t['source']} header={t['has_header']} merges={t['merges']}")
        for row in t["rows"]:
            print("   ", json.dumps(row, ensure_ascii=False))
