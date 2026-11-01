"""EraX-NSFW /infer server, optional second detector beside NudeNet.

Speaks the same ``POST /infer`` shape as NudeNet (multipart ``f1``, … →
``{"prediction": [[{"class", "score", "box"}, …], …], "success": true}``)
so curator can reuse the same client path. Classes are EraX's own:
``anus``, ``make_love``, ``nipple``, ``penis``, ``vagina``. Ultralytics
stays in this sidecar; curator never imports it.
"""

from __future__ import annotations

import logging
import os
import threading
from pathlib import Path

import cv2
import numpy as np
from fastapi import FastAPI, HTTPException, Request
from ultralytics import YOLO

log = logging.getLogger("erax")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

_MODEL = Path(os.environ.get("ERAX_MODEL", "/models/erax_nsfw_yolo11s.pt"))
_CONF = float(os.environ.get("ERAX_CONF", "0.2") or "0.2")
_IOU = float(os.environ.get("ERAX_IOU", "0.3") or "0.3")

if not _MODEL.is_file():
    raise SystemExit(f"EraX model not found: {_MODEL}")

_model = YOLO(str(_MODEL))
_infer = threading.Lock()
log.info("loaded %s conf=%s iou=%s", _MODEL, _CONF, _IOU)

app = FastAPI(title="EraX-NSFW")


async def _form_images(form) -> list[bytes]:
    blobs: list[bytes] = []
    for key in sorted(form.keys()):
        item = form[key]
        if hasattr(item, "read"):
            data = item.read()
            blobs.append(await data if hasattr(data, "__await__") else data)
    return blobs


def _detect(data: bytes) -> list[dict]:
    mat = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if mat is None:
        raise ValueError("unreadable image")
    with _infer:
        results = _model.predict(mat, conf=_CONF, iou=_IOU, verbose=False)
    out: list[dict] = []
    for result in results:
        names = result.names
        if result.boxes is None:
            continue
        for box in result.boxes:
            x1, y1, x2, y2 = (float(v) for v in box.xyxy[0].tolist())
            label = names[int(box.cls[0])]
            out.append(
                {
                    "class": label,
                    "score": float(box.conf[0]),
                    "box": [int(x1), int(y1), int(x2 - x1), int(y2 - y1)],
                }
            )
    return out


@app.get("/health")
def health() -> dict[str, object]:
    return {"ok": True, "model": _MODEL.name, "conf": _CONF, "iou": _IOU}


@app.post("/infer")
async def infer(request: Request) -> dict[str, object]:
    form = await request.form()
    images = await _form_images(form)
    if not images:
        raise HTTPException(status_code=400, detail="expected multipart image fields (f1, …)")
    prediction: list[list[dict]] = []
    try:
        for data in images:
            prediction.append(_detect(data))
    except Exception as exc:
        log.exception("EraX detect failed")
        raise HTTPException(status_code=500, detail="EraX detect failed") from exc
    return {"prediction": prediction, "success": True}
