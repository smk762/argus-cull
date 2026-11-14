"""Record the fixture scan as cull's curator demo data, or check it against a fresh scan.

    python scripts/record_fixture.py --commit <curator dev sha>   # write sync/fixture-scan.json and the sync record
    python scripts/record_fixture.py --check                      # fail if a fresh scan differs

Needs argus-curator installed at that commit (CI installs it from git). The
record names the curator version and commit that produced it, so
``scripts/sync_check.py`` can hold it to ``sync/argus-curator.json`` offline.
Recording also moves the sync record and the curator ``docker-compose.yaml`` builds.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import argus_curator
from argus_curator.scanner import scan_folder

import compose_pin

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "fixture"
RECORD = ROOT / "sync" / "fixture-scan.json"
SYNC = ROOT / "sync" / "argus-curator.json"


def scan() -> dict:
    summary = scan_folder(FIXTURE)
    results = sorted(summary.results, key=lambda result: result.rel_path)
    return {
        "total": summary.total,
        "passed": summary.passed,
        "rejected": summary.rejected,
        "duplicates": summary.duplicates,
        "results": [
            {
                "rel_path": result.rel_path,
                "passed": result.passed,
                "reject_reason": result.reject_reason,
                "phash": result.phash,
                "is_duplicate": result.is_duplicate,
                "group_size": result.group_size,
            }
            for result in results
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--commit", help="the curator dev commit installed; writes the record")
    mode.add_argument("--check", action="store_true", help="compare a fresh scan with the record")
    args = parser.parse_args()

    fresh = scan()
    if args.check:
        recorded = json.loads(RECORD.read_text())
        if recorded["scan"] != fresh:
            sys.exit(f"{RECORD.relative_to(ROOT)} no longer matches a fresh fixture scan; re-record it with --commit")
        if recorded["curator"]["version"] != argus_curator.__version__:
            sys.exit(f"installed curator {argus_curator.__version__} is not the recorded {recorded['curator']['version']}")
        print(f"fixture record ok: curator {argus_curator.__version__}, {fresh['total']} images")
        return

    record = {"curator": {"version": argus_curator.__version__, "commit": args.commit}, "scan": fresh}
    RECORD.parent.mkdir(exist_ok=True)
    RECORD.write_text(json.dumps(record, indent=2) + "\n")
    # The sync record moves with the demo data, so the two cannot disagree.
    sync = json.loads(SYNC.read_text())
    sync.update(commit=args.commit, version=argus_curator.__version__)
    SYNC.write_text(json.dumps(sync, indent=2) + "\n")
    # And so does the curator docker-compose.yaml builds.
    compose_pin.write(args.commit, argus_curator.__version__)
    print(f"wrote {RECORD.relative_to(ROOT)}, {SYNC.relative_to(ROOT)} and docker-compose.yaml: curator {argus_curator.__version__} at {args.commit[:9]}")


if __name__ == "__main__":
    main()
