"""SingGuard over HTTP, for the curator on this host.

``POST /api/guard/check`` accepts the body argus-curator already sends
(``input``, ``image_base64``, optional ``policy``, ``thinking`` of ``fast``,
``fast-slow`` or this server's ``slow`` and ``cascade``) and returns the
verdict the client records. Weights are ``inclusionAI/Sing-Guard-4b`` unless
``SINGGUARD_MODEL`` says otherwise. ``SINGGUARD_MAX_NEW_TOKENS`` is the
reasoning budget and ``SINGGUARD_FORCE_THINKING`` judges every request in one
mode.
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


def _int_env(name: str, default: int) -> int:
    raw = os.environ.get(name, "").strip()
    try:
        value = int(raw) if raw else default
    except ValueError:
        value = default
    return value if value > 0 else default


# "fast" is the verdict and rule; "fast-slow" is SingGuard's own mode, a fast
# first-line verdict and then the reasoning; "slow" is this server's variant of
# it with the first line left out. In fast-slow the model writes the verdict
# before it has reasoned, and its reasoning then defers to that line ("the hint
# says unsafe, so unsafe") even when its own Step 2 found no rule matched. Slow
# prefills the assistant turn with the first step heading, so the first thing
# the model decides is the <answer> at the end. The explanation starts at
# [Step 1] and there is no first-line verdict for parse.py to fall back on.
# "cascade" is fast, then slow for the frames fast flagged, and slow's verdict
# stands. Fast over-flags rather than under-flags (its verdict is the same
# first token fast-slow writes before reasoning), so it is a cheap screen;
# a frame it passes is not looked at again.
_THINKING = ("fast", "fast-slow", "slow", "cascade")
_SLOW_PREFILL = "[Step 1] Content Summary\n"
# The adult policies' write-ups run to about a thousand tokens; a generation
# cut off before its <answer> is a failed check, so the reasoning modes get room.
_MAX_NEW = {
    "fast": _int_env("SINGGUARD_MAX_NEW_TOKENS_FAST", 256),
    "fast-slow": _int_env("SINGGUARD_MAX_NEW_TOKENS", 2048),
    "slow": _int_env("SINGGUARD_MAX_NEW_TOKENS", 2048),
}
# Judge every request in this mode whatever it asks for. For trying "slow" or
# "cascade" from a client that can only ask for fast or fast-slow (argus-curator 0.5).
_FORCE_THINKING = os.environ.get("SINGGUARD_FORCE_THINKING", "").strip() or None
if _FORCE_THINKING is not None and _FORCE_THINKING not in _THINKING:
    raise SystemExit(f"SINGGUARD_FORCE_THINKING must be one of {', '.join(_THINKING)}, got {_FORCE_THINKING!r}")

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
def health() -> dict[str, str | None]:
    return {"status": "ok", "model": _MODEL_NAME, "force_thinking": _FORCE_THINKING}


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
    messages = [{"role": "user", "content": content}]
    # Slow is fast-slow's prompt with the assistant turn begun for the model.
    template_kwargs: dict[str, str] = {"thinking_type": "fast-slow" if thinking == "slow" else thinking}
    if policy and policy.strip():
        template_kwargs["policy"] = policy
    assert _processor is not None and _model is not None
    # The curator sends two requests at a time. One lock around the whole pass
    # keeps the processor and the GPU to one request each.
    with _infer, torch.inference_mode():
        if thinking == "slow":
            prompt = _processor.apply_chat_template(
                messages, tokenize=False, add_generation_prompt=True, **template_kwargs
            )
            inputs = _processor(text=[prompt + _SLOW_PREFILL], images=[image], return_tensors="pt")
        else:
            inputs = _processor.apply_chat_template(
                messages,
                tokenize=True,
                add_generation_prompt=True,
                return_dict=True,
                return_tensors="pt",
                **template_kwargs,
            )
        inputs = inputs.to(_model.device)
        generated = _model.generate(**inputs, max_new_tokens=_MAX_NEW[thinking], do_sample=False)
        trimmed = generated[:, inputs["input_ids"].shape[-1] :]
        out = _processor.batch_decode(trimmed, skip_special_tokens=True, clean_up_tokenization_spaces=False)[0]
        # Give the prefilled heading back so the recorded explanation is whole.
        return _SLOW_PREFILL + out if thinking == "slow" else out


def _judge(image: Image.Image, text: str, policy: str | None, thinking: str) -> dict:
    """One generation in *thinking*, parsed. Raises :class:`NoVerdict`."""
    started = time.perf_counter()
    generated = _generate(image, text, policy, thinking)
    try:
        response = to_response(
            generated, _MODEL_NAME, int((time.perf_counter() - started) * 1000), policy
        )
    except NoVerdict:
        # The tail says whether the budget ran out before the <answer> tag.
        log.warning("no verdict (%s, %d chars); tail: %r", thinking, len(generated), generated[-160:])
        raise
    response["thinking"] = thinking
    return response


def _cascade(image: Image.Image, text: str, policy: str | None) -> dict:
    """Fast, then slow for a frame fast flagged; slow's verdict stands.

    The response is slow's, with ``fast_verdict`` ``unsafe`` and ``fast_rule``
    the rule fast named, so a reader sees what the screen said. A frame fast
    passed is returned as fast's own response.
    """
    fast = _judge(image, text, policy, "fast")
    if fast["safe"]:
        return fast
    slow = _judge(image, text, policy, "slow")
    slow["fast_verdict"] = "unsafe"
    slow["fast_rule"] = fast["rule"]
    slow["elapsed_ms"] += fast["elapsed_ms"]
    if slow["safe"]:
        log.info("cascade: fast flagged %r, slow passed", fast["rule"])
    return slow


@app.post("/api/guard/check")
def guard_check(body: CheckRequest) -> dict:
    if body.thinking not in _THINKING:
        raise HTTPException(status_code=400, detail=f"thinking must be one of {', '.join(_THINKING)}")
    thinking = _FORCE_THINKING or body.thinking
    image = _image(body.image_base64)
    try:
        if thinking == "cascade":
            return _cascade(image, body.input, body.policy)
        return _judge(image, body.input, body.policy, thinking)
    except NoVerdict as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:
        log.exception("guard check failed")
        raise HTTPException(status_code=500, detail="SingGuard check failed") from exc
