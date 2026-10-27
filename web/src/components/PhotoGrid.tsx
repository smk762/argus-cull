"use client";

import { attributeLine } from "@/lib/attributes";
import { thumbUrl } from "@/lib/api";
import { awaitingChecks, DEFAULT_BLUR, isMinorExposed, shouldBlur, youngestAge, type BlurPolicy, type GridSort, type KeepView, type SortDirection } from "@/lib/chunks";
import { EXPECT_LABELS, type ImageLabel } from "@/lib/labels";
import { dissentingPolicies, effectiveUnsafe } from "@/lib/policies";
import { PAGE_SIZE, RACES, slugLabel, type FaceRace, type ImageResult } from "@/lib/types";

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
  race,
  keepView,
  keptCount,
  leftOutCount,
  unfilteredCount,
  onSort,
  onDirection,
  onAge,
  onRace,
  onKeepView,
  onPage,
  onOpen,
  selected,
  onToggleSelected,
  onSelectAll,
  onSelectFlagged,
  onDeleteSelected,
  deleteConfirm,
  deleting,
  deleteError,
  labels = null,
  tag = null,
  tagOptions = [],
  onTag,
  tags = null,
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
  race: FaceRace | null;
  keepView: KeepView;
  /** Null until the keep set has been calculated. */
  keptCount: number | null;
  leftOutCount: number | null;
  /** Images before the gallery age range. Zero means the view itself is empty. */
  unfilteredCount: number;
  onSort: (sort: GridSort) => void;
  onDirection: (direction: SortDirection) => void;
  onAge: (ageFrom: number | null, ageTo: number | null) => void;
  onRace: (race: FaceRace | null) => void;
  onKeepView: (view: KeepView) => void;
  onPage: (page: number) => void;
  onOpen: (relPath: string) => void;
  selected: ReadonlySet<string>;
  onToggleSelected: (relPath: string) => void;
  onSelectAll: () => void;
  onSelectFlagged: () => void;
  onDeleteSelected: () => void;
  deleteConfirm: boolean;
  deleting: boolean;
  deleteError: string | null;
  /** Labels by rel_path. An override on a label picks the policy the blur follows for that image. */
  labels?: ReadonlyMap<string, ImageLabel> | null;
  /** Cohort tag the gallery is narrowed to, and the tags present in this view. */
  tag?: string | null;
  tagOptions?: readonly string[];
  onTag?: (tag: string | null) => void;
  /** Effective cohort tags by rel_path. */
  tags?: ReadonlyMap<string, readonly string[]> | null;
}) {
  const pages = Math.max(1, Math.ceil(images.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const slice = images.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const flagged = images.filter((image) => isMinorExposed(image));
  const flaggedSelected = flagged.length > 0 && flagged.every((image) => selected.has(image.rel_path));
  const allSelected = images.length > 0 && images.every((image) => selected.has(image.rel_path));
  const deletableSelected = flagged.filter((image) => selected.has(image.rel_path)).length;
  const selectedHere = images.filter((image) => selected.has(image.rel_path)).length;

  if (unfilteredCount === 0) {
    return <p className="text-text-secondary">Nothing in this view.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 text-caption text-text-secondary">
        <div className="flex items-center gap-2" role="group" aria-label="Show">
          Show
          <ShowButton current={keepView} view="all" label="All" onKeepView={onKeepView} />
          <ShowButton current={keepView} view="kept" label={keptCount == null ? "Kept" : `Kept (${keptCount})`} disabled={keptCount == null} onKeepView={onKeepView} />
          <ShowButton current={keepView} view="left-out" label={leftOutCount == null ? "Left out" : `Left out (${leftOutCount})`} disabled={leftOutCount == null} onKeepView={onKeepView} />
        </div>
        <label className="flex items-center gap-2">
          Sort
          <select
            className="rounded-md border border-base-600 bg-base-900 px-2 py-1 text-small text-text-primary"
            value={sort}
            onChange={(event) => onSort(event.target.value as GridSort)}
          >
            <option value="scanned">As scanned</option>
            <option value="nsfw">NudeNet score</option>
            <option value="policy">Policy</option>
            <option value="age">Age</option>
            <option value="race">Race</option>
          </select>
        </label>
        <button
          type="button"
          className="rounded-md border border-base-600 px-2 py-1 text-small text-text-primary"
          aria-label={direction === "desc" ? "Descending. Reverse sort." : "Ascending. Reverse sort."}
          onClick={() => onDirection(direction === "desc" ? "asc" : "desc")}
        >
          {direction === "desc" ? "↓" : "↑"}
        </button>
        <label className="flex items-center gap-2">
          Age
          <input
            className="w-16 rounded-md border border-base-600 bg-base-900 px-2 py-1 text-small text-text-primary"
            type="number"
            min={0}
            placeholder="from"
            aria-label="Youngest age from"
            value={ageFrom ?? ""}
            onChange={(event) => onAge(readAge(event.target.value), ageTo)}
          />
          <input
            className="w-16 rounded-md border border-base-600 bg-base-900 px-2 py-1 text-small text-text-primary"
            type="number"
            min={0}
            placeholder="to"
            aria-label="Youngest age to"
            value={ageTo ?? ""}
            onChange={(event) => onAge(ageFrom, readAge(event.target.value))}
          />
        </label>
        <label className="flex items-center gap-2">
          Race
          <select
            className="rounded-md border border-base-600 bg-base-900 px-2 py-1 text-small text-text-primary"
            aria-label="Race"
            value={race ?? ""}
            onChange={(event) => onRace(event.target.value === "" ? null : (event.target.value as FaceRace))}
          >
            <option value="">All</option>
            {RACES.map((option) => (
              <option key={option} value={option}>
                {slugLabel(option)}
              </option>
            ))}
          </select>
        </label>
        {onTag && (tagOptions.length > 0 || tag) ? (
          <label className="flex items-center gap-2">
            Cohort
            <select
              className="rounded-md border border-base-600 bg-base-900 px-2 py-1 text-small text-text-primary"
              aria-label="Cohort tag"
              value={tag ?? ""}
              onChange={(event) => onTag(event.target.value === "" ? null : event.target.value)}
            >
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
        {images.length > 0 ? (
          <button type="button" className="rounded-md border border-base-600 px-2 py-1 text-small text-text-primary" onClick={onSelectAll}>
            {allSelected ? "Clear" : `Select all (${images.length})`}
          </button>
        ) : null}
        {flagged.length > 0 ? (
          <>
            <button type="button" className="rounded-md border border-base-600 px-2 py-1 text-small text-text-primary" onClick={onSelectFlagged}>
              {flaggedSelected ? "Clear flagged" : `Select flagged (${flagged.length})`}
            </button>
            <button
              type="button"
              className="rounded-md border border-warning px-2 py-1 text-small text-warning disabled:opacity-40"
              disabled={deletableSelected === 0 || deleting}
              onClick={onDeleteSelected}
            >
              {deleting ? "Deleting…" : deleteConfirm ? `Confirm delete (${deletableSelected})` : `Delete selected (${deletableSelected})`}
            </button>
          </>
        ) : null}
      </div>
      {selectedHere > deletableSelected ? <p className="text-caption text-text-muted">Only under-18 exposed images can be deleted.</p> : null}
      {deleteError ? <p className="text-caption text-warning">{deleteError}</p> : null}
      {images.length === 0 ? <p className="text-text-secondary">{tag ? `No image in this view carries the ${tag} tag.` : emptyView(keepView, race, ageFrom, ageTo)}</p> : null}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {slice.map((image) => {
          const reason = reasons?.get(image.rel_path);
          const attrs = attributeLine(image.primary_face_attributes);
          const youngest = youngestAge(image);
          const kept = reason === "";
          const label = labels?.get(image.rel_path) ?? null;
          const imageTags = tags?.get(image.rel_path) ?? [];
          const blurred = shouldBlur(image, pending, blur, label?.override ?? null);
          const unsafe = effectiveUnsafe(image, label?.override ?? null);
          const dissent = dissentingPolicies(image);
          const checking = awaitingChecks(image, pending);
          const deletable = isMinorExposed(image);
          const isSelected = selected.has(image.rel_path);
          return (
            <li key={image.rel_path} className="relative">
              <label className="absolute top-2 left-2 z-10 flex items-center gap-1 rounded-md bg-base-800/90 px-1.5 py-1 text-caption text-text-secondary">
                <input
                  type="checkbox"
                  className={deletable ? "accent-warning" : "accent-accent-primary"}
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
                  {/* Thumbnails are already resized by the curator. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={thumbUrl(scanId, image.rel_path)}
                    alt=""
                    className={`aspect-square w-full object-cover ${blurred ? "scale-110 blur-2xl" : ""}`}
                  />
                  {checking || blurred ? (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="rounded-md bg-base-900/75 px-2 py-1 text-caption text-text-secondary">{checking ? "Scanning…" : "Blurred"}</span>
                    </span>
                  ) : null}
                </span>
                <span className="block space-y-1 p-2">
                  <span className="block truncate text-caption text-text-secondary">{image.rel_path}</span>
                  <span className="block text-caption text-text-muted">quality {image.score.toFixed(2)}</span>
                  {image.nsfw ? (
                    <span className="block text-caption text-text-muted">NudeNet {image.nsfw.exposed_score.toFixed(2)}</span>
                  ) : null}
                  {unsafe != null ? (
                    <span className={`block text-caption ${unsafe ? "text-warning" : "text-text-muted"}`}>
                      {unsafe ? "policy issue" : "policy safe"}
                      {dissent.length > 0 ? ` · ${dissent.join(", ")}` : ""}
                    </span>
                  ) : null}
                  {label?.expect ? (
                    <span className="block text-caption text-accent-tertiary">
                      label {EXPECT_LABELS[label.expect].label.toLowerCase()}
                      {label.proxy ? " · proxy" : ""}
                    </span>
                  ) : null}
                  {imageTags.length > 0 ? <span className="block truncate text-caption text-text-muted">{imageTags.join(", ")}</span> : null}
                  {reasons ? (
                    <span className={`block text-caption ${kept ? "text-success" : "text-warning"}`}>{kept ? "keep" : reason}</span>
                  ) : scanning ? null : (
                    <span className="block text-caption text-text-muted">Selecting…</span>
                  )}
                  {attrs ? <span className="block truncate text-caption text-text-muted">{attrs}</span> : null}
                  {youngest != null && (image.primary_face_attributes?.age_years == null || youngest < image.primary_face_attributes.age_years) ? (
                    <span className="block text-caption text-text-muted">youngest {Math.round(youngest)}y</span>
                  ) : null}
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

function ShowButton({
  current,
  view,
  label,
  disabled,
  onKeepView,
}: {
  current: KeepView;
  view: KeepView;
  label: string;
  disabled?: boolean;
  onKeepView: (view: KeepView) => void;
}) {
  return (
    <button
      type="button"
      className={`rounded-md border px-2 py-1 text-small ${current === view ? "border-accent-primary text-text-primary" : "border-base-600 text-text-primary"} disabled:opacity-40`}
      aria-pressed={current === view}
      disabled={disabled}
      onClick={() => onKeepView(view)}
    >
      {label}
    </button>
  );
}

function emptyView(keepView: KeepView, race: FaceRace | null, ageFrom: number | null, ageTo: number | null): string {
  const which = keepView === "kept" ? "kept image" : keepView === "left-out" ? "left-out image" : "image";
  if (race && (ageFrom != null || ageTo != null)) return `No ${which} matches this race and age range.`;
  if (race) return `No ${which} of this race.`;
  if (ageFrom != null || ageTo != null || keepView !== "all") return keepView === "all" ? "No image in this age range." : `No ${which} in this view.`;
  return "No image in this age range.";
}

function readAge(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}
