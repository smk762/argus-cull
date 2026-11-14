.PHONY: check sync-check web-check sync-curator tape tape-sample pages shared-check

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

# ---- Static demo (Cloudflare Pages): a recorded tape, served without the curator.

PYTHON ?= python3
# Where the tape is written; the page reads it at NEXT_PUBLIC_CULL_TAPE_URL (/data-tape by default).
TAPE_DIR ?= web/public/data-tape
CURATOR_URL ?= http://localhost:8101
SCAN_ID ?=
IMAGES ?=
LABELS ?=
NOTE ?=
TAPE_ARGS = --out $(TAPE_DIR) $(if $(IMAGES),--images $(IMAGES)) $(if $(LABELS),--labels $(LABELS)) $(if $(NOTE),--note "$(NOTE)")

# Record the newest finished scan (or SCAN_ID) from the curator at CURATOR_URL. Needs Pillow.
tape:
	$(PYTHON) scripts/record_tape.py live --curator $(CURATOR_URL) $(if $(SCAN_ID),--scan-id $(SCAN_ID)) $(TAPE_ARGS)

# The stand-in tape: fixture/ with hand-written results, which the page labels Sample data.
tape-sample:
	$(PYTHON) scripts/make_sample_scan.py
	$(PYTHON) scripts/record_tape.py saved --sample --scan tape/sample/scan.json --images fixture \
		--health tape/sample/health.json --detectors tape/sample/detectors.json --policies tape/sample/policies.json \
		--select tape/sample/select.json --captions tape/sample/captions.json --labels tape/sample/labels.json \
		--note "The repo's drawn-shape fixture with hand-written detector results, standing in until the demo set is approved." \
		--out $(TAPE_DIR)

# Static export (CULL_STATIC=1) of the tape to web/out/, with a hash CSP on every page.
pages:
	cd web && NEXT_PUBLIC_CULL_TAPE_URL=/$(patsubst web/public/%,%,$(TAPE_DIR)) npm run build:pages

# The vendored Dragonhound shared layer is unedited and matches the published v1 manifest.
shared-check:
	node web/vendor/dh/sync-shared.mjs --check . --against https://dragonhound.dev/brand/v1/manifest.json --allow-outdated
