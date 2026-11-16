# CLAUDE.md — argus-cull

Guidance for AI agents working in this repo. Human-facing usage lives in [README.md](README.md).

## Argus suite
<!-- argus-suite: keep this block; argus-ci checks for it -->
This repo is part of the Argus suite. The suite map below lists every sibling and what it owns; check it before
building something a sibling may already do. **On every release, update this repo's row and capabilities in
argus-cortex's SUITE.md** (a PR to argus-cortex in the same release).

@../argus-core/SUITE.md

Not checked out? Read https://github.com/smk762/argus-cortex/blob/dev/SUITE.md

## Must never happen

Each row names what enforces it. An **UNENFORCED** row is a known gap. (Only the licensing rows so far; #92 covers the rest.)

| Never | Enforced by |
|---|---|
| Anything outside the three sidecars importing `nudenet` or `ultralytics` (AGPL-3.0) | CI `suite-rules` (argus-ci `agpl-import`). Only `nudenet/`, `erax/` and `watermark/` `app.py` carry a reasoned `nosemgrep` |
| A sidecar image published, or run in a public deployment without an AGPL source offer | **UNENFORCED**. Today `release.yml` pushes only the web image, and the demo runs no sidecars |
| A sidecar's library or weights changed without updating its `NOTICE.md` | **UNENFORCED** |

## Branches

`dev` is the default branch and the base for every PR. Cut feature branches from `origin/dev` and bring them up to date by merging `origin/dev`, never `main`. Never push work to `main` or open a PR against it, except the release PR from `dev`: `main` must never be ahead of `dev`, with one exception. A release fast-forwards `main` to a `dev` commit that passed CI (`git push origin origin/dev:main`), then tags it. If `main` is protected, the release is a reviewed PR from `dev` into `main`, and merging it leaves a merge commit on `main` alone. That merge commit is the one exception to the rule: it leaves `main` one commit ahead of `dev` with an identical tree. Leave it there and don't merge `main` back into `dev`. Anything else on `main` that `dev` lacks is a mistake (`git diff origin/dev origin/main` must be empty). Once `main` carries such a commit it can't be fast-forwarded, so later releases are PRs too.

## Must never happen

Read this before touching `shouldBlur`, `veilFor`, the static demo, the tape or the sync. Each row names the check that fails if the rule breaks. A new rule gets a check, not prose. A rule about code shape (a banned import or API) can go in argus-ci's suite-rules catalogue (smk762/argus-ci#16) instead.

| Never | Enforced by |
|---|---|
| A frame is shown unblurred before NudeNet has reported on it | `web/src/lib/veil.test.ts` "holds an unscored frame while NudeNet runs…" |
| An under-18 frame (face, body-only or set age) with exposure ≥ 0.2 is unblurred, by any setting including *Unblur NSFW* | `web/src/lib/lib.test.ts` "keeps blur on an under-18 face once an exposed class scores 0.2". Keeping and exporting it is refused by argus-curator, not here |
| An uncertain frame (rejected, unscored, EraX-only after NudeNet failed) lifts its blur, or a body-only or set age lifts a hold | `web/src/lib/lib.test.ts` "keeps a frame blurred when NudeNet failed…", "only adds holds…" |
| A veiled frame requests its thumbnail or full view | `web/src/lib/veil.test.ts` "frameSource: a veiled frame never requests its thumbnail or full view" |
| The static demo writes, deletes or exports | `web/src/lib/static.test.ts` "refuses another scan's keep set, writes, deletes and exports without fetching" |
| The tape or the imported docs name a host path, private IP or host name | `web/src/lib/tape.test.ts` "names no host path…"; the docs: `scripts/opsec.mjs` via CI `npm run docs:check` and `docsLinks.test.tsx` "pass the opsec gate as rendered" |
| `web/vendor/dh` is edited here | CI job `dh-shared` (`sync-shared.mjs --check`) |
| The curator commit, its docs and the recorded fixture scan disagree | CI job `fixture` (`sync_check.py`, `record_fixture.py --check`) and `npm run docs:check`. Move them together with `make sync-curator` |
| `fixture/` holds anything but the shapes `scripts/make_fixture.py` draws | CI job `fixture`, step "fixture/ is what make_fixture.py draws" |
| The demo tape holds a minor, or anything but the set `PROVENANCE.md` describes | `web/src/lib/tape.test.ts` "is the adult set PROVENANCE.md describes…" checks the ages and the count. That the images are synthetic, with no real people or photos, is **UNENFORCED**: a human reviews every re-recorded tape against `web/public/data-tape/PROVENANCE.md` |

## Web guidance

Front-end work in `web/` follows Google Chrome's [Modern Web Guidance](https://developer.chrome.com/docs/modern-web-guidance) skill. Install it per user as a Claude Code plugin (`modern-web-guidance@googlechrome`). Its files are not committed here. It sends Google usage data (search queries, guide ids, agent name) unless `DISABLE_TELEMETRY=1` is set, so set that in your shell profile and in the `env` block of `~/.claude/settings.json`.

House exceptions, from the 2026-11-13 pass (#59):

- Tooltips stay the React portal in `components/Tooltip.tsx`, not `popover="hint"` with `interestfor`. Both have limited availability (no Safari), and positioning would also need the anchor-positioning polyfill. The component meets WCAG 1.4.13 itself: Escape dismisses it, and the pointer can move onto it.
- The grid does not use `content-visibility`. It renders 48 tiles a page, so there is little to skip. Thumbnails past the first two rows load lazily instead.
