# Changelog

Each release has a `## [x.y.z]` section here. The release workflow uses that section as the GitHub Release notes.

## [0.4.0] - 2026-11-13

First public release, and the first with a web image published to `ghcr.io/smk762/argus-cull`.

### Added

- Export into a curated output root: `ALLOW_MOVE`, `CURATED_OUTPUT_ROOT_PATH`, sidecars and run stats (#50).
- A watermark sidecar and a *Crop watermarks* scan check. Cropped scans export by copy, crop rejects are tallied by kind, and the edge cut limit is configurable (#51, #54, #55).
- Rejected frames are held and shown blurred (#53).
- MIT license.

### Changed

- Guard rules are labelled with adult-cinematic's own letters. SingGuard prose is no longer recorded as the rule that fired, and an answer that is not a rule title is treated as unreadable (#52, #56, #57).
- The five modals use the native `<dialog>` element (#60).
- LAN addresses in defaults and examples are replaced with placeholders. The SingGuard URL is now empty by default (#62).

### Removed

- The `CURATOR_OUTPUT_PATH` fallback. Set `CURATED_OUTPUT_ROOT_PATH` instead (#50).
- The *Keep hard rejects* toggle (#53).

## Curator compatibility

Which argus-curator release added each feature this page uses. The page checks `/health` and `/detectors` and shows a control only when the curator reports it.

- **0.6** publishes `POST /scan/{id}/select`, `GET /image`, NudeNet, SingGuard with named policies and variants, image batches on the scan stream, `GET /scans`, `POST /scan/{id}/delete`, `POST /scan/{id}/cancel`, and `POST /scans/purge`.
- **0.7** adds the set age (`set_age` on `/health`).
- **0.8** adds `GET /guard/policies` (`guard_policy_text` on `/health`) so the page can show the wording a verdict was judged against.
- **0.8.1** names SingGuard's own "Adult Content (Non-criminal)" under Safe, because a "not this rule" line under a risk heading was read as a match.
- **0.10** adds the CUDA image, person boxes and `people_check`, and falls back to `fast` on a SingGuard server without `cascade`.
- **0.11** adds the EraX-NSFW fallback (`ARGUS_CURATOR_ERAX_URL`, `erax` on `/detectors`): when NudeNet returns no exposed score, EraX hits fill the same labels.
- **0.11.1** drops an EraX nipple hit only when its centre lies inside a NudeNet `MALE_BREAST_EXPOSED` box.
- **0.12** adds the scan prefilter (`prefilter` on `/health`), `DELETE /scan/{id}` (`scan_delete`), and deleting any scanned image behind `CURATOR_ALLOW_DELETE` (`delete_any`).
