"use client";

import type { ReactNode } from "react";

import { contentRatingAvailable, detectorGroups, policyAvailable } from "@/lib/detectors";
import { guardRuleLabel, nudeNetLabel, recordedGuardRules } from "@/lib/moderation";
import { recordedScenes, type FilterAvailability } from "@/lib/select";
import {
  AGE_BRACKETS,
  ENVIRONMENTS,
  NUDENET_LABELS,
  GARMENTS,
  GENDERS,
  GUARD_RULES,
  POSES,
  RACES,
  poseLabel,
  slugLabel,
  type Detectors,
  type FilterState,
  type ScanSummary,
} from "@/lib/types";
import { toggleValue } from "@/lib/urlState";

const APPEARANCE =
  "Race, gender, and age are appearance guesses from a model, not facts about a person. gender_source and age_source name which model made the guess.";

function CheckList<T extends string>({
  options,
  selected,
  label,
  onToggle,
}: {
  options: readonly T[];
  selected: readonly T[];
  label: (value: T) => string;
  onToggle: (value: T) => void;
}) {
  if (options.length === 0) return <p className="text-caption text-text-muted">Nothing recorded in this scan.</p>;
  return (
    <ul className="max-h-36 space-y-1 overflow-auto pr-1">
      {options.map((option) => (
        <li key={option}>
          <label className="flex items-center gap-2 text-small">
            <input type="checkbox" checked={selected.includes(option)} onChange={() => onToggle(option)} />
            <span className="capitalize">{label(option)}</span>
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
  onChange,
  unblurNsfw,
  onUnblurNsfw,
}: {
  filter: FilterState;
  detectors: Detectors | null;
  summary: ScanSummary | null;
  gates: FilterAvailability;
  onChange: (patch: Partial<FilterState>) => void;
  unblurNsfw: boolean;
  onUnblurNsfw: (unblurNsfw: boolean) => void;
}) {
  const groups = detectors ? detectorGroups(detectors) : [];
  const missing = (id: (typeof groups)[number]["id"]) => groups.find((group) => group.id === id);
  const blocked = (ready: boolean | undefined, ran: boolean, id: (typeof groups)[number]["id"]): string | null => {
    if (!detectors) return "Waiting for detector status.";
    if (!ready) return missing(id)?.hint ?? "This model is not loaded.";
    if (summary && !ran) return "This scan did not run it. Scan again to record it.";
    return null;
  };
  const scenes = recordedScenes(summary);
  const clusters = summary?.face_clusters.map((cluster) => cluster.cluster_id) ?? [];
  const appearanceHint = (): string | null => {
    if (!detectors) return "Waiting for detector status.";
    const fairfaceReady = Boolean(missing("fairface")?.ready);
    const mivoloReady = Boolean(missing("mivolo")?.ready);
    if (!fairfaceReady && !mivoloReady) {
      return `${missing("fairface")?.hint ?? ""} ${missing("mivolo")?.hint ?? ""}`.trim();
    }
    if (summary && !summary.faces_config.fairface && !summary.faces_config.mivolo) {
      return "This scan did not run FairFace or MiVOLO. Scan again to record it.";
    }
    return null;
  };

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

      <Group title="People" hint={blocked(missing("insightface")?.ready, summary?.faces_config.enabled ?? true, "insightface")}>
        <p className="text-caption text-text-muted">Face cluster</p>
        <CheckList
          options={clusters}
          selected={filter.faceClusters}
          label={(id) => id}
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

      <Group title="Appearance" hint={appearanceHint()}>
        <p className="text-caption text-text-secondary">{APPEARANCE}</p>
        {gates.fairface ? (
          <>
            <p className="text-caption text-text-muted">Race</p>
            <CheckList options={RACES} selected={filter.faceRaces} label={slugLabel} onToggle={(race) => onChange({ faceRaces: toggleValue(filter.faceRaces, race) })} />
            <p className="text-caption text-text-muted">FairFace age bracket</p>
            <CheckList options={AGE_BRACKETS} selected={filter.faceAges} label={(age) => age} onToggle={(age) => onChange({ faceAges: toggleValue(filter.faceAges, age) })} />
          </>
        ) : (
          <p className="text-caption text-text-muted">
            {summary && detectors?.fairface && !summary.faces_config.fairface
              ? "This scan did not run FairFace. Scan again to record it."
              : missing("fairface")?.hint}
          </p>
        )}
        <p className="text-caption text-text-muted">Gender</p>
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
            {summary && detectors?.mivolo && !summary.faces_config.mivolo
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

      <Group title="Places365" hint={blocked(missing("places365")?.ready, summary?.scenes_config.enabled ?? true, "places365")}>
        <CheckList options={scenes} selected={filter.scenes} label={(scene) => scene} onToggle={(scene) => onChange({ scenes: toggleValue(filter.scenes, scene) })} />
        <CheckList
          options={ENVIRONMENTS}
          selected={filter.sceneEnvironments}
          label={(environment) => environment}
          onToggle={(environment) => onChange({ sceneEnvironments: toggleValue(filter.sceneEnvironments, environment) })}
        />
        <RangeField label="Scene confidence" value={filter.minSceneConf} min={0} max={1} step={0.05} onChange={(minSceneConf) => onChange({ minSceneConf })} />
      </Group>

      <Group title="Fashionpedia" hint={blocked(missing("garments")?.ready, summary?.garments_config.enabled ?? true, "garments")}>
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
            summary?.nsfw_config?.enabled === true
              ? null
              : summary
                ? "This scan did not run NudeNet. Scan again to record it."
                : "Scan a folder to record NudeNet scores."
          }
        >
          <p className="text-caption text-text-secondary">
            Drops an image when the highest score among the checked classes is at or above the threshold. An equal score counts, and an image NudeNet did not check is dropped too. The first five are the usual exposed set; the rest are faces, covered parts, and other exposed areas.
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
            summary?.guard_config?.enabled === true
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
