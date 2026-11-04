"""Turn a SingGuard generation into the JSON the curator client records.

The model writes a verdict on the first line and the matched rule inside an
``<answer>`` tag. In ``fast-slow`` mode the first line is the fast first-token
signal and the tag is the final judgment after reasoning. Fast is a screen:
a pass stands, a flag is settled by deeper reasoning. The tag decides; a
``[Step 3] Final Judgment`` that concludes safe or unsafe stands when the
tag is missing; the first line only stands in when neither is present. In
``slow`` mode there is no first line at all (see app.py), and the
explanation starts at ``[Step 1]``. A generation with neither a verdict line,
a Final Judgment, nor a tag is a failed check, not a pass. An ``<answer>``
that is neither Safe nor a title in the active policy is an unreadable
check: unsafe, with no rule, so it is not recorded as the rule that fired.
When no policy text was sent, the titles are SingGuard's own headings.
"""

from __future__ import annotations

import logging
import re

log = logging.getLogger("singguard")

_ANSWER = re.compile(r"<answer>\s*(.*?)\s*</answer>", re.IGNORECASE | re.DOTALL)
_HEADING = re.compile(r"^###\s+(.+?)\s*$", re.MULTILINE)
# SingGuard's own headings. A default check sends no policy text, so these
# are the titles an <answer> may name when the request did not bring its own.
_DEFAULT_TITLES = (
    "A. Sexual Content Risk",
    "B. Real-World Crimes & Public Safety",
    "C. Unethical Behavior",
    "D. Cybersecurity & Information Manipulation",
    "E. Agent Safety",
    "F. Politically Sensitive Content",
    "G. Animal Abuse",
    "Safe",
)
_UNREADABLE = (
    "SingGuard's <answer> is not Safe and not a title in the active policy. "
    "The check is unsafe so an unreadable result is not treated as safe."
)
_LATE_VERDICT_LINE = re.compile(r"^\s*\**\s*(safe|unsafe)\s*\**\s*[.!]?\s*$", re.IGNORECASE)
_STEP3_HEADING = re.compile(r"^\[step 3\]", re.IGNORECASE)
_CONCLUDE_RE = re.compile(
    r"\b(?:therefore[,:]?\s+)?(?:(?:the\s+)?(?:content|image)\s+is|"
    r"it\s+is(?:\s+classified\s+as)?|classified\s+as|conclude(?:s|d)?|"
    r"final judgment[:\s]+)\s+(safe|unsafe)\b",
    re.IGNORECASE,
)
# A 2048-token slow writeup is about 8k characters; 4000 cut cascade
# reasoning mid-sentence (composer also prefixes a cascade note).
_EXPLANATION_MAX = 16384


class NoVerdict(ValueError):
    """The generation carried no verdict."""


def _first_line_verdict(raw: str) -> bool | None:
    first = raw.splitlines()[0].strip().lower()
    if first.startswith("unsafe"):
        return False
    if first.startswith("safe"):
        return True
    return None


def _late_judgment(raw: str) -> bool | None:
    """Verdict after reasoning: a standalone safe/unsafe line in Step 3, else its prose."""
    found: bool | None = None
    concluded: bool | None = None
    in_step3 = False
    for line in raw.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if _STEP3_HEADING.match(stripped):
            in_step3 = True
            continue
        if not in_step3:
            continue
        late = _LATE_VERDICT_LINE.match(stripped)
        if late:
            found = late.group(1).lower() == "safe"
            continue
        conclude = _CONCLUDE_RE.search(stripped)
        if conclude:
            concluded = conclude.group(1).lower() == "safe"
    return found if found is not None else concluded


def _titles(policy: str | None) -> list[str]:
    """Headings an ``<answer>`` may name. No policy text means SingGuard's own."""
    text = (policy or "").strip()
    if not text:
        return list(_DEFAULT_TITLES)
    return [match.group(1).strip() for match in _HEADING.finditer(text)]


def _rule_title(answer: str, policy: str | None) -> str | None:
    """The rule to record, or None when *answer* is not a title of *policy*.

    A shortened heading matches (``B. Real-World Crimes`` for the full title).
    The caller's wording is kept for that; an exact match uses the heading.
    """
    wanted = answer.casefold()
    if not wanted:
        return None
    titles = _titles(policy)
    for title in titles:
        if title.casefold() == wanted:
            return title
    for title in titles:
        name = title.casefold()
        if name.startswith(wanted) or wanted.startswith(name):
            return answer
    return None


def parse_generation(text: str, policy: str | None = None) -> tuple[bool, str, str, bool | None]:
    """Return ``(safe, rule, explanation, fast_safe)`` from one generation.

    ``fast_safe`` is the first-line verdict, or None when the first line was
    not one. Raises :class:`NoVerdict` when there is neither an ``<answer>``
    tag, a Step 3 conclusion, nor a first-line verdict, and when an unsafe
    verdict names no rule. An ``<answer>`` that is neither Safe nor a title
    in the active policy is unsafe with an empty rule: unreadable, not a
    named rule, and not a pass.
    """
    raw = text.strip()
    if not raw:
        raise NoVerdict("SingGuard returned an empty generation")
    fast_safe = _first_line_verdict(raw)
    match = _ANSWER.search(raw)
    answer = " ".join(match.group(1).split()) if match else ""
    # The explanation is everything before the tag, less the verdict line when there is one.
    body = raw[: match.start()] if match else raw
    if fast_safe is not None:
        body = body.split("\n", 1)[1] if "\n" in body else ""
    explanation = body.strip()[:_EXPLANATION_MAX]
    if answer:
        safe = answer.casefold() == "safe"
    elif (late := _late_judgment(raw)) is not None:
        safe = late
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
    rule = _rule_title(answer, policy)
    if rule is None:
        explanation = f"{_UNREADABLE}\n\n{explanation}" if explanation else _UNREADABLE
        return False, "", explanation, fast_safe
    return False, rule, explanation, fast_safe


def to_response(text: str, model: str, elapsed_ms: int, policy: str | None = None) -> dict:
    """The ``/api/guard/check`` body the curator client parses."""
    safe, rule, explanation, fast_safe = parse_generation(text, policy)
    categories: list[dict[str, str]] = []
    if not safe and rule:
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
