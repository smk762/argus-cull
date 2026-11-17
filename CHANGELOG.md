# Changelog

Each release has a `## [x.y.z]` section here. The release workflow uses that section as the GitHub Release notes.

## [Unreleased]

### Changed

- **The NudeNet, EraX and watermark detectors are argus-retina's published images** (`ghcr.io/smk762/argus-retina-*`, `RETINA_TAG`, 0.1.0 by default) instead of sidecars built from this repo (#98). The `nudenet/`, `erax/`, `watermark/` and `sidecar-common/` folders are gone, and nothing here imports an AGPL library any more. On 30 images (20 from the demo tape and the 10 fixture images), retina returned the same classes and scores as the old sidecars for all three detectors. Retina's watermark image ships no weights, so a one-shot `watermark-weights` service fetches the same pinned YOLO11x into a volume on the first `up`. The `nsfw-ready` gate now waits for `model_state` `cpu` or `gpu`, because retina answers `/health` while its model loads. A new CI job, `licence`, fails on any `agpl-import` exemption.
- **"Drop exposed nudity" starts at a NudeNet score of 0.2**, not 0.5: any exposure NudeNet reports, the same default as curator (`DEFAULT_NSFW_THRESHOLD`) and darkroom. On NudeNet 640m, 0.5 let through exposed images scored 0.27–0.49 (argus-curator#156). Conservative on purpose; the slider still goes up to 1.
- **Curator moves to dev at ed7ba0a1a**, which carries curator 0.17.0 (its `/health` reports `0.15.1.dev40`, as a dev build without the release tag): argus-cortex 0.7, 0.2 as the recommended NudeNet threshold, and docs that point at argus-retina's shared NudeNet server. The fixture scan is unchanged. Before that, dev at 8dc3ef625 brought curator 0.16.0: argus-cortex 0.6, the argus-iris GPU broker, the requested SingGuard mode recorded as `guard_config.thinking` (argus-curator#152), and the under-18 rule over the whole frame by default. The fixture scan is unchanged; the imported curator docs gain `docs/gpu.md`.
- Compose passes the broker settings to the curator: `ARGUS_GPU_COORDINATOR=broker` with `ARGUS_GPU_BROKER_URL` (an IP: the container does not resolve LAN host names), `ARGUS_GPU_BROKER_TOKEN` and `ARGUS_GPU_BROKER_FALLBACK` (the host lease, by default). The tenant manifest is the one the curator image ships. `.env.example` shows them. It also passes `CURATOR_TRUSTED_HOSTS` (argus-cortex 0.6 refuses a same-host write by DNS name).

### Added

- The *Scanned by* line names SingGuard's thinking mode, read from the mode each verdict was judged in: fast and slow together read as `cascade (fast N, slow M)`. All fast may be a cascade scan whose screen flagged nothing, and the tooltip says so; once curator records the requested mode (argus-curator#152), that is used instead (#63).
- README's *Run* section links the suite's setup pages for SingGuard, NudeNet, EraX-NSFW, the watermark detector, the GPU host and Moderation, and drops its own account of SingGuard's thinking modes, which the SingGuard page now carries (#63).
- README links this UI's row in the suite's [What to run for which UI](https://docs.dragonhound.dev/setup/which-services/#cull) matrix.
- `/docs`: argus-curator's README and docs pages, imported at the curator `dev` commit the sync record names, behind an opsec gate, with the version, commit, PyPI and GitHub links in the header. `make check` fails when a doc, the pin or the allowlist disagrees with the record, and `make sync-curator` and the drift job re-import them with the fixture (#63).
- In-context docs links on the scan form's checks, the filter groups and a missing model's setup, the detail view's folds, *Run stats* and the Made-with line (#63).
- A recorded, static demo build for Cloudflare Pages (`make pages`, `CULL_STATIC=1`): the page replays one scan from a data tape (`scripts/record_tape.py`) with no curator and no API routes, under a hash-based CSP. Scan, export and delete are off, with the reason on each control; the keep-set filters run in the browser against the recorded scan (`lib/demoSelect.ts`), and labels and tag edits stay in the browser. The sidebar sections fold, the All / Kept / Left out view sits under Display (`?show=`), and the demo's provenance sits at the sidebar's foot.
- The Dragonhound shared layer (dh-shared 1.2.8, `web/vendor/dh`): tokens, a light theme beside the dark one with the family toggle, demo badges, the demo strip (Lightbox, Studio, Atlas, Cull, Realms, Safelight, Assay, Sightline, Mask, Quarry; Cull marked current), and a CI drift check.

### Fixed

- Audit fixes (ai-code-auditor packs):
  - SingGuard: an `<answer>` that is a fragment ("B", "No"), a heading cut mid-word, or fits more than one heading is unreadable (unsafe, no rule) rather than the first heading it prefixes; a run-on answer needs punctuation after the heading. Same rule as agent-composer's guard policy.
  - SingGuard refuses to start with `trust_remote_code` and no pinned revision: `SINGGUARD_REVISION` must be a full commit sha, and unset, the default model loads at the sha `singguard/inputs.py` pins. A request image over 80 MP or 64 MiB of base64 is a 400 before it is decoded, and a decompression bomb is a 400, not a 500.
  - The ages-still-coming hold no longer lifts on an adult set age while face detection runs.
  - Labels apply only to the folder they were loaded for, so another folder's shield overrides never unveil a frame; a note saved on blur survives a verdict clicked straight after.
  - Caption batches in flight when results stream in are no longer dropped; a watched scan from another tab is fetched once more when it ends.
  - SSE frames with CRLF or CR line endings parse, and a non-JSON frame no longer drops the frames around it.
  - Caption sidecars are read up to 64 KiB, in bytes, without buffering the rest; an out-of-range `&#…;` entity is U+FFFD, and hex entities decode.
  - `record_tape.py`: a dotted image name reads its own sidecar; a failed fetch leaves the previous tape in place; a scan result with no `keep_reason` counts as left out.
- The curator drift job could not open its sync PR: it staged `web/public/docs`, which does not exist, so `git add` failed and the job filed an issue instead (#82, #90). `make sync-curator` also failed when `.venv-curator` already existed; it now recreates it.
- A rejected frame's detail view said "Scanning…" over its blur. It now says it was rejected, with the reason, and why it stays blurred.
- The keep-set lists in a disabled group (the static demo) were scroll regions no keyboard could reach; they now list in full.

### Changed

- A veiled frame is a frosted-glass mosaic instead of a heavy blur: one strength for every veil, 28 cells across the long side, whether the frame is held (rejected before the safety checks, still scanning, or under 18 with exposure) or flagged (policy, NudeNet). The static demo serves the mosaic as a tiny file from the tape (`veils/`, `record_tape.py veils` re-derives it), and the live page draws it from the thumbnail, so a veiled frame never loads its full view, or in the demo its thumbnail.
- The detail view says why in two lines (*Held: not safety-checked*, *Veiled: policy*, *Veiled: NudeNet*) with each reject reason in plain words, and outlines the detected watermark on a crop reject. Each tile carries a verdict chip once the keep set exists: *Keep*, *Held*, *Veiled · Keep* or *Left out*, with the reason a frame was left out under it.
- *Most one edge may lose* defaults to 17%, not the curator's 15%, and the scan always sends `max_cut`: the frames 15% rejected as `crop:overlay` needed cuts of up to 16.8%.
- Compose builds argus-curator's `dev` branch at the commit `sync/argus-curator.json` records, instead of the last release (`:latest-gpu`). `make check` fails when `docker-compose.yaml` builds another commit or version, and the drift job and `make sync-curator` move it with the record. `CURATOR_GPU=0` builds the CPU image (#63).
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
