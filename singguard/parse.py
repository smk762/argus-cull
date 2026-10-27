"""Turn a SingGuard generation into the JSON the curator client records.

The model writes a verdict on the first line and the matched rule inside an
``<answer>`` tag. In ``fast-slow`` mode the first line is the fast first-token
signal and the tag is the final judgment after reasoning, so the two can
disagree. The tag decides; the first line only stands in when the tag is
missing. In ``slow`` mode there is no first line at all (see app.py), and the
explanation starts at ``[Step 1]``. A generation with neither a verdict line
nor a tag is a failed check, not a pass.
"""

from __future__ import annotations

import logging
import re

log = logging.getLogger("singguard")

_ANSWER = re.compile(r"<answer>\s*(.*?)\s*</answer>", re.IGNORECASE | re.DOTALL)
_EXPLANATION_MAX = 4000


class NoVerdict(ValueError):
    """The generation carried no verdict."""


def _first_line_verdict(raw: str) -> bool | None:
    first = raw.splitlines()[0].strip().lower()
    if first.startswith("unsafe"):
        return False
    if first.startswith("safe"):
        return True
    return None


def parse_generation(text: str) -> tuple[bool, str, str, bool | None]:
    """Return ``(safe, rule, explanation, fast_safe)`` from one generation.

    ``fast_safe`` is the first-line verdict, or None when the first line was
    not one. Raises :class:`NoVerdict` when there is neither an ``<answer>``
    tag nor a first-line verdict, and when an unsafe verdict names no rule.
    """
    raw = text.strip()
    if not raw:
        raise NoVerdict("SingGuard returned an empty generation")
    fast_safe = _first_line_verdict(raw)
    match = _ANSWER.search(raw)
    answer = match.group(1).strip() if match else ""
    # The explanation is everything before the tag, less the verdict line when there is one.
    body = raw[: match.start()] if match else raw
    if fast_safe is not None:
        body = body.split("\n", 1)[1] if "\n" in body else ""
    explanation = body.strip()[:_EXPLANATION_MAX]
    if answer:
        safe = answer.lower() == "safe"
    elif fast_safe is not None:
        safe = fast_safe
    else:
        raise NoVerdict("SingGuard returned no verdict")
    if fast_safe is not None and fast_safe != safe:
        log.warning("fast verdict %s overturned by answer %r", "safe" if fast_safe else "unsafe", answer)
    if safe:
        return True, "Safe", explanation, fast_safe
    if not answer:
        raise NoVerdict("SingGuard returned an unsafe verdict with no rule")
    return False, answer, explanation, fast_safe


def to_response(text: str, model: str, elapsed_ms: int) -> dict:
    """The ``/api/guard/check`` body the curator client parses."""
    safe, rule, explanation, fast_safe = parse_generation(text)
    categories: list[dict[str, str]] = []
    if not safe:
        categories.append({"code": rule, "label": rule, "why": explanation or "-"})
    return {
        "safe": safe,
        "verdict": "safe" if safe else "unsafe",
        "rule": rule,
        "explanation": explanation,
        "categories": categories,
        # The first-line signal, kept so a reader can see when reasoning overturned it.
        "fast_verdict": None if fast_safe is None else ("safe" if fast_safe else "unsafe"),
        "model": model,
        "elapsed_ms": elapsed_ms,
    }
