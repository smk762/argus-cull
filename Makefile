.PHONY: check sync-check web-check sync-curator

# Offline: the docs and the recorded fixture scan match sync/argus-curator.json,
# and the web checks pass. No curator install and no network.
check: sync-check web-check

sync-check:
	python3 scripts/sync_check.py

web-check:
	cd web && npm run lint && npm run typecheck && npm test

# Move cull to curator dev HEAD (or COMMIT=<sha>): install it in .venv-curator,
# re-check and re-record the fixture, and update the sync record. Needs network.
COMMIT ?= $(shell gh api repos/smk762/argus-curator/commits/dev --jq .sha)
sync-curator:
	uv venv -q --python 3.12 .venv-curator
	VIRTUAL_ENV=.venv-curator uv pip install -q "argus-curator @ git+https://github.com/smk762/argus-curator@$(COMMIT)"
	.venv-curator/bin/python scripts/check_fixture.py
	.venv-curator/bin/python scripts/record_fixture.py --commit $(COMMIT)
	python3 scripts/sync_check.py
