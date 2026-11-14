"use client";

import { frameFor } from "@/lib/api";
import { ageMissing, awaitingChecks, DEFAULT_BLUR, isMinorExposed, shownAge, usesSetAge, type BlurPolicy, type FaceView, type GridSort, type KeepView, type SortDirection } from "@/lib/chunks";
import type { ImageLabel } from "@/lib/labels";
import { pathsByShield, policyShields, SHIELD_PICK_LABELS, SHIELD_PICKS, type ShieldPick, type ShieldView } from "@/lib/policies";
import { PAGE_SIZE, type ImageResult } from "@/lib/types";
import { tileVerdict, veilFor, type VerdictTone } from "@/lib/veil";
import { formatYears } from "@/lib/years";

import { Shield } from "./Shield";
import { Info } from "./Tooltip";
import { cellsAcross, VeilFrame } from "./VeilFrame";

/** Tiles that load at once: about the first two rows. The rest of a page loads lazily. */
const EAGER_TILES = 8;

/** The file name alone; the folder is in the tile's tooltip and the detail view. */
function baseName(relPath: string): string {
  return relPath.split("/").pop() || relPath;
}

/** The youngest face's age (see `shownAge`), or, with no age, why: see `ageMissing`. */
function apparentAge(image: ImageResult, pending: readonly string[], faces: boolean): { text: string; title: string } {
  const shown = shownAge(image);
  if (shown) return { ...shown, title: setAgeTitle(image) ?? shown.title };
  const text = ageMissing(image, pending, faces);
  return { text, title: text === "no face" ? "No face detected, so no age estimate. MiVOLO reads a face." : text === "…" ? "Face detection is still running" : "No age recorded" };
}

