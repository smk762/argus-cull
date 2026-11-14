# Changelog

Each release has a `## [x.y.z]` section here. The release workflow uses that section as the GitHub Release notes.

## [Unreleased]

### Added

- A recorded, static demo build for Cloudflare Pages (`make pages`, `CULL_STATIC=1`): the page replays one scan from a data tape (`scripts/record_tape.py`) with no curator and no API routes, under a hash-based CSP. Scan, export, delete and keep-set filters are shown as *Not in this demo*; labels and tag edits stay in the browser.
- The Dragonhound shared layer (dh-shared 1.2.1, `web/vendor/dh`): tokens, a light theme beside the dark one with the family toggle, demo badges, the demo strip, and a CI drift check.

### Fixed

- A rejected frame's detail view said "Scanning…" over its blur. It now says it was rejected, with the reason, and why it stays blurred.
- The keep-set lists in a disabled group (the static demo) were scroll regions no keyboard could reach; they now list in full.

### Changed

- A veiled frame is a frosted-glass mosaic instead of a heavy blur: 28 cells across the long side while it is held (rejected before the safety checks, or still scanning), 16 once a check flagged it (policy, NudeNet, under 18). The static demo serves the mosaic as a tiny file from the tape (`veils/`, `record_tape.py veils` re-derives it), and the live page draws it from the thumbnail, so a veiled frame never loads its full view, or in the demo its thumbnail.
- The detail view says why in two lines (*Held: not safety-checked*, *Veiled: policy*, *Veiled: NudeNet*) with each reject reason in plain words, and outlines the detected watermark on a crop reject. Veiled tiles carry a chip: *Held*, *Veiled: policy* or *Veiled: NudeNet*.
- The page uses the shared tokens and the system font stack instead of Inter and DM Sans from Google Fonts.

## [0.4.0] - 2026-11-13

First public release, and the first with a web image published to `ghcr.io/smk762/argus-cull`.

### Added

- Export into a curated output root: `ALLOW_MOVE`, `CURATED_OUTPUT_ROOT_PATH`, sidecars and run stats (#50).
- A watermark sidecar and a *Crop watermarks* scan check. Cropped scans export by copy, crop rejects are tallied by kind, and the edge cut limit is configurable (#51, #54, #55).
- Rejected frames are held and shown blurred (#53).
- MIT license.
- A *Scanned by* line on each scan: the curator version, and the SingGuard policy, variants and model the scan recorded (#70).
- `make check` and a curator sync record (`sync/argus-curator.json`). Cull now follows argus-curator's `dev` branch at a recorded commit instead of a release. CI installs curator at that commit and checks the recorded fixture scan, and a daily job flags when `dev` moves on (#70).

### Changed

- Guard rules are labelled with adult-cinematic's own letters. SingGuard prose is no longer recorded as the rule that fired, and an answer that is not a rule title is treated as unreadable (#52, #56, #57).
- The five modals use the native `<dialog>` element (#60).
- Tooltips close on Escape without closing the dialog they sit in, and stay open while the pointer is over them. Grid thumbnails past the first two rows load lazily (#69).
- LAN addresses in defaults and examples are replaced with placeholders. The SingGuard URL is now empty by default (#62).
- The README and spec use the UI's control names, cover *Evaluate keep set*, the sidecar tuning variables and their `POST /infer` contract, and the curator versions behind each feature (#66).

### Removed

- The `CURATOR_OUTPUT_PATH` fallback. Set `CURATED_OUTPUT_ROOT_PATH` instead (#50).
- The *Keep hard rejects* toggle (#53).

## Curator compatibility

Which argus-curator release added each feature this page uses. The page checks `/health` and `/detectors` and shows a control only when the curator reports it.

- **0.6** publishes `POST /scan/{id}/select`, `GET /image`, NudeNet, SingGuard with named policies and variants, image batches on the scan stream, `GET /scans`, `POST /scan/{id}/delete`, `POST /scan/{id}/cancel`, and `POST /scans/purge`.
- **0.7** adds the set age (`set_age` on `/health`).
- **0.8** adds `GET /guard/policies` (`guard_policy_text` on `/health`) so the page can show the wording a verdict was judged against.
- **0.8.1** names SingGuard's own "Adult Content (Non-criminal)" under Safe, because a "not this rule" line under a risk heading was read as a match.
- **0.9** adds XMP sidecars on export (`write_xmp`, with `face_names` from People and the content rating) and NudeNet's content-rating facet (`content_ratings`: `safe` / `suggestive` / `explicit`).
- **0.10** adds the CUDA image, person boxes and `people_check`, and falls back to `fast` on a SingGuard server without `cascade`.
- **0.11** adds the EraX-NSFW fallback (`ARGUS_CURATOR_ERAX_URL`, `erax` on `/detectors`): when NudeNet returns no exposed score, EraX hits fill the same labels.
- **0.11.1** drops an EraX nipple hit only when its centre lies inside a NudeNet `MALE_BREAST_EXPOSED` box.
- **0.12** adds the scan prefilter (`prefilter` on `/health`), `DELETE /scan/{id}` (`scan_delete`), and deleting any scanned image behind `CURATOR_ALLOW_DELETE` (`delete_any`).
- **0.13** carries each image's `.txt`, `.xmp` and `.json` sidecars with it on export and writes `run_stats.json` into the export folder (`export_sidecars` on `/health`). A move drops the moved images from the cached scan.
- **0.14** adds watermark detection and in-memory crops (`crops: {enabled, detect, max_cut}` on the scan; `watermark_detect` on `/health`, `watermark` on `/detectors`). A cropped scan exports only by copy.
- **0.14.1** refuses a scan that asks for watermark detection while the detector is down (HTTP 503), and sends no NudeNet score for a row until EraX has also answered.
