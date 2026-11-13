"""Report exact peak memory (max RSS) for extracting one file, as the server would.

    python scripts/peak_mem.py path/to/image.png

Use it to check a change still fits the host's memory limit (Render free: 512 MB).
On Linux this reads the kernel's high-water mark, so short spikes are not missed.
"""
import os
import resource
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.ocr import get_engine  # noqa: E402
from app.pipeline import extract  # noqa: E402


def rss_mb() -> float:
    # Linux reports ru_maxrss in KiB.
    return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024


get_engine()
after_load = rss_mb()
path = Path(sys.argv[1])
t = time.perf_counter()
res = extract(path.read_bytes(), path.name)
rows = res["tables"][0]["rows"]
print(
    f"cpus={os.cpu_count()} MALLOC_ARENA_MAX={os.getenv('MALLOC_ARENA_MAX', '-')} "
    f"| after model load {after_load:.0f} MB | PEAK {rss_mb():.0f} MB "
    f"| {time.perf_counter() - t:.1f}s | table {len(rows)}x{len(rows[0])}"
)
