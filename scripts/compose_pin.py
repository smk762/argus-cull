"""The curator commit and version docker-compose.yaml builds, read and written in place.

Compose has no way to read ``sync/argus-curator.json``, so the commit and
version are written into ``docker-compose.yaml`` as literals:

    image: argus-curator:dev-<sha[:9]>
    build:
      context: https://github.com/smk762/argus-curator.git#<sha>
      args:
        VERSION: <version>

``scripts/sync_check.py`` holds them to the record; ``scripts/record_fixture.py``
rewrites them when the record moves. Plain text edits, so the file's comments
stay, and no YAML library is needed.
"""

from __future__ import annotations

import re
from pathlib import Path

COMPOSE = Path(__file__).resolve().parents[1] / "docker-compose.yaml"

IMAGE = re.compile(r"^(    image: argus-curator:dev-)([0-9a-f]+)$", re.M)
CONTEXT = re.compile(r"^(      context: https://github\.com/smk762/argus-curator\.git#)([0-9a-f]+)$", re.M)
VERSION = re.compile(r"^(        VERSION: )(\S+)$", re.M)


def _one(pattern: re.Pattern[str], text: str, what: str) -> re.Match[str]:
    matches = list(pattern.finditer(text))
    if len(matches) != 1:
        raise ValueError(f"docker-compose.yaml has {len(matches)} curator {what} lines, expected 1")
    return matches[0]


def read(path: Path = COMPOSE) -> dict[str, str]:
    """The image tag's sha, the build context's sha, and the VERSION build arg."""
    text = path.read_text()
    return {
        "image": _one(IMAGE, text, "image").group(2),
        "commit": _one(CONTEXT, text, "build context").group(2),
        "version": _one(VERSION, text, "VERSION").group(2),
    }


def problems(commit: str, version: str, path: Path = COMPOSE) -> list[str]:
    """Where docker-compose.yaml disagrees with the recorded commit and version."""
    try:
        pin = read(path)
    except ValueError as err:
        return [str(err)]
    found: list[str] = []
    if pin["commit"] != commit:
        found.append(f"docker-compose.yaml builds curator {pin['commit'][:9]}, the sync record says {commit[:9]}")
    if pin["image"] != commit[:9]:
        found.append(f"docker-compose.yaml tags the curator image dev-{pin['image']}, expected dev-{commit[:9]}")
    if pin["version"] != version:
        found.append(f"docker-compose.yaml builds curator as version {pin['version']}, the sync record says {version}")
    return found


def write(commit: str, version: str, path: Path = COMPOSE) -> None:
    text = path.read_text()
    for pattern, what, value in ((IMAGE, "image", commit[:9]), (CONTEXT, "build context", commit), (VERSION, "VERSION", version)):
        _one(pattern, text, what)
        text = pattern.sub(lambda m, v=value: m.group(1) + v, text)
    path.write_text(text)
