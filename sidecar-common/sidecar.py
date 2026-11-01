"""NudeNet-shaped ``POST /infer`` plumbing shared by the nudenet and erax sidecars.

Each image copies this file in from the ``common`` build context (see
docker-compose.yaml), so a fix here reaches both.
"""

from __future__ import annotations

import logging
from collections.abc import Callable

import cv2
import numpy as np
from fastapi import FastAPI, HTTPException, Request
from fastapi.concurrency import run_in_threadpool


async def form_images(form) -> list[bytes]:
    """Multipart file parts in the order they were sent (``f1``, ``f2``, …)."""
    blobs: list[bytes] = []
    for _key, item in form.multi_items():
        if hasattr(item, "read"):
            blobs.append(await item.read())
    return blobs


def decode_bgr(data: bytes) -> np.ndarray:
    """Three-channel BGR in stored pixel order (no EXIF rotation).

    Both sidecars decode the same way, so curator can compare EraX boxes
    with NudeNet's. Grayscale frames come back as three channels.
    """
    mat = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR | cv2.IMREAD_IGNORE_ORIENTATION)
    if mat is None:
        raise ValueError("unreadable image")
    return mat


def add_infer(app: FastAPI, name: str, detect_all: Callable[[list[bytes]], list[list[dict]]]) -> None:
    """Mount ``POST /infer``; *detect_all* runs in a worker thread."""
    log = logging.getLogger(name.lower())

    @app.post("/infer")
    async def infer(request: Request) -> dict[str, object]:
        form = await request.form()
        images = await form_images(form)
        if not images:
            raise HTTPException(status_code=400, detail="expected multipart image fields (f1, …)")
        try:
            prediction = await run_in_threadpool(detect_all, images)
        except Exception as exc:
            log.exception("%s detect failed", name)
            raise HTTPException(status_code=500, detail=f"{name} detect failed") from exc
        return {"prediction": prediction, "success": True}
