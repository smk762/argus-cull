"""NudeNet /infer server using the 640m weights.

The official ``ghcr.io/notai-tech/nudenet`` image ships 320n only. This
sidecar speaks the same API the curator already posts to, with
``NudeDetector(model_path=640m.onnx, inference_resolution=640)``. NudeNet
is AGPL-3.0; curator never imports it.
"""

from __future__ import annotations

import logging
import os
import threading
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from nudenet import NudeDetector

log = logging.getLogger("nudenet")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

_MODEL = Path(os.environ.get("NUDENET_MODEL", "/models/640m.onnx"))
_RESOLUTION = int(os.environ.get("NUDENET_RESOLUTION", "640") or "640")

if not _MODEL.is_file():
    raise SystemExit(f"NudeNet model not found: {_MODEL}")

_detector = NudeDetector(model_path=str(_MODEL), inference_resolution=_RESOLUTION)
_infer = threading.Lock()
log.info("loaded %s at %spx", _MODEL, _RESOLUTION)

app = FastAPI(title="NudeNet 640m")


async def _form_images(form) -> list[bytes]:
    """Multipart file parts in field-name order (``f1``, ``f2``, …)."""
    blobs: list[bytes] = []
    for key in sorted(form.keys()):
        item = form[key]
        if hasattr(item, "read"):
            data = item.read()
            blobs.append(await data if hasattr(data, "__await__") else data)
    return blobs


@app.get("/health")
def health() -> dict[str, object]:
    return {"ok": True, "model": _MODEL.name, "resolution": _RESOLUTION}


@app.post("/infer")
async def infer(request: Request) -> dict[str, object]:
    form = await request.form()
    images = await _form_images(form)
    if not images:
        raise HTTPException(status_code=400, detail="expected multipart image fields (f1, …)")
    prediction: list[list[dict]] = []
    try:
        with _infer:
            for data in images:
                prediction.append(_detector.detect(data))
    except Exception as exc:
        log.exception("NudeNet detect failed")
        raise HTTPException(status_code=500, detail="NudeNet detect failed") from exc
    return {"prediction": prediction, "success": True}
