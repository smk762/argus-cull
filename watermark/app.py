"""Watermark detector /infer server, for curator's ``crops.detect``.

Speaks the same ``POST /infer`` shape as NudeNet and EraX (multipart ``f1``,
… → ``{"prediction": [[{"class", "score", "box": [x, y, w, h]}, …], …],
"success": true}``). Curator sends each frame upright, so the boxes are in
the pixels it crops by. Ultralytics stays in this sidecar; curator never
imports it.
"""

from __future__ import annotations

import logging
import os
import threading
from pathlib import Path

from fastapi import FastAPI
from sidecar import add_infer, decode_bgr
from ultralytics import YOLO

log = logging.getLogger("watermark")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

_MODEL = Path(os.environ.get("WATERMARK_MODEL", "/models/watermark.pt"))
# Reported floor; curator applies its own min_conf (0.4) on top.
_CONF = float(os.environ.get("WATERMARK_CONF", "0.2") or "0.2")
_IOU = float(os.environ.get("WATERMARK_IOU", "0.5") or "0.5")
# The JoyCaption detector was trained and is served at 1024.
_IMGSZ = int(os.environ.get("WATERMARK_IMGSZ", "1024") or "1024")

if not _MODEL.is_file():
    raise SystemExit(f"watermark model not found: {_MODEL}")

_model = YOLO(str(_MODEL))
_infer = threading.Lock()
log.info("loaded %s classes=%s conf=%s iou=%s imgsz=%s", _MODEL, _model.names, _CONF, _IOU, _IMGSZ)

app = FastAPI(title="Watermark detector")


def _detect(data: bytes) -> list[dict]:
    mat = decode_bgr(data)
    with _infer:
        results = _model.predict(mat, conf=_CONF, iou=_IOU, imgsz=_IMGSZ, verbose=False)
    out: list[dict] = []
    for result in results:
        if result.boxes is None:
            continue
        for box in result.boxes:
            x1, y1, x2, y2 = (float(v) for v in box.xyxy[0].tolist())
            out.append(
                {
                    "class": str(result.names[int(box.cls[0])]),
                    "score": float(box.conf[0]),
                    "box": [round(x1, 1), round(y1, 1), round(x2 - x1, 1), round(y2 - y1, 1)],
                }
            )
    return out


@app.get("/health")
def health() -> dict[str, object]:
    return {"ok": True, "model": _MODEL.name, "classes": list(_model.names.values()), "conf": _CONF, "imgsz": _IMGSZ}


add_infer(app, "Watermark", lambda images: [_detect(data) for data in images])
