"""SingGuard over HTTP, for the curator on this host.

``POST /api/guard/check`` accepts the body argus-curator already sends
(``input``, ``image_base64``, optional ``policy``, ``thinking`` of ``fast`` or
``fast-slow``) and returns the verdict the client records. Weights are
``inclusionAI/Sing-Guard-4b`` unless ``SINGGUARD_MODEL`` says otherwise.
"""

from __future__ import annotations

import base64
import io
import logging
import os
import threading
import time
from contextlib import asynccontextmanager

import torch
from fastapi import FastAPI, HTTPException
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, Field
from transformers import AutoModelForImageTextToText, AutoProcessor, BitsAndBytesConfig

from parse import NoVerdict, to_response

log = logging.getLogger("singguard")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

_MODEL_NAME = os.environ.get("SINGGUARD_MODEL", "inclusionAI/Sing-Guard-4b")
# A commit sha or tag. trust_remote_code runs code from the Hub, so pinning
# this fixes what gets executed as well as which weights load.
_MODEL_REVISION = os.environ.get("SINGGUARD_REVISION", "").strip() or None
_THINKING = ("fast", "fast-slow")
_MAX_NEW = {"fast": 256, "fast-slow": 1024}

_model = None
_processor = None
_infer = threading.Lock()


class CheckRequest(BaseModel):
    input: str = ""
    image_base64: str
    policy: str | None = None
    thinking: str = Field(default="fast")


def load_model() -> None:
    global _model, _processor
    log.info("loading %s%s", _MODEL_NAME, f"@{_MODEL_REVISION}" if _MODEL_REVISION else "")
    started = time.perf_counter()
    kwargs: dict = {"device_map": "auto", "trust_remote_code": True, "revision": _MODEL_REVISION}
    if os.environ.get("SINGGUARD_LOAD_IN_4BIT") == "1":
        kwargs["quantization_config"] = BitsAndBytesConfig(
            load_in_4bit=True, bnb_4bit_compute_dtype=torch.bfloat16
        )
    else:
        kwargs["dtype"] = torch.bfloat16
    _processor = AutoProcessor.from_pretrained(_MODEL_NAME, trust_remote_code=True, revision=_MODEL_REVISION)
    _model = AutoModelForImageTextToText.from_pretrained(_MODEL_NAME, **kwargs).eval()
    log.info("loaded %s in %.1fs", _MODEL_NAME, time.perf_counter() - started)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    load_model()
    yield


app = FastAPI(lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "model": _MODEL_NAME}


def _image(encoded: str) -> Image.Image:
    try:
        raw = base64.b64decode(encoded, validate=True)
        image = Image.open(io.BytesIO(raw))
        image.load()
    except (ValueError, UnidentifiedImageError, OSError) as exc:
        raise HTTPException(status_code=400, detail="image_base64 is not an image") from exc
    return image


def _generate(image: Image.Image, text: str, policy: str | None, thinking: str) -> str:
    content: list[dict] = [{"type": "image", "image": image}]
    if text.strip():
        content.append({"type": "text", "text": text})
    template_kwargs: dict[str, str] = {"thinking_type": thinking}
    if policy and policy.strip():
        template_kwargs["policy"] = policy
    assert _processor is not None and _model is not None
    # The curator sends two requests at a time. One lock around the whole pass
    # keeps the processor and the GPU to one request each.
    with _infer, torch.inference_mode():
        inputs = _processor.apply_chat_template(
            [{"role": "user", "content": content}],
            tokenize=True,
            add_generation_prompt=True,
            return_dict=True,
            return_tensors="pt",
            **template_kwargs,
        ).to(_model.device)
        generated = _model.generate(**inputs, max_new_tokens=_MAX_NEW[thinking], do_sample=False)
        trimmed = generated[:, inputs["input_ids"].shape[-1] :]
        return _processor.batch_decode(trimmed, skip_special_tokens=True, clean_up_tokenization_spaces=False)[0]


@app.post("/api/guard/check")
def guard_check(body: CheckRequest) -> dict:
    if body.thinking not in _THINKING:
        raise HTTPException(status_code=400, detail="thinking must be fast or fast-slow")
    image = _image(body.image_base64)
    started = time.perf_counter()
    try:
        text = _generate(image, body.input, body.policy, body.thinking)
        return to_response(text, _MODEL_NAME, int((time.perf_counter() - started) * 1000))
    except NoVerdict as exc:
        log.warning("no verdict: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:
        log.exception("guard check failed")
        raise HTTPException(status_code=500, detail="SingGuard check failed") from exc
