"""Step 1 — clean the image so OCR and grid detection get a tidy input.

grayscale -> upscale small images -> straighten tilt -> light denoise + sharpen
"""
from __future__ import annotations

import math

import cv2
import numpy as np

TARGET_MIN_SIDE = 1400  # upscale until the longer side is at least this many px
MAX_SIDE = 3000         # but never beyond this (keeps OCR fast)


def to_gray(img: np.ndarray) -> np.ndarray:
    if img.ndim == 2:
        return img
    if img.shape[2] == 4:
        # flatten transparency onto white (screenshots of dark-mode apps aside)
        alpha = img[:, :, 3:4].astype(np.float32) / 255.0
        rgb = img[:, :, :3].astype(np.float32)
        img = (rgb * alpha + 255 * (1 - alpha)).astype(np.uint8)
    return cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)


def upscale(img: np.ndarray) -> tuple[np.ndarray, float]:
    h, w = img.shape[:2]
    longer = max(h, w)
    scale = 1.0
    if longer < TARGET_MIN_SIDE:
        scale = min(TARGET_MIN_SIDE / longer, MAX_SIDE / longer, 3.0)
    elif longer > MAX_SIDE:
        scale = MAX_SIDE / longer
    if abs(scale - 1.0) < 0.01:
        return img, 1.0
    interp = cv2.INTER_CUBIC if scale > 1 else cv2.INTER_AREA
    return cv2.resize(img, None, fx=scale, fy=scale, interpolation=interp), scale


def estimate_skew(gray: np.ndarray) -> float:
    """Return the dominant tilt angle in degrees using long near-horizontal lines.

    Works on both ruled tables (uses the rules) and plain text (uses text baselines).
    Returns 0.0 if nothing confident is found.
    """
    edges = cv2.Canny(gray, 50, 150, apertureSize=3)
    h, w = gray.shape
    min_len = max(w // 6, 60)
    lines = cv2.HoughLinesP(
        edges, 1, np.pi / 360, threshold=120, minLineLength=min_len, maxLineGap=10
    )
    if lines is None:
        return 0.0
    angles = []
    weights = []
    for x1, y1, x2, y2 in np.asarray(lines).reshape(-1, 4):
        dx, dy = x2 - x1, y2 - y1
        ang = math.degrees(math.atan2(dy, dx))
        # keep near-horizontal lines only
        if abs(ang) <= 15:
            angles.append(ang)
            weights.append(math.hypot(dx, dy))
    if len(angles) < 3:
        return 0.0
    angle = float(np.average(angles, weights=weights))
    # median is robust against outliers; blend both
    angle = (angle + float(np.median(angles))) / 2
    return angle if abs(angle) >= 0.3 else 0.0


def rotate(img: np.ndarray, angle: float, border: int = 255) -> np.ndarray:
    h, w = img.shape[:2]
    center = (w / 2, h / 2)
    m = cv2.getRotationMatrix2D(center, angle, 1.0)
    cos, sin = abs(m[0, 0]), abs(m[0, 1])
    nw = int(h * sin + w * cos)
    nh = int(h * cos + w * sin)
    m[0, 2] += nw / 2 - center[0]
    m[1, 2] += nh / 2 - center[1]
    border_val = (border, border, border) if img.ndim == 3 else border
    return cv2.warpAffine(
        img, m, (nw, nh), flags=cv2.INTER_CUBIC,
        borderMode=cv2.BORDER_CONSTANT, borderValue=border_val,
    )


def enhance(gray: np.ndarray) -> np.ndarray:
    """Light denoise + unsharp mask. Keeps thin table rules intact."""
    blur = cv2.GaussianBlur(gray, (0, 0), sigmaX=1.0)
    sharp = cv2.addWeighted(gray, 1.6, blur, -0.6, 0)
    return sharp


def preprocess(img_bgr: np.ndarray) -> dict:
    """Return a dict with the cleaned grayscale image and bookkeeping info."""
    gray = to_gray(img_bgr)
    # Dark-mode screenshots: invert so text is dark on light.
    if gray.mean() < 110:
        gray = 255 - gray
    gray, scale = upscale(gray)
    angle = estimate_skew(gray)
    if angle:
        gray = rotate(gray, angle)
    # Note: sharpening was tried and measured — it lowered OCR confidence on
    # clean screenshots, so it's only applied to visibly blurry inputs.
    if _is_blurry(gray):
        gray = enhance(gray)
    return {"gray": gray, "scale": scale, "angle": angle}


def _is_blurry(gray: np.ndarray, threshold: float = 60.0) -> bool:
    """Variance of the Laplacian: low values mean soft edges (phone photos)."""
    return cv2.Laplacian(gray, cv2.CV_64F).var() < threshold
