# Argus Cull

A demo for [argus-curator](https://github.com/smk762/argus-curator). Point it at a folder and see which images the curator would keep, and why. The grid, the path list, and export all use the filter the curator already applies. The browser does not score images.

Lightbox is the demo for argus-lens. This is the demo for the curator. The suite UI stays in argus-studio.

## Run

Curator 0.5 publishes `POST /scan/{id}/select`, `GET /image`, NudeNet, SingGuard with named policies and variants, image batches on the scan stream, `GET /scans`, and `POST /scan/{id}/delete`. The compose file runs the published `ghcr.io/smk762/argus-curator:0.5.0` image with a NudeNet server and a SingGuard server beside it:

```bash
cp .env.example .env
docker compose up --build
```

The UI is http://localhost:3000 and the curator is http://localhost:8101. Both ports are published on this host, so another device opens `http://<this-host>:3000` and does not need a clone. With the default `NEXT_PUBLIC_CURATOR_URL` the browser calls the curator on that same host, port 8101; a value naming another machine is used as written. Name that page origin in `CURATOR_CORS_ORIGINS` (a set value replaces the localhost allow-list, so keep `http://localhost:3000` and `http://127.0.0.1:3000` in the list). `NEXT_PUBLIC_CURATOR_URL` is baked into the web image. The default source mount is `./fixture`. Export lands in `./out`. NudeNet is on unless `ARGUS_CURATOR_NUDENET_URL` is set empty. SingGuard is the `singguard` service (`POST /api/guard/check` on port 9150, `inclusionAI/Sing-Guard-4b`). It needs an NVIDIA GPU. The first start downloads the weights. Set `ARGUS_CURATOR_SINGGUARD_URL` empty to turn the check off. `ARGUS_CURATOR_SINGGUARD_THINKING=fast-slow` also records why a rule fired. In that mode the model writes a fast first-line signal, reasons, then gives its final judgment in an `<answer>` tag; the two can disagree, and the `singguard` service records the answer. A verdict from an earlier server that kept the first line shows as unsafe with the rule `Safe`; the detail view names the conflict, and a rescan settles it.

To build the sibling `../argus-curator` checkout instead of the published image:

```bash
docker compose -f docker-compose.yaml -f docker-compose.local-curator.yaml up --build
```

`NEXT_PUBLIC_CURATOR_URL` is baked in at image build time and defaults to `http://localhost:8101`, which is the published port the browser can reach.

GPU machines can add the device reservation the curator compose uses:

```bash
docker compose -f docker-compose.yaml -f docker-compose.gpu.yaml up --build
```

Move stays off unless `CURATOR_ALLOW_MOVE=1` is set on the curator service. The export dialog names move as destructive and disables it when the server refuses it.

Without Docker, from `web/`:

```bash
npm install
npm run dev
```

and, from the curator repo, `argus-curator serve --cors --port 8101 --source-root … --export-root …`.

## What the page does

Scan streams progress from `POST /scan/folder/stream`. Image batches arrive while the scan is still running, so the grid fills before the slow checks finish, and the bar keeps the phase and the count, one row per phase when face detection and NudeNet run together (curator 0.6). A tile still waiting on those checks says *Scanning…* over the image, and the keep set is reported once the scan is done. The page lists finished scans above the one still running, and will not start a second one while one is running. Blur lifts as soon as the NudeNet exposed score is under `ARGUS_CULL_BLUR_EXPOSED_SCORE` (default 0.25) and the ages are in, and comes back if policy marks the image unsafe. While face detection is still running, a frame with an exposed reading of 0.2 or more waits for its age; under 0.2 the under-18 rule cannot apply, so it does not. *Unblur NSFW* follows the same rule, so it never shows a frame whose under-18 status is still unknown. Set `ARGUS_CULL_POLICY_BLUR=0` to leave it off. The grid can be sorted by that score, by the policy verdict, or by the youngest MiVOLO age, and the arrow reverses the order. An age range next to the sort hides other frames from the gallery without changing which files the scan keeps. Previous and Next in the detail view walk that order. Export uses the same bar. Changing the folder clears that scan from the page. Cached scans stay in the list, so a finished one can be opened again. Optional detectors are requested only when `GET /detectors` says they are loaded, so a missing ONNX file disables that filter group instead of failing the scan. The group names the convert command: `fairface-convert`, `mivolo-convert`, `places365-convert`, or `garments-convert`.

Changing a filter calls `POST /scan/{id}/select`. Counts and `keep_reason` update without another scan. Rejected images stay on the grid.

### SingGuard policies

When `GET /detectors` lists `singguard_policies` (curator 0.5 and later), the sidebar offers the official policy for the next scan (`adult` by default) and the variants to run beside it for comparison. Each variant is another SingGuard pass per image. The official verdict drives the keep set, but a variant that flags where the official policy passes blurs the frame, puts an orange core in the tile's shield, and opens in the detail view, and the unsafe and rule filters send `guard_policies` so "Show left out" and export drop the same images. Each tile carries the file name, the quality score, the NudeNet exposed score, the apparent age, the keep reason, and a shield coloured by the verdict the shield follows: grey before a verdict, green passed, red flagged. An orange core in a green or red shield means another policy disagreed with that verdict. The detail view opens with those numbers in one strip, then the quality, appearance, Places365, Fashionpedia, and NudeNet tables, then a table of every policy's verdict with the reasoning folded under it.

The detail view also takes a label, in a section that starts folded until something is set: what a correct verdict is, using argus-curator's `guard_eval` values (`hard`, `ambiguous`, `adult`, `other`, `safe`), a *proxy* flag for a verified 18+ image standing in for a hard case, a per-image choice of which policy the shield follows, and a note. Labels are keyed by folder and path, so they survive a rescan under other policies, and are written as JSON under `CULL_LABELS_PATH` (default `./labels`). The *Policies* button shows each policy's flag rate, how often it disagrees with the official one, and its precision and recall against the labels, and downloads the labels as JSONL in the shape `scripts/guard_eval.py` reads.

### Setting and wardrobe cohorts

To compare how a setting or an outfit moves the flag rate for the same performer, `cohorts.json` at the repo root (mounted at `CULL_COHORTS_PATH`, read on every page load) names tags and the rules that apply them: `scenes` are Places365 categories as the curator records them, matched at or above `scene_min_conf`; `captions` are whole-word phrases matched against argus-lens sidecars next to the image (`<image>.txt`, and the keywords and description in `<image>.xmp`), which the web container reads from `CURATOR_SOURCE_PATH` mounted read-only. The shipped list is the narrow set most likely to read as an adult cosplaying a minor: classroom, kindergarten, schoolhouse, child's room, playroom, nursery, playground, library, gymnasium, locker room, and dorm room from Places365; school uniform, braces, lollipop, and backpack from captions. Fashionpedia garments are not used, as they have no uniform class. Each tag can be confirmed or removed per image in the detail view, in a section that starts folded unless a tag applies, where a by-hand list replaces the automatic one and *Automatic* hands it back. The grid narrows to one tag with the *Cohort* select, the tags are read in the detail view rather than on the tiles, and the *Policies* panel reads each policy's flag rate on tagged images against the rest of the view, overall and within NudeNet score bands, since an outfit changes the exposed score as well. The labels JSONL carries the tags per row. A broken `cohorts.json` or an unmounted source folder is reported in that panel.

Download paths writes two files in the browser and does not touch the export root: kept `rel_path`s, one per line, and a JSONL of `{rel_path, abs_path, keep_reason}` for every image. Export is separate. It copies, symlinks, or moves through `POST /export/stream`, then offers the manifest's `exported_abs_path` list.

People lists the clusters the scan already computed. The shared URL holds the scan id and the filter.

NudeNet and SingGuard stay hidden until `/detectors` reports them. A threshold or a rule list is sent on the select and export bodies the server already accepts. Flagged frames stay blurred until you show the image. This page does not invent a score. The SingGuard policy a scan is judged under is picked in the sidebar (below) and kept in the URL as `policy=` and `variants=`. Under `adult`, consensual adult nudity passes SingGuard while apparent minors, non-consent and sexual violence are still rule A, and the rule list names it that way. The policy does not change NudeNet scores, the blur line, or the rule that a MiVOLO age under 18 with exposure is never kept.

## Fixture

`fixture/` is a handful of drawn shapes: faces, scenes, garments, one identical pair, and one blurred frame. It is labeled as a fixture. CI installs `argus-curator` with no GPU extras and scans it.

## Develop

```bash
cd web
npm run lint && npm run typecheck && npm test && npm run build
```
