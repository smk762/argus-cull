"""Turn a SingGuard generation into the JSON the curator client records.

The model writes a verdict on the first line and the matched rule inside an
``<answer>`` tag. A missing verdict is a failed check, not a pass.
"""

from __future__ import annotations

import re

_ANSWER = re.compile(r"<answer>\s*(.*?)\s*</answer>", re.IGNORECASE | re.DOTALL)
_EXPLANATION_MAX = 4000


class NoVerdict(ValueError):
    """The generation did not start with safe or unsafe."""


def parse_generation(text: str) -> tuple[bool, str, str]:
    """Return ``(safe, rule, explanation)`` from one generation.

    Raises :class:`NoVerdict` when the first line is not a verdict, and when an
    unsafe verdict names no rule.
    """
    raw = text.strip()
    if not raw:
        raise NoVerdict("SingGuard returned an empty generation")
    first = raw.splitlines()[0].strip().lower()
    if first.startswith("unsafe"):
        safe = False
    elif first.startswith("safe"):
        safe = True
    else:
        raise NoVerdict("SingGuard returned no verdict")
    match = _ANSWER.search(raw)
    answer = match.group(1).strip() if match else ""
    explanation = ""
    if "\n" in raw:
        body = raw.split("\n", 1)[1]
        if match:
            body = raw[: match.start()].split("\n", 1)[1] if "\n" in raw[: match.start()] else ""
        explanation = body.strip()[:_EXPLANATION_MAX]
    if safe:
        return True, "Safe", explanation
    if not answer:
        raise NoVerdict("SingGuard returned an unsafe verdict with no rule")
    return False, answer, explanation


def to_response(text: str, model: str, elapsed_ms: int) -> dict:
    """The ``/api/guard/check`` body the curator client parses."""
    safe, rule, explanation = parse_generation(text)
    categories: list[dict[str, str]] = []
    if not safe:
        categories.append({"code": rule, "label": rule, "why": explanation or "-"})
    return {
        "safe": safe,
        "verdict": "safe" if safe else "unsafe",
        "rule": rule,
        "explanation": explanation,
        "categories": categories,
        "model": model,
        "elapsed_ms": elapsed_ms,
    }
