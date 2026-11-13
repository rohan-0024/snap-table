"""Keep the process inside a small memory budget (Render free tier: 512 MB) and report
real memory figures from the host.

Why: on Linux, glibc gives every thread its own malloc arena and, after a large block is
freed, raises its mmap threshold so later large blocks come from the heap and are never
returned. Measured on the real uvicorn server with a dense 2560x1440 table, fixing the
mmap threshold and capping arenas cut peak memory from ~380 MB to ~310 MB. OpenCV also
starts one worker per reported CPU; containers often report the *host's* core count.

`tune()` must run before the heavy imports (numpy/OpenCV/onnxruntime) start threads.
"""
from __future__ import annotations

import ctypes
import gc
import os
from pathlib import Path

# mallopt() parameter ids from glibc's <malloc.h>
_M_TRIM_THRESHOLD = -1
_M_MMAP_THRESHOLD = -3
_M_ARENA_MAX = -8

_libc = None


def _glibc():
    global _libc
    if _libc is None:
        try:
            _libc = ctypes.CDLL("libc.so.6")
        except OSError:
            _libc = False  # not Linux/glibc (Windows, macOS): nothing to tune
    return _libc or None


def tune() -> None:
    libc = _glibc()
    if libc is None:
        return
    libc.mallopt(_M_ARENA_MAX, 2)
    # A fixed threshold also disables glibc's dynamic raising of it.
    libc.mallopt(_M_MMAP_THRESHOLD, 128 * 1024)
    libc.mallopt(_M_TRIM_THRESHOLD, 4 * 1024 * 1024)


def release() -> None:
    """Return freed heap to the OS after a request."""
    gc.collect()
    libc = _glibc()
    if libc is not None:
        libc.malloc_trim(0)


def _status_mb(field: str) -> int | None:
    try:
        for line in Path("/proc/self/status").read_text().splitlines():
            if line.startswith(field + ":"):
                return int(line.split()[1]) // 1024
    except OSError:
        pass
    return None


def _cgroup_mb(name: str) -> int | None:
    # cgroup v2 first, then v1
    for p in (f"/sys/fs/cgroup/{name}", f"/sys/fs/cgroup/memory/{name}"):
        try:
            raw = Path(p).read_text().strip()
        except OSError:
            continue
        if raw == "max" or not raw.isdigit():
            return None
        v = int(raw)
        return v // (1024 * 1024) if v < 1 << 60 else None
    return None


def report() -> dict:
    """Plain numbers only: used by /health to see what the host really allows."""
    return {
        "rss_mb": _status_mb("VmRSS"),
        "peak_rss_mb": _status_mb("VmHWM"),
        "cgroup_current_mb": _cgroup_mb("memory.current") or _cgroup_mb("memory.usage_in_bytes"),
        "cgroup_peak_mb": _cgroup_mb("memory.peak") or _cgroup_mb("memory.max_usage_in_bytes"),
        "cgroup_limit_mb": _cgroup_mb("memory.max") or _cgroup_mb("memory.limit_in_bytes"),
        "cpus_reported": os.cpu_count(),
        "cpus_usable": len(os.sched_getaffinity(0)) if hasattr(os, "sched_getaffinity") else None,
    }