export function PhotoGrid({
  images,
  reasons,
  scanId,
  page,
  pending,
  scanning = false,
  blur = DEFAULT_BLUR,
  sort,
  direction,
  ageFrom,
  ageTo,
  faceView = "all",
  shieldView = "all",
  facesRan = false,
  keepView,
  unfilteredCount,
  onSort,
  onDirection,
  onAge,
  onFaceView,
  onShieldView,
  onPage,
  onOpen,
  selected,
  onToggleSelected,
  onSelectAll,
  onSelectFlagged,
  onSelectShield,
  onDeleteSelected,
  deleteConfirm,
  deleting,
  deleteError,
  labels = null,
  deleteAny = false,
  deleteOff = null,
  policies = [],
  tag = null,
  tagOptions = [],
  onTag,
}: {
  images: ImageResult[];
  reasons: Map<string, string> | null;
  scanId: string;
  page: number;
  pending: readonly string[];
  /** The scan on screen is still running, so no keep set exists yet. */
  scanning?: boolean;
  blur?: BlurPolicy;
  sort: GridSort;
  direction: SortDirection;
  ageFrom: number | null;
  ageTo: number | null;
  /** Only the images with no detected face, or only those with one. */
  faceView?: FaceView;
  /** Face detection reported on this scan, so a frame with none says "no face" rather than "–". */
  facesRan?: boolean;
  /** What the sidebar's Display → View shows by the keep set; the grid only words its empty state by it. */
  keepView: KeepView;
  /** Images before the gallery age range. Zero means the view itself is empty. */
  unfilteredCount: number;
  onSort: (sort: GridSort) => void;
  onDirection: (direction: SortDirection) => void;
  onAge: (ageFrom: number | null, ageTo: number | null) => void;
  onFaceView?: (view: FaceView) => void;
  /** Hide tiles whose shield does not match. All keeps frames with no verdict. */
  shieldView?: ShieldView;
  onShieldView?: (view: ShieldView) => void;
  onPage: (page: number) => void;
  onOpen: (relPath: string) => void;
  selected: ReadonlySet<string>;
  onToggleSelected: (relPath: string) => void;
  onSelectAll: () => void;
  onSelectFlagged: () => void;
  /** Select tiles whose shield matches: determined fail, a disagreement, or determined pass. */
  onSelectShield?: (pick: ShieldPick) => void;
  onDeleteSelected: () => void;
  deleteConfirm: boolean;
  deleting: boolean;
  deleteError: string | null;
  /** Labels by rel_path. An override on a label picks the policy the blur follows for that image. */
  labels?: ReadonlyMap<string, ImageLabel> | null;
  /** The curator deletes any image in the scan (`delete_any` on /health), not only under-18 exposed ones. */
  deleteAny?: boolean;
  /** The static demo: Delete shows, disabled, with this reason. */
  deleteOff?: string | null;
  /** Policies the scan ran, official first: one shield each on every tile. */
  policies?: readonly string[];
  /** Cohort tag the gallery is narrowed to, and the tags present in this view. */
  tag?: string | null;
  tagOptions?: readonly string[];
  onTag?: (tag: string | null) => void;
}) {
  const pages = Math.max(1, Math.ceil(images.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const slice = images.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const flagged = images.filter((image) => isMinorExposed(image));
  const flaggedSelected = flagged.length > 0 && flagged.every((image) => selected.has(image.rel_path));
  const allSelected = images.length > 0 && images.every((image) => selected.has(image.rel_path));
  const deletableSelected = (deleteAny ? images : flagged).filter((image) => selected.has(image.rel_path)).length;
  const selectedHere = images.filter((image) => selected.has(image.rel_path)).length;
  const shieldOverride = (rel: string) => labels?.get(rel)?.override ?? null;
  const shieldCounts = Object.fromEntries(SHIELD_PICKS.map((pick) => [pick, pathsByShield(images, pick, shieldOverride).length])) as Record<ShieldPick, number>;
  const anyShield = SHIELD_PICKS.some((pick) => shieldCounts[pick] > 0);

  if (unfilteredCount === 0) {
    return <p className="text-text-secondary">Nothing in this view.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-lg border border-base-700 bg-base-800/40 p-2 text-caption text-text-secondary">
        {/* View changes what the grid shows; nothing here changes the keep set or the selection. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2" role="group" aria-label="View">
          <span className="flex w-14 items-center gap-1 font-semibold text-text-primary">
            View
            <Info text="What the grid shows and in what order. These narrow the grid only: the keep set, Download paths and Export do not change. All, Kept and Left out are in the sidebar under Display." />
          </span>
          <label className="flex items-center gap-1.5">
            Sort
            <select className={SELECT} value={sort} onChange={(event) => onSort(event.target.value as GridSort)}>
              <option value="scanned">As scanned</option>
              <option value="filename">File name</option>
              <option value="quality">Quality</option>
              <option value="nsfw">NudeNet score</option>
              <option value="policy">Policy</option>
              <option value="age">Age</option>
              <option value="pose">Head pose</option>
              <option value="cluster">Face cluster</option>
            </select>
            <button
              type="button"
              className="rounded-md border border-base-600 px-2 py-1 text-small text-text-primary"
              aria-label={direction === "desc" ? "Descending. Reverse sort." : "Ascending. Reverse sort."}
              title={direction === "desc" ? "Descending" : "Ascending"}
              onClick={() => onDirection(direction === "desc" ? "asc" : "desc")}
            >
              {direction === "desc" ? "↓" : "↑"}
            </button>
          </label>
          <label className="flex items-center gap-1.5">
            Age
            <input className={`w-14 ${SELECT}`} type="number" min={0} placeholder="from" aria-label="Youngest age from" value={ageFrom ?? ""} onChange={(event) => onAge(readAge(event.target.value), ageTo)} />
            <input className={`w-14 ${SELECT}`} type="number" min={0} placeholder="to" aria-label="Youngest age to" value={ageTo ?? ""} onChange={(event) => onAge(ageFrom, readAge(event.target.value))} />
          </label>
          {onFaceView ? (
            <label className="flex items-center gap-1.5">
              Faces
              <select className={SELECT} aria-label="Faces" value={faceView} onChange={(event) => onFaceView(event.target.value as FaceView)}>
                <option value="all">All</option>
                <option value="none">No face</option>
                <option value="some">With a face</option>
              </select>
            </label>
          ) : null}
          {onShieldView && (anyShield || shieldView !== "all") ? (
            <label className="flex items-center gap-1.5">
              Verdict
              <select className={SELECT} aria-label="Show by policy verdict" value={shieldView} onChange={(event) => onShieldView(event.target.value as ShieldView)}>
                <option value="all">All</option>
                {SHIELD_PICKS.map((pick) => (
                  <option key={pick} value={pick}>
                    {SHIELD_PICK_LABELS[pick]}
                  </option>
                ))}
              </select>
              <Info text={`Shows only tiles with this combined verdict. ${VERDICT_HELP} All also shows frames with no verdict.`} />
            </label>
          ) : null}
          {onTag && (tagOptions.length > 0 || tag) ? (
            <label className="flex items-center gap-1.5">
              Cohort
              <select className={SELECT} aria-label="Cohort tag" value={tag ?? ""} onChange={(event) => onTag(event.target.value === "" ? null : event.target.value)}>
                <option value="">All</option>
                {tag && !tagOptions.includes(tag) ? <option value={tag}>{tag}</option> : null}
                {tagOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        {/* Select ticks tiles for a batch action; it never hides anything. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-base-700 pt-2" role="group" aria-label="Select">
          <span className="flex w-14 items-center gap-1 font-semibold text-text-primary">
            Select
            <Info text="Ticks tiles for a batch action. Picks apply to the images in the current view; nothing is hidden." />
          </span>
          <span className="tabular-nums">{selectedHere} selected</span>
          {images.length > 0 ? (
            <button type="button" className={BUTTON} onClick={onSelectAll}>
              {allSelected ? "Clear" : `All in view (${images.length})`}
            </button>
          ) : null}
          {anyShield && onSelectShield ? (
            <label className="flex items-center gap-1.5">
              <select
                className={SELECT}
                aria-label="Select by policy verdict"
                value=""
                onChange={(event) => {
                  const pick = event.target.value as ShieldPick | "";
                  if (pick) onSelectShield(pick);
                }}
              >
                <option value="" disabled>
                  By verdict…
                </option>
                {SHIELD_PICKS.filter((pick) => shieldCounts[pick] > 0).map((pick) => (
                  <option key={pick} value={pick}>
                    {SHIELD_PICK_LABELS[pick]} ({shieldCounts[pick]})
                  </option>
                ))}
              </select>
              <Info text={`Ticks every tile in view with this combined verdict, replacing the selection. ${VERDICT_HELP}`} />
            </label>
          ) : null}
          {flagged.length > 0 ? (
            <span className="flex items-center gap-1.5">
              <button type="button" className={BUTTON} onClick={onSelectFlagged}>
                {flaggedSelected ? "Clear under-18" : `Under-18 exposed (${flagged.length})`}
              </button>
              <Info text="Frames MiVOLO (or the set age) puts under 18 with an exposed reading of at least 0.2. They are never kept or exported; delete is the only action for them." />
            </span>
          ) : null}
          {deleteAny || flagged.length > 0 ? (
            <span className="flex items-center gap-1.5">
              <button
                type="button"
                className="rounded-md border border-warning px-2 py-1 text-small text-warning disabled:opacity-40"
                disabled={deleteOff != null || deletableSelected === 0 || deleting}
                title={deleteOff ?? undefined}
                onClick={onDeleteSelected}
              >
                {deleting ? "Deleting…" : deleteConfirm ? `Confirm delete (${deletableSelected})` : `Delete selected (${deletableSelected})`}
              </button>
              <Info
                text={
                  deleteAny
                    ? "Deletes the selected files from the source folder and drops them from this scan. It asks once more before deleting, and cannot be undone."
                    : "Deletes the selected under-18 exposed files from the source folder. This curator deletes only those; update it to delete any image."
                }
              />
            </span>
          ) : null}
        </div>
      </div>
      {!deleteAny && selectedHere > deletableSelected ? <p className="text-caption text-text-muted">This curator deletes only under-18 exposed images.</p> : null}
      {deleteError ? <p className="text-caption text-warning">{deleteError}</p> : null}
      {images.length === 0 ? <p className="text-text-secondary">{tag ? `No image in this view carries the ${tag} tag.` : emptyView(keepView, ageFrom, ageTo, faceView, shieldView)}</p> : null}
      {/* Tiles are at least 12rem wide, whatever the sidebar leaves, so the quality · nude · age row never gets cut. Phones keep two across. */}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(12rem,1fr))]">
        {slice.map((image, index) => {
          const reason = reasons?.get(image.rel_path);
          const override = labels?.get(image.rel_path)?.override ?? null;
          const veil = veilFor(image, pending, blur, override);
          const source = frameFor(scanId, image.rel_path, veil, "tile");
          const checking = awaitingChecks(image, pending);
          const age = apparentAge(image, pending, facesRan);
          const deletable = isMinorExposed(image);
          const isSelected = selected.has(image.rel_path);
          const shields = policyShields(image, policies, override, pending.includes("guard"));
          const shieldRow =
            shields.length > 0 ? (
              <span className="flex shrink-0 items-center gap-0.5 rounded-md bg-base-900/80 px-1 py-0.5">
                {shields.map((shield) => (
                  <Shield key={shield.policy} state={shield.state} title={shield.title} className="h-4 w-4" />
                ))}
              </span>
            ) : null;
          const reasonPanel = veil != null && !checking;
          // Held and under-18 frames are rejects (danger); policy and NudeNet veils are flags the viewer may lift (warn).
          const panelTone = veil?.kind === "held" || veil?.kind === "minor" ? "veil-reason--held" : "veil-reason--veiled";
          const verdict = checking ? null : tileVerdict(image, reason, veil);
          return (
            <li key={image.rel_path} className="relative">
              <label className="absolute top-2 left-2 z-10 flex items-center gap-1 rounded-md bg-base-800/90 px-1.5 py-1 text-caption text-text-secondary">
                <input
                  type="checkbox"
                  className={`h-5 w-5 ${deletable ? "accent-warning" : "accent-accent-primary"}`}
                  checked={isSelected}
                  aria-label={deletable ? "Select for delete" : "Select"}
                  onChange={() => onToggleSelected(image.rel_path)}
                />
                {deletable ? "Delete" : null}
              </label>
              <button
                type="button"
                className={`w-full overflow-hidden rounded-lg border bg-base-800 text-left hover:border-accent-primary ${isSelected && deletable ? "border-warning" : isSelected ? "border-accent-primary" : "border-base-700"}`}
                onClick={() => onOpen(image.rel_path)}
              >
                <span className="relative block">
                  {/* A veiled tile never loads its thumbnail: it shows the mosaic (lib/veil.ts). */}
                  {source.kind === "image" ? (
                    // Thumbnails are already resized by the curator.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={source.url} alt="" loading={index < EAGER_TILES ? undefined : "lazy"} decoding="async" className="aspect-square w-full object-cover" />
                  ) : (
                    <VeilFrame source={source} fit="cover" across={cellsAcross(source.cells, image.width, image.height, "cover")} className="aspect-square w-full" />
                  )}
                  {/* The selection outcome: Keep, Held, Veiled · Keep, or Left out (a veiled one says why on the panel). Top right, clear of the checkbox. */}
                  {verdict ? (
                    <span className={`dh-badge absolute top-2 right-2 ${CHIP[verdict.tone]}`} title={verdict.title}>
                      {verdict.chip}
                    </span>
                  ) : null}
                  {/* A frame still waiting on checks says so; the others carry a chip naming why they are veiled. */}
                  {checking ? (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="rounded-md bg-base-900/75 px-2 py-1 text-caption text-text-secondary">Scanning…</span>
                    </span>
                  ) : null}
                  {/* One shield per policy the scan ran; hover one for the policy and the rules it fired. */}
                  {shieldRow != null && !reasonPanel ? <span className="absolute right-1.5 bottom-1.5">{shieldRow}</span> : null}
                  {/* A veiled tile says why on the frosted frame itself, in full: the row under it has no room. */}
                  {reasonPanel ? (
                    <span className={`veil-reason ${panelTone}`}>
                      <span className="veil-reason-text">{veil!.short}</span>
                      {shieldRow}
                    </span>
                  ) : null}
                </span>
                <span className="block p-2 text-caption">
                  <span className="block truncate text-text-secondary" title={image.rel_path}>
                    {baseName(image.rel_path)}
                  </span>
                  {/* Three short columns, label over value, so the age fits a phone's two-across tile. */}
                  <span className="mt-1 grid grid-cols-3 gap-x-2 tabular-nums">
                    <span className="flex min-w-0 flex-col">
                      <span className="text-text-muted">quality</span>
                      <span>{image.score.toFixed(2)}</span>
                    </span>
                    <span className="flex min-w-0 flex-col" title="NudeNet exposed score">
                      <span className="text-text-muted">nude</span>
                      <span>{image.nsfw ? image.nsfw.exposed_score.toFixed(2) : checking ? "…" : "–"}</span>
                    </span>
                    <span className="flex min-w-0 flex-col" title={age.title}>
                      <span className="text-text-muted">age</span>
                      <span className={`break-words ${age.text === "no face" ? "text-text-muted" : ""}`}>{age.text}</span>
                    </span>
                  </span>
                  {/* A left-out frame's reason in plain words; the chip's tooltip adds the curator's own. */}
                  {verdict?.line ? <span className="mt-1 block line-clamp-2 break-words text-text-secondary">{verdict.line}</span> : null}
                  {verdict == null && !checking && veil == null && reasons == null && !scanning ? <span className="mt-1 block text-text-muted">Selecting…</span> : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center gap-3 text-small">
        <button type="button" className="rounded-md border border-base-600 px-3 py-1 disabled:opacity-40" disabled={current <= 1} onClick={() => onPage(current - 1)}>
          Previous
        </button>
        <span className="text-text-secondary">
          Page {current} of {pages}
        </span>
        <button type="button" className="rounded-md border border-base-600 px-3 py-1 disabled:opacity-40" disabled={current >= pages} onClick={() => onPage(current + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}

/** Verdict chip colours (globals.css), all on the shared dh-badge. */
const CHIP: Record<VerdictTone, string> = { keep: "verdict-chip--keep", held: "verdict-chip--held", veiled: "verdict-chip--veiled", "left-out": "" };
const SELECT = "rounded-md border border-base-600 bg-base-900 px-2 py-1 text-small text-text-primary";
const BUTTON = "rounded-md border border-base-600 px-2 py-1 text-small text-text-primary";
const VERDICT_HELP =
  "Unsafe: the official policy (or the label's override) flagged, whatever the variants said. Safe: it passed. Split: the policies disagreed, so Split overlaps both.";

function emptyView(keepView: KeepView, ageFrom: number | null, ageTo: number | null, faceView: FaceView = "all", shieldView: ShieldView = "all"): string {
  const which = keepView === "kept" ? "kept image" : keepView === "left-out" ? "left-out image" : "image";
  if (faceView === "none") return `No ${which} without a face in this view.`;
  if (faceView === "some") return `No ${which} with a face in this view.`;
  if (shieldView !== "all" && (ageFrom != null || ageTo != null)) {
    return `No ${which} matches this shield and the other filters.`;
  }
  if (shieldView === "unsafe") return `No ${which} with an unsafe shield in this view.`;
  if (shieldView === "split") return `No ${which} whose policies disagreed in this view.`;
  if (shieldView === "safe") return `No ${which} with a safe shield in this view.`;
  if (ageFrom != null || ageTo != null || keepView !== "all") return keepView === "all" ? "No image in this age range." : `No ${which} in this view.`;
  return "No image in this age range.";
}

/** Why the tile says "set": no face of its own, and the scan found one subject across the folder. */
export function setAgeTitle(image: Pick<ImageResult, "set_age" | "primary_face_attributes" | "faces">): string | null {
  if (!usesSetAge(image) || !image.set_age) return null;
  const { years, faces, cluster_id, share } = image.set_age;
  return `No face in this frame. The set's age: median ${formatYears(years)} years over ${faces} MiVOLO faces in ${cluster_id} (${Math.round(share * 100)}% of the scan's faces). An inference about the set, not a reading of this frame.`;
}

function readAge(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}
