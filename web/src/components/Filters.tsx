"use client";

import { useMemo, type ReactNode } from "react";

import { contentRatingAvailable, detectorGroups, policyAvailable } from "@/lib/detectors";
import { guardRuleCounts, guardRuleLabel, nudeNetLabel, ratingCounts, recordedGuardRules } from "@/lib/moderation";
import { checkStage, checkStageNote } from "@/lib/progress";
import { facetCounts, recordedScenes, type FilterAvailability } from "@/lib/select";
import {
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
import { clearedFilter, clusterLabel, isDefaultFilter, toggleValue } from "@/lib/urlState";

import { Info, Tooltip } from "./Tooltip";

const APPEARANCE = "Gender and age are appearance guesses from MiVOLO, not facts about a person. Min and max years read MiVOLO's age for each face.";

function CheckList<T extends string>({
  options,
  selected,
  label,
  counts,
  hideEmpty = false,
  onToggle,
}: {
  options: readonly T[];
  selected: readonly T[];
  label: (value: T) => string;
  counts?: Partial<Record<T, number>> | ReadonlyMap<string, number>;
  /** Only list options with a match (or already ticked), so a long vocabulary shows what this scan holds. */
  hideEmpty?: boolean;
  onToggle: (value: T) => void;
}) {
  const count = (option: T): number | undefined => (counts instanceof Map ? counts.get(option) : (counts as Partial<Record<T, number>> | undefined)?.[option]);
  const shown = hideEmpty ? options.filter((option) => (count(option) ?? 0) > 0 || selected.includes(option)) : options;
  if (shown.length === 0) return <p className="text-caption text-text-muted">Nothing recorded in this scan.</p>;
  return (
    <ul className="max-h-36 space-y-1 overflow-auto pr-1">
      {shown.map((option) => (
        <li key={option}>
          <label className="flex items-center gap-2 text-small">
            <input type="checkbox" checked={selected.includes(option)} onChange={() => onToggle(option)} />
            <span className="capitalize">
              {label(option)}
              {count(option) != null ? ` (${count(option)})` : ""}
            </span>
          </label>
        </li>
      ))}
    </ul>
  );
}

function Group({ title, hint, info, children }: { title: string; hint: string | null; info?: string; children?: ReactNode }) {
  return (
    <fieldset disabled={hint !== null} className="space-y-2 border-t border-base-700 pt-3">
      <legend className="flex items-center gap-1.5 font-display text-small font-semibold">
        {title}
        {info ? <Info text={info} /> : null}
      </legend>
      {hint ? <p className="text-caption text-text-muted">{hint}</p> : children}
    </fieldset>
  );
}

function RangeField({
  label,
  info,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  info?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block text-small">
      <span className="flex items-center justify-between gap-1.5">
        <span className="flex items-center gap-1.5">
          {label}
          {info ? <Info text={info} /> : null}
        </span>
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

function Toggle({ label, info, checked, disabled = false, onChange }: { label: string; info: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void }) {
  return (
    <div className={`flex items-center gap-1.5 text-small ${disabled ? "opacity-50" : ""}`}>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
        {label}
      </label>
      <Info text={info} />
    </div>
  );
}

function Caption({ text, info }: { text: string; info?: string }) {
  return (
    <p className="flex items-center gap-1.5 text-caption text-text-muted">
      {text}
      {info ? <Info text={info} /> : null}
    </p>
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
  hideRejected,
  hideRejectedReady,
  onHideRejected,
  policies = [],
  policyFlags,
  policiesOff = [],
  onPoliciesOff,
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
  /** Grid only: hide every image the keep set leaves out. Mirrors Show → Kept on the grid. */
  hideRejected: boolean;
  /** The keep set has been calculated, so there is something to hide by. */
  hideRejectedReady: boolean;
  onHideRejected: (hideRejected: boolean) => void;
  /** Every policy the scan ran, official first, and how many images each flagged. */
  policies?: readonly string[];
  policyFlags?: ReadonlyMap<string, number>;
  /** Policies switched off: their verdicts leave the blur, shields, counts, keep set and run stats. */
  policiesOff?: readonly string[];
  onPoliciesOff?: (off: string[]) => void;
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
  const clusterCounts = new Map(summary?.face_clusters.map((cluster) => [cluster.cluster_id, cluster.size]) ?? []);
  const poseCounts = new Map<string, number>();
  for (const image of summary?.results ?? []) if (image.primary_face_pose) poseCounts.set(image.primary_face_pose, (poseCounts.get(image.primary_face_pose) ?? 0) + 1);
  // Every verdict's explanation is read for these, so only once per scan, not on every render of the sidebar.
  const { ruleOptions, ruleCounts } = useMemo(() => {
    const options = [...GUARD_RULES.map((rule) => rule.id), ...recordedGuardRules(summary, GUARD_RULES.map((rule) => rule.id))];
    return { ruleOptions: options, ruleCounts: guardRuleCounts(summary?.results ?? [], options) };
  }, [summary]);
  const facets = facetCounts(summary?.results ?? [], filter.minSceneConf, filter.minGarmentConf);

  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-1.5 font-display text-small font-semibold">
        Display
        <Info text="Changes what the grid shows. The keep set and export do not change." />
      </h2>
      <Toggle
        label="Unblur NSFW"
        info="Shows frames hidden by the NudeNet score or a policy verdict. A MiVOLO age under 18 stays blurred, and so does a frame the scan has not finished checking."
        checked={unblurNsfw}
        onChange={onUnblurNsfw}
      />
      <Toggle
        label="Hide rejected"
        info={
          hideRejectedReady
            ? "Hides every image the keep set leaves out, whether a hard reject (blur, size, aspect), a near-duplicate, or dropped by a filter below. The same switch as Show → Kept on the grid."
            : "Available once the keep set is calculated, after the scan."
        }
        checked={hideRejected}
        // Still clearable when on, so a switch left on from an earlier keep set is never stuck.
        disabled={!hideRejectedReady && !hideRejected}
        onChange={onHideRejected}
      />

      <h2 className="flex items-center gap-1.5 border-t border-base-700 pt-3 font-display text-small font-semibold">
        Keep set
        <Info text="These filters decide which images are kept, for Kept and Left out on the grid, Download paths, and Export." />
        <Tooltip text="Untick every filter below and put the sliders back to their defaults. Unblur NSFW and Hide rejected stay as they are." className="ml-auto">
          <button
            type="button"
            className="rounded-md border border-base-600 px-1.5 py-0.5 text-caption font-normal text-text-secondary hover:border-accent-primary hover:text-text-primary disabled:opacity-40"
            disabled={isDefaultFilter(filter)}
            onClick={() => onChange(clearedFilter())}
          >
            Clear all
          </button>
        </Tooltip>
      </h2>
      <RangeField
        label="Quality score"
        info="Curator quality score, from sharpness, resolution, and artifacts. NudeNet score is separate and does not move this slider."
        value={filter.minScore}
        min={0}
        max={1}
        step={0.05}
        onChange={(minScore) => onChange({ minScore })}
      />
      <Toggle
        label="Keep near-duplicates"
        info="Adds near-duplicate frames to the keep set. It does not hide them in the grid."
        checked={filter.keepSimilar}
        onChange={(keepSimilar) => onChange({ keepSimilar })}
      />

      <Group title="People" hint={blocked(missing("insightface")?.ready, summary?.faces_config.enabled ?? true, "insightface", ["faces", "identities"])}>
        <Caption text="Face cluster" />
        <CheckList
          options={clusters}
          selected={filter.faceClusters}
          counts={clusterCounts}
          label={(id) => clusterLabel(id, faceNames)}
          onToggle={(id) => onChange({ faceClusters: toggleValue(filter.faceClusters, id) })}
        />
        <Caption text="Head pose" />
        <CheckList
          options={POSES}
          selected={filter.facePoses}
          counts={poseCounts}
          hideEmpty
          label={poseLabel}
          onToggle={(pose) => onChange({ facePoses: toggleValue(filter.facePoses, pose) })}
        />
      </Group>

      <Group title="Appearance" info={APPEARANCE} hint={blocked(missing("mivolo")?.ready, summary?.faces_config.mivolo ?? true, "mivolo", ["faces"])}>
        <Caption text="Gender" />
        <CheckList
          options={GENDERS}
          selected={filter.faceGenders}
          label={(gender) => gender}
          onToggle={(gender) => onChange({ faceGenders: toggleValue(filter.faceGenders, gender) })}
        />
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
          info="Ignore a gender reading below this confidence."
          value={filter.minAttributeConf}
          min={0}
          max={1}
          step={0.05}
          onChange={(minAttributeConf) => onChange({ minAttributeConf })}
        />
      </Group>

      <Group title="Places365" hint={blocked(missing("places365")?.ready, summary?.scenes_config.enabled ?? true, "places365", ["scenes"])}>
        <Caption text="Scene" info="Places365 labels this scan recorded at or above the scene confidence, with the number of images for each." />
        <CheckList
          options={scenes}
          selected={filter.scenes}
          counts={facets.scenes}
          hideEmpty
          label={(scene) => scene.replaceAll("_", " ")}
          onToggle={(scene) => onChange({ scenes: toggleValue(filter.scenes, scene) })}
        />
        <Caption text="Environment" />
        <CheckList
          options={ENVIRONMENTS}
          selected={filter.sceneEnvironments}
          counts={facets.environments}
          hideEmpty
          label={(environment) => environment}
          onToggle={(environment) => onChange({ sceneEnvironments: toggleValue(filter.sceneEnvironments, environment) })}
        />
        <RangeField label="Scene confidence" info="A scene or environment counts only at or above this confidence. The counts above follow it." value={filter.minSceneConf} min={0} max={1} step={0.05} onChange={(minSceneConf) => onChange({ minSceneConf })} />
      </Group>

      <Group title="Fashionpedia" hint={blocked(missing("garments")?.ready, summary?.garments_config.enabled ?? true, "garments", ["garments"])}>
        <Caption text="Garment present" info="Garments this scan recorded at or above the garment confidence, with the number of images for each." />
        <CheckList
          options={GARMENTS}
          selected={filter.garments}
          counts={facets.garments}
          hideEmpty
          label={slugLabel}
          onToggle={(garment) => onChange({ garments: toggleValue(filter.garments, garment) })}
        />
        <Caption text="Garment excluded" info="Drops images that show any garment ticked here." />
        <CheckList
          options={GARMENTS}
          selected={filter.excludeGarments}
          counts={facets.garments}
          hideEmpty
          label={slugLabel}
          onToggle={(garment) => onChange({ excludeGarments: toggleValue(filter.excludeGarments, garment) })}
        />
        <Toggle
          label="Uncropped only"
          info="A garment counts only when at least one of its boxes stays clear of the frame edge."
          checked={filter.garmentsUncropped}
          onChange={(garmentsUncropped) => onChange({ garmentsUncropped })}
        />
        <RangeField
          label="Garment confidence"
          info="A garment counts only at or above this confidence. The counts above follow it."
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
          info="Drops an image when the highest score among the checked classes is at or above the threshold. An equal score counts, and an image NudeNet did not check is dropped too."
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
          <Caption
            text="Content rating"
            info="Explicit is an exposed class at 0.2 or above; suggestive is a covered intimate class without that; safe is neither. An image NudeNet did not check is dropped once a rating is selected."
          />
          <CheckList
            options={CONTENT_RATINGS}
            selected={filter.contentRatings}
            counts={ratingCounts(summary?.results ?? [])}
            label={(rating) => rating}
            onToggle={(rating) => onChange({ contentRatings: toggleValue(filter.contentRatings, rating) })}
          />
          <Toggle
            label="Drop exposed nudity"
            info="Drops an image whose highest score among the classes below is at or above the NudeNet score."
            checked={filter.nsfwThreshold != null}
            onChange={(checked) => onChange({ nsfwThreshold: checked ? 0.5 : null })}
          />
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
              <Caption text="Classes in the score" info="The first five are the usual exposed set; the rest are faces, covered parts, and other exposed areas." />
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
          info="A verdict, not a score. Dropping every unsafe image ignores the rule list. With only rules selected, an unsafe image whose rules are all unlisted stays, and one that names no rule is dropped."
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
          {policies.length > 1 && onPoliciesOff ? (
            <>
              <Caption
                text="Policies counted"
                info="Untick a policy to leave its verdicts out, as if it had not run: blur, shields, the counts here, the keep set and Run stats all follow. The number is images it flagged. The first ticked policy leads where the official one is off. A rerun still runs every policy."
              />
              <CheckList
                options={policies}
                selected={policies.filter((name) => !policiesOff.includes(name))}
                counts={policyFlags}
                label={(name) => (name === policies[0] ? `${name} (official)` : name)}
                onToggle={(name) => onPoliciesOff(policiesOff.includes(name) ? policiesOff.filter((other) => other !== name) : [...policiesOff, name])}
              />
              {policiesOff.length === policies.length ? <p className="text-caption text-warning">Every policy is off: no verdict blurs, and the SingGuard filters below do nothing.</p> : null}
            </>
          ) : null}
          <Toggle
            label="Drop every unsafe verdict"
            info="Drops any image a policy judged unsafe, whatever rule it named. Ticking it clears the rule list."
            checked={filter.guardUnsafe}
            onChange={(checked) => onChange({ guardUnsafe: checked, guardRules: checked ? [] : filter.guardRules })}
          />
          <Caption text="Rules" info="Drops an unsafe image that names any rule ticked here. The count is images that any policy judged unsafe under that rule; rules no image fired are hidden." />
          <CheckList
            options={ruleOptions}
            selected={filter.guardRules}
            counts={ruleCounts}
            hideEmpty
            label={(id) => guardRuleLabel(id, summary)}
            onToggle={(rule) => onChange({ guardUnsafe: false, guardRules: toggleValue(filter.guardRules, rule) })}
          />
        </Group>
      ) : null}
    </section>
  );
}
