"use client";

import type { ReactNode } from "react";

import { contentRatingAvailable, detectorGroups, policyAvailable } from "@/lib/detectors";
import { guardRuleLabel, nudeNetLabel, ratingCounts, recordedGuardRules } from "@/lib/moderation";
import { checkStage, checkStageNote } from "@/lib/progress";
import { recordedScenes, type FilterAvailability } from "@/lib/select";
import {
  AGE_BRACKETS,
  CONTENT_RATINGS,
  ENVIRONMENTS,
  NUDENET_LABELS,
  GARMENTS,
  GENDERS,
  GUARD_RULES,
  POSES,
  poseLabel,
  slugLabel,
  type Detectors,
  type FilterState,
  type Progress,
  type ScanSummary,
} from "@/lib/types";
import { clusterLabel, toggleValue } from "@/lib/urlState";

const APPEARANCE =
  "Gender and age are appearance guesses from MiVOLO, not facts about a person. The age bracket is read off MiVOLO's years.";

function CheckList<T extends string>({
  options,
  selected,
  label,
  counts,
  onToggle,
}: {
  options: readonly T[];
  selected: readonly T[];
  label: (value: T) => string;
  counts?: Partial<Record<T, number>>;
  onToggle: (value: T) => void;
}) {
  if (options.length === 0) return <p className="text-caption text-text-muted">Nothing recorded in this scan.</p>;
  return (
    <ul className="max-h-36 space-y-1 overflow-auto pr-1">
      {options.map((option) => (
        <li key={option}>
          <label className="flex items-center gap-2 text-small">
            <input type="checkbox" checked={selected.includes(option)} onChange={() => onToggle(option)} />
            <span className="capitalize">
              {label(option)}
              {counts?.[option] != null ? ` (${counts[option]})` : ""}
            </span>
          </label>
        </li>
      ))}
    </ul>
  );
}

function Group({ title, hint, children }: { title: string; hint: string | null; children?: ReactNode }) {
  return (
    <fieldset disabled={hint !== null} className="space-y-2 border-t border-base-700 pt-3">
      <legend className="font-display text-small font-semibold">{title}</legend>
      {hint ? <p className="text-caption text-text-muted">{hint}</p> : children}
    </fieldset>
  );
}

function RangeField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block text-small">
      <span className="flex justify-between">
        {label}
        <span className="text-text-secondary">{value.toFixed(2)}</span>
      </span>
      <input
        className="w-full"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

