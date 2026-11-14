"""Offline check that cull's curator docs and demo data match the sync record.

Reads ``sync/argus-curator.json`` and fails when:

- an imported doc file's sha256 differs from the one recorded (or it is missing),
- ``sync/fixture-scan.json`` was recorded with a different curator version or commit,
- the recorded version does not come from the recorded commit (setuptools-scm's
  ``+g<sha>`` suffix, when the version has one),
- ``docker-compose.yaml`` builds a different curator commit or version.

No network and no curator install: this is what ``make check`` runs. Whether
curator's ``dev`` has moved on is the scheduled drift job's question, not this one.
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

import compose_pin

ROOT = Path(__file__).resolve().parents[1]
RECORD = ROOT / "sync" / "argus-curator.json"
FIXTURE_RECORD = ROOT / "sync" / "fixture-scan.json"


def main() -> None:
    record = json.loads(RECORD.read_text())
    problems: list[str] = []

    commit, version = record["commit"], record["version"]
    if not re.fullmatch(r"[0-9a-f]{40}", commit):
        problems.append(f"commit {commit!r} is not a full sha")
    scm = re.search(r"\+g([0-9a-f]+)", version)
    if scm and not commit.startswith(scm.group(1)):
        problems.append(f"version {version} was built from {scm.group(1)}, not the recorded commit {commit[:9]}")

    for rel, expected in sorted(record.get("docs", {}).items()):
        path = ROOT / rel
        if not path.is_file():
            problems.append(f"{rel} is recorded but missing")
            continue
        actual = hashlib.sha256(path.read_bytes()).hexdigest()
        if actual != expected:
            problems.append(f"{rel} sha256 {actual[:12]} is not the recorded {expected[:12]}")

    fixture = json.loads(FIXTURE_RECORD.read_text())["curator"]
    if fixture["commit"] != commit or fixture["version"] != version:
        problems.append(
            f"{FIXTURE_RECORD.relative_to(ROOT)} was recorded with curator {fixture['version']} at {fixture['commit'][:9]}, "
            f"the sync record says {version} at {commit[:9]}"
        )

    problems += compose_pin.problems(commit, version)

    if problems:
        sys.exit("sync check failed:\n- " + "\n- ".join(problems))
    print(f"sync ok: argus-curator {version} at {commit[:9]}, {len(record.get('docs', {}))} doc files")


if __name__ == "__main__":
    main()
