"""Every Argus service container in docker-compose.yaml carries the suite's discovery labels.

argus-iris's node agents read four compose labels to list a service in the suite
directory (argus-cortex 0.16, ``argus_cortex.service``):

    labels:
      argus.peer: curator
      argus.service: argus-curator
      argus.health: /health
      argus.port: "8101"
    environment:
      - ARGUS_PEER=curator

A service is recognised by its image, and must use the peer name and container
port its own repo's compose file uses. The web container, the one-shot jobs and
third-party images are not Argus services and carry none. Plain text, like
``compose_pin``: no YAML library is needed.
"""

from __future__ import annotations

import re
from pathlib import Path

COMPOSE = Path(__file__).resolve().parents[1] / "docker-compose.yaml"

# A trailing comment is allowed: `web:  # nosemgrep: service-peer-label <reason>` marks a container as not a peer.
SERVICE = re.compile(r"^  ([A-Za-z0-9_.-]+):[ \t]*(?:#.*)?$", re.M)
IMAGE = re.compile(r"^    image: (\S+)", re.M)
ARGUS_IMAGE = re.compile(r"^(?:ghcr\.io/smk762/)?(argus-[a-z]+)(?:-([a-z0-9]+))?[:@]")
LABELS = re.compile(r"^    labels:\n((?:      \S.*\n)+)", re.M)
PEER_ENV = re.compile(r"^      - ARGUS_PEER=(\S+)$", re.M)

# Container port per package, as each one's own compose file labels it.
PORTS = {"argus-curator": "8101", "argus-retina": "8080"}


def expected(image: str) -> dict[str, str] | None:
    """The labels the container running *image* must carry; None when it is not an Argus service."""
    match = ARGUS_IMAGE.match(image)
    if not match:
        return None
    package, model = match.groups()
    # argus-retina-<model> is one image per detector, and the model is the peer name.
    peer = model if package == "argus-retina" and model else package.removeprefix("argus-")
    return {
        "argus.peer": peer,
        "argus.service": package,
        "argus.health": "/health",
        "argus.port": PORTS.get(package, ""),
    }


def services(text: str) -> dict[str, str]:
    """Each service's block of text, by name."""
    top = re.search(r"^services:\n", text, re.M)
    if not top:
        return {}
    body = text[top.end() :]
    end = re.search(r"^\S", body, re.M)
    body = body[: end.start()] if end else body
    marks = list(SERVICE.finditer(body))
    return {m.group(1): body[m.end() : nxt.start() if nxt else len(body)] for m, nxt in zip(marks, [*marks[1:], None])}


def problems(path: Path = COMPOSE) -> list[str]:
    """Argus service containers whose labels or ARGUS_PEER are missing or wrong."""
    found: list[str] = []
    for name, block in services(path.read_text()).items():
        image = IMAGE.search(block)
        want = expected(image.group(1)) if image else None
        if want is None:
            continue
        if not want["argus.port"]:
            found.append(f"{path.name}: {name} runs {want['argus.service']}, which compose_labels.PORTS does not know")
            continue
        labels = LABELS.search(block)
        have = dict(re.findall(r'^      ([\w.]+): "?([^"\n]+)"?$', labels.group(1), re.M)) if labels else {}
        for key, value in want.items():
            if have.get(key) != value:
                found.append(f"{path.name}: {name} needs the label {key}: {value}, found {have.get(key)!r}")
        peer = PEER_ENV.search(block)
        if not peer or peer.group(1) != want["argus.peer"]:
            found.append(f"{path.name}: {name} needs ARGUS_PEER={want['argus.peer']} in its environment")
    return found