export function Filters({
  filter,
  detectors,
  summary,
  gates,
  faceNames,
  onChange,
  unblurNsfw,
  onUnblurNsfw,
  live,
}: {
  filter: FilterState;
  detectors: Detectors | null;
  summary: ScanSummary | null;
  gates: FilterAvailability;
  faceNames: Record<string, string>;
  onChange: (patch: Partial<FilterState>) => void;
  unblurNsfw: boolean;
  onUnblurNsfw: (unblurNsfw: boolean) => void;
  /** The scan on screen is still running: its phases on the bar and the checks it says are pending. */
  live: { phases: readonly Progress[]; pending: readonly string[] } | null;
}) {
  // A running scan's summary is partial and records no check as run yet, so say where the scan is instead.
  const liveNote = (...checks: string[]): string | null => (live ? checkStageNote(checkStage(checks, live.phases, live.pending)) : null);
  const groups = detectors ? detectorGroups(detectors) : [];
  const missing = (id: (typeof groups)[number]["id"]) => groups.find((group) => group.id === id);
  const blocked = (ready: boolean | undefined, ran: boolean, id: (typeof groups)[number]["id"], checks: string[]): string | null => {
    if (!detectors) return "Waiting for detector status.";
    if (!ready) return missing(id)?.hint ?? "This model is not loaded.";
    if (live) return liveNote(...checks);
    if (summary && !ran) return "This scan did not run it. Scan again to record it.";
    return null;
  };
  const scenes = recordedScenes(summary);
  const clusters = summary?.face_clusters.map((cluster) => cluster.cluster_id) ?? [];

  return (
    <section className="space-y-3">
      <h2 className="font-display text-small font-semibold">Filters</h2>
      <RangeField label="Quality score" value={filter.minScore} min={0} max={1} step={0.05} onChange={(minScore) => onChange({ minScore })} />
      <p className="text-caption text-text-muted">Curator quality score, from sharpness, resolution, and artifacts. NudeNet score is separate and does not move this slider.</p>
      <label className="flex items-center gap-2 text-small">
        <input type="checkbox" checked={unblurNsfw} onChange={(event) => onUnblurNsfw(event.target.checked)} />
        Unblur NSFW
      </label>
      <p className="text-caption text-text-muted">Shows frames hidden by the NudeNet score or a policy verdict. A MiVOLO age under 18 stays blurred, and so does a frame the scan has not finished checking.</p>
      <label className="flex items-center gap-2 text-small">
        <input type="checkbox" checked={filter.includeRejected} onChange={(event) => onChange({ includeRejected: event.target.checked })} />
        Keep hard rejects
      </label>
      <p className="text-caption text-text-muted">Adds images that failed blur, size, or aspect to the keep set when they pass the other filters. Show, on the grid, hides kept or left-out frames without changing this.</p>
      <label className="flex items-center gap-2 text-small">
        <input type="checkbox" checked={filter.keepSimilar} onChange={(event) => onChange({ keepSimilar: event.target.checked })} />
        Keep near-duplicates
      </label>
      <p className="text-caption text-text-muted">Adds near-duplicate frames to the keep set. It does not hide them in the grid.</p>

      <Group title="People" hint={blocked(missing("insightface")?.ready, summary?.faces_config.enabled ?? true, "insightface", ["faces", "identities"])}>
        <p className="text-caption text-text-muted">Face cluster</p>
        <CheckList
          options={clusters}
          selected={filter.faceClusters}
          label={(id) => clusterLabel(id, faceNames)}
          onToggle={(id) => onChange({ faceClusters: toggleValue(filter.faceClusters, id) })}
        />
        <p className="text-caption text-text-muted">Head pose</p>
        <CheckList
          options={POSES}
          selected={filter.facePoses}
          label={poseLabel}
          onToggle={(pose) => onChange({ facePoses: toggleValue(filter.facePoses, pose) })}
        />
      </Group>

      <Group title="Appearance" hint={blocked(missing("mivolo")?.ready, summary?.faces_config.mivolo ?? true, "mivolo", ["faces"])}>
        <p className="text-caption text-text-secondary">{APPEARANCE}</p>
        <p className="text-caption text-text-muted">Gender</p>
        <CheckList
          options={GENDERS}
          selected={filter.faceGenders}
          label={(gender) => gender}
          onToggle={(gender) => onChange({ faceGenders: toggleValue(filter.faceGenders, gender) })}
        />
        <p className="text-caption text-text-muted">Age bracket</p>
        <CheckList options={AGE_BRACKETS} selected={filter.faceAges} label={(age) => age} onToggle={(age) => onChange({ faceAges: toggleValue(filter.faceAges, age) })} />
        {gates.mivolo ? (
          <div className="grid grid-cols-2 gap-2">
            <label className="text-caption">
              Min years
              <input
                className="mt-1 w-full rounded-md border border-base-600 bg-base-900 px-2 py-1"
                type="number"
                min={0}
                value={filter.minAgeYears ?? ""}
                onChange={(event) => onChange({ minAgeYears: event.target.value === "" ? null : Number(event.target.value) })}
              />
            </label>
            <label className="text-caption">
              Max years
              <input
                className="mt-1 w-full rounded-md border border-base-600 bg-base-900 px-2 py-1"
                type="number"
                min={0}
                value={filter.maxAgeYears ?? ""}
                onChange={(event) => onChange({ maxAgeYears: event.target.value === "" ? null : Number(event.target.value) })}
              />
            </label>
          </div>
        ) : (
          <p className="text-caption text-text-muted">
            {live
              ? liveNote("faces")
              : summary && detectors?.mivolo && !summary.faces_config.mivolo
              ? "This scan did not run MiVOLO. Scan again to record it."
              : missing("mivolo")?.hint}
          </p>
        )}
        <RangeField
          label="Attribute confidence"
          value={filter.minAttributeConf}
          min={0}
          max={1}
          step={0.05}
          onChange={(minAttributeConf) => onChange({ minAttributeConf })}
        />
      </Group>

      <Group title="Places365" hint={blocked(missing("places365")?.ready, summary?.scenes_config.enabled ?? true, "places365", ["scenes"])}>
        <CheckList options={scenes} selected={filter.scenes} label={(scene) => scene} onToggle={(scene) => onChange({ scenes: toggleValue(filter.scenes, scene) })} />
        <CheckList
          options={ENVIRONMENTS}
          selected={filter.sceneEnvironments}
          label={(environment) => environment}
          onToggle={(environment) => onChange({ sceneEnvironments: toggleValue(filter.sceneEnvironments, environment) })}
        />
        <RangeField label="Scene confidence" value={filter.minSceneConf} min={0} max={1} step={0.05} onChange={(minSceneConf) => onChange({ minSceneConf })} />
      </Group>

      <Group title="Fashionpedia" hint={blocked(missing("garments")?.ready, summary?.garments_config.enabled ?? true, "garments", ["garments"])}>
        <p className="text-caption text-text-muted">Garment present</p>
        <CheckList
          options={GARMENTS}
          selected={filter.garments}
          label={slugLabel}
          onToggle={(garment) => onChange({ garments: toggleValue(filter.garments, garment) })}
        />
        <p className="text-caption text-text-muted">Garment excluded</p>
        <CheckList
          options={GARMENTS}
          selected={filter.excludeGarments}
          label={slugLabel}
          onToggle={(garment) => onChange({ excludeGarments: toggleValue(filter.excludeGarments, garment) })}
        />
        <label className="flex items-center gap-2 text-small">
          <input
            type="checkbox"
            checked={filter.garmentsUncropped}
            onChange={(event) => onChange({ garmentsUncropped: event.target.checked })}
          />
          Uncropped only
        </label>
        <RangeField
          label="Garment confidence"
          value={filter.minGarmentConf}
          min={0}
          max={1}
          step={0.05}
          onChange={(minGarmentConf) => onChange({ minGarmentConf })}
        />
      </Group>

      {detectors && (contentRatingAvailable(detectors) || summary?.nsfw_config?.enabled === true) ? (
        <Group
          title="NudeNet"
          hint={
            live
              ? liveNote("nsfw")
              : summary?.nsfw_config?.enabled === true
              ? null
              : summary
                ? "This scan did not run NudeNet. Scan again to record it."
                : "Scan a folder to record NudeNet scores."
          }
        >
          <p className="text-caption text-text-secondary">
            Drops an image when the highest score among the checked classes is at or above the threshold. An equal score counts, and an image NudeNet did not check is dropped too. The first five are the usual exposed set; the rest are faces, covered parts, and other exposed areas.
          </p>
          <p className="text-caption text-text-muted">Content rating</p>
          <CheckList
            options={CONTENT_RATINGS}
            selected={filter.contentRatings}
            counts={ratingCounts(summary?.results ?? [])}
            label={(rating) => rating}
            onToggle={(rating) => onChange({ contentRatings: toggleValue(filter.contentRatings, rating) })}
          />
          <p className="text-caption text-text-muted">
            Explicit is an exposed class at 0.2 or above; suggestive is a covered intimate class without that; safe is neither. An image NudeNet did not check is dropped once a rating is selected.
          </p>
          <label className="flex items-center gap-2 text-small">
            <input
              type="checkbox"
              checked={filter.nsfwThreshold != null}
              onChange={(event) => onChange({ nsfwThreshold: event.target.checked ? 0.5 : null })}
            />
            Drop exposed nudity
          </label>
          {filter.nsfwThreshold != null ? (
            <>
              <RangeField
                label="NudeNet score"
                value={filter.nsfwThreshold}
                min={0.2}
                max={1}
                step={0.05}
                onChange={(nsfwThreshold) => onChange({ nsfwThreshold })}
              />
              <p className="text-caption text-text-muted">Classes in the score</p>
              <CheckList
                options={NUDENET_LABELS}
                selected={filter.nsfwExposedLabels}
                label={nudeNetLabel}
                onToggle={(label) => {
                  const next = toggleValue(filter.nsfwExposedLabels, label);
                  if (next.length > 0) onChange({ nsfwExposedLabels: next });
                }}
              />
            </>
          ) : null}
        </Group>
      ) : null}

      {detectors && (policyAvailable(detectors) || summary?.guard_config?.enabled === true) ? (
        <Group
          title="SingGuard"
          hint={
            live
              ? liveNote("guard")
              : summary?.guard_config?.enabled === true
              ? null
              : summary
                ? "This scan did not run SingGuard. Scan again to record it."
                : "Scan a folder to record SingGuard verdicts."
          }
        >
          <p className="text-caption text-text-secondary">
            A verdict, not a score. Dropping every unsafe image ignores the rule list. With only rules selected, an unsafe image whose rules are all unlisted stays, and one that names no rule is dropped.
          </p>
          <label className="flex items-center gap-2 text-small">
            <input
              type="checkbox"
              checked={filter.guardUnsafe}
              onChange={(event) => onChange({ guardUnsafe: event.target.checked, guardRules: event.target.checked ? [] : filter.guardRules })}
            />
            Drop every unsafe verdict
          </label>
          <p className="text-caption text-text-muted">Rules</p>
          <CheckList
            options={[...GUARD_RULES.map((rule) => rule.id), ...recordedGuardRules(summary, GUARD_RULES.map((rule) => rule.id))]}
            selected={filter.guardRules}
            label={(id) => guardRuleLabel(id, summary)}
            onToggle={(rule) => onChange({ guardUnsafe: false, guardRules: toggleValue(filter.guardRules, rule) })}
          />
        </Group>
      ) : null}
    </section>
  );
}
