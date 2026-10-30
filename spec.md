# Curator demo UI — build doc

Standalone demo for [argus-curator](https://github.com/smk762/argus-curator), the way lightbox is the demo for argus-lens. A test user points it at a folder and sees which images the curator would keep, and why. The suite UI stays in [argus-studio](https://github.com/smk762/argus-studio) (`/curate`). This doc is the build plan; it does not live in the curator repo yet.

Issues that scoped this out of the lens demo: [argus-curator#17](https://github.com/smk762/argus-curator/issues/17) (faces), [#18](https://github.com/smk762/argus-curator/issues/18) (content rating). XMP merge is [#16](https://github.com/smk762/argus-curator/issues/16) and is not required to ship the demo.

## What already exists

The engine and the HTTP server are the product. The demo is a client.

- Server on **:8101**: `argus-curator serve --cors --port 8101 --source-root … --export-root …`
- `POST /scan/folder` and `POST /scan/folder/stream` score a folder. The stream emits `progress` and `chunk` events, then `complete`. `GET /scans` lists cached scans and the one running; a second scan is HTTP 409 until it finishes. `GET /scan/{id}` pages the cached summary.
- `GET /folders` and `GET /thumb` browse and show the mount.
- `POST /export` and `POST /export/stream` copy, symlink, or move a selection and write a JSONL manifest (`manifest_version` 2.1). `exported_abs_path` is the path a follow-up script must use.
- Detectors already on the scan and the export filter: quality score, near-duplicates, InsightFace clusters and head pose, FairFace, MiVOLO, Places365, Fashionpedia garments. `GET /detectors` says which weights are loaded.
- Paths in requests are relative. The server resolves them under `--source-root` and `--export-root` and refuses escapes. `mode: "move"` is rejected unless `--allow-move`.

NudeNet and SingGuard landed in curator 0.4. Both are remote HTTP checks (`ARGUS_CURATOR_NUDENET_URL`, `ARGUS_CURATOR_SINGGUARD_URL`); curator does not import either detector. The demo shows a group only after `GET /detectors` reports it, and every control maps to a field the export body already accepts. Do not invent a client-side score.

The garment model in the server is **Fashionpedia** (YOLOS, 27 garment types), not the older Fashionista parsing set. The UI should say Fashionpedia.

## What the demo shows

One question: which files would make the training set, and which paths should a script delete, move, or leave.

1. **Folder.** Pick a directory under the source root. Start a scan. Progress comes from the SSE stream (`phase`, `done`, `total`) and draws a bar that updates as each phase reports. Image batches from that stream fill the grid before the scan finishes. A scan list shows what is running and what is already cached, and a second scan is refused while one is in progress. Export uses the same bar.
2. **Grid.** Thumbnails only, one page at a time. The full image opens in a dialog. Rejected images stay visible and say their `keep_reason`.
3. **Filters.** Every control maps to a field the export body already accepts. The grid counts update as the selection changes. No second scoring pass.
   - Score floor, include or drop rejects, keep or drop near-duplicates.
   - People: face cluster, head pose (frontal, three-quarter, profile).
   - Attributes on the primary face: race, gender, FairFace age bracket, MiVOLO year range, confidence floor. Show `gender_source` and `age_source`. These are appearance guesses; the UI says so.
   - Scene: Places365 labels among the recorded top-k, indoor or outdoor, confidence floor.
   - Wardrobe: garment present, garment excluded, uncropped only.
   - NudeNet: `nsfw_threshold` on the exposed score (0.2–1, inclusive) and which of NudeNet’s 18 classes that score covers (the five exposed classes start checked). Content rating facet: `safe` / `suggestive` / `explicit` (`content_ratings`). SingGuard: `guard_unsafe`, or `guard_rules` by letter. Frames stay blurred until the NudeNet exposed score is under the display line, then again if policy marks them unsafe, unless that re-blur is opted out. A blurred frame stays hidden until click-to-reveal. A MiVOLO age under 18 with an exposed score of at least 0.2 (NudeNet’s reporting floor, on the five exposed classes) stays blurred, is never kept, and the detail view offers delete instead of reveal. A threshold or rule change updates the count before anyone exports. Unchecked images are excluded once a filter is on.
4. **People.** A cluster list: name, count, representative thumb, grid of that cluster. A rename field per cluster is kept in the URL and sent as `face_names` at export; two clusters can share a name. Split stays out of scope.
5. **Path list.** The thing lightbox cannot do, because the gallery stores filenames only. Two outputs, both from the current filter:
   - **List only.** `GET` or `POST` a text body, one `rel_path` per line, plus a sibling JSONL of `{rel_path, abs_path, keep_reason}`. Nothing is copied. This is the input for a follow-up script that deletes, moves, or processes.
   - **Export.** The existing `POST /export`: copy, symlink, or move into the export root, plus the manifest. Move stays behind the server flag and a confirm step. The UI offers the manifest’s `exported_abs_path` list as a download after the transfer.

A filtered view’s URL holds the scan id and the filter, so a selection can be shared.

## What it does not show

- Lens captions, category facets, explain, or compare. Link to lightbox.
- Quarry, forge, proof, or training.
- GPS, or a model that estimates where a photo was taken.
- Face names written back into the user’s photo folder. Export and the path list are the write paths. XMP regions, names and the content rating are an export checkbox (`write_xmp`).
- A second implementation of scoring in the browser. The client sends the filter; the server decides `keep_reason`.

## Shape

```
folder on disk ──▶ argus-curator :8101 ──▶ demo UI :3000
                   scan cache + ONNX         thumbs, filters, path list
                   export root               no training, no captioning
```

The UI is a Next.js app, same generation as lightbox (App Router, static where it can be, Tailwind tokens if the suite palette is reused). It cannot be a pure static export: scans and exports are live. Pages call the curator server directly. `NEXT_PUBLIC_CURATOR_URL` defaults to `http://localhost:8101`.

Compose runs the published curator image, the demo UI, and a NudeNet server. SingGuard is agent-composer's `/api/guard/check` (`ARGUS_CURATOR_SINGGUARD_URL`, the same guard darkroom uses). The optional `local-singguard` profile still builds an in-process `inclusionAI/Sing-Guard-4b` on this GPU; do not run it beside composer. The photo mount is the source root. A second mount is the export root. Model caches stay in the volumes curator already uses (`argus_curator`, Hugging Face, InsightFace).

`GET /health` must answer before the UI offers Scan. If `/detectors` reports a model missing, that filter group is disabled and says which convert command produces the ONNX file (`fairface-convert`, `mivolo-convert`, `places365-convert`, `garments-convert`).

## Fixture

A committed tiny folder of obviously synthetic images, enough to scan without a GPU: a few faces, a few scenes, a few garments, one near-duplicate pair, one blurry frame. Label it as a fixture. NudeNet’s public demo, when the detector exists, uses mild material and blur on by default, as #18 describes. Do not ship a folder of sexual images in the repo.

## Build order

1. **Shell.** Folder picker (`GET /folders`), scan with SSE progress, paged grid (`GET /scan/{id}`, `GET /thumb`). Empty, error, and “detector not loaded” states.
2. **Filters that already exist.** Score, duplicates, faces, pose, FairFace, MiVOLO, Places365, Fashionpedia. Show `keep_reason` on the card.
3. **Path list.** List-only download of the current selection, then the export button on top of `POST /export`. Confirm copy versus move. After export, download `exported_abs_path` lines.
4. **People view.** Cluster list and per-cluster grid from `face_clusters` already on the summary.
5. **NudeNet and SingGuard.** The groups are absent until `GET /detectors` reports `nudenet` or `singguard`. A scan that did not run the check disables that group.
6. **Link from lightbox.** Point `NEXT_PUBLIC_CURATOR_URL` at this demo instead of the GitHub repo.

## Done when

- A folder scan finishes in the browser and the grid matches `GET /scan/{id}`.
- Changing a filter changes the count and the `keep_reason` set without a rescan.
- “Download paths” yields one relative path per line for the current selection, and a JSONL with `abs_path`, and does not write under the export root.
- Export copy writes files and a manifest; move is refused unless the server was started with `--allow-move`.
- Missing ONNX weights disable that group instead of failing the scan.
- The fixture scan runs in CI without the GPU extras.
