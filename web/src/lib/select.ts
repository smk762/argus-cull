import { exposedLabelsForRequest } from "./moderation";
import { normalisePolicyChoice, policiesRun, type PolicyChoice } from "./policies";
import type { CheckConfig, Detectors, FaceConfig, FilterState, GarmentConfig, GuardConfig, ScanSummary, SceneConfig, SelectRequest } from "./types";

export interface FilterAvailability {
  faces: boolean;
  fairface: boolean;
  mivolo: boolean;
  scenes: boolean;
  garments: boolean;
  nsfw: boolean;
  guard: boolean;
}

const NONE: FilterAvailability = {
  faces: false,
  fairface: false,
  mivolo: false,
  scenes: false,
  garments: false,
  nsfw: false,
  guard: false,
};

function ran(flag: boolean | undefined, fallback: boolean): boolean {
  return flag ?? fallback;
}

function checkRan(config: CheckConfig | undefined): boolean {
  return config?.enabled === true;
}

/** A control is live only when the server loaded the model and this scan ran it. */
export function availability(detectors: Detectors | null, summary: ScanSummary | null): FilterAvailability {
  if (!detectors) return NONE;
  const faces = summary?.faces_config;
  const scenes = summary?.scenes_config;
  const garments = summary?.garments_config;
  return {
    faces: detectors.insightface && ran(faces?.enabled, true),
    fairface: detectors.fairface && ran(faces?.fairface, true),
    mivolo: detectors.mivolo && ran(faces?.mivolo, true),
    scenes: detectors.places365 && ran(scenes?.enabled, true),
    garments: detectors.garments && ran(garments?.enabled, true),
    nsfw: checkRan(summary?.nsfw_config),
    guard: checkRan(summary?.guard_config),
  };
}

function listed<T>(active: boolean, values: readonly T[]): T[] | null {
  return active && values.length > 0 ? [...values] : null;
}

/**
 * Policies the unsafe and rule filters read. Every policy the scan ran, so the
 * curator drops an image when any of them flags it, the way the shield does.
 * Omitted when only the official policy ran, which is what the curator assumes.
 */
export function guardPoliciesForRequest(summary: ScanSummary | null, active: boolean): string[] | undefined {
  if (!active) return undefined;
  const run = policiesRun(summary);
  return run.length > 1 ? run : undefined;
}

/** Export-filter fields only. No dest, mode, max_keep, or diversify flags. */
export function selectBody(filter: FilterState, gates: FilterAvailability, summary: ScanSummary | null = null): SelectRequest {
  const gender = gates.fairface || gates.mivolo;
  const threshold = gates.nsfw && filter.nsfwThreshold != null && filter.nsfwExposedLabels.length > 0 ? filter.nsfwThreshold : null;
  const guardActive = gates.guard && (filter.guardUnsafe || filter.guardRules.length > 0);
  return {
    min_score: filter.minScore,
    include_rejected: filter.includeRejected,
    keep_similar: filter.keepSimilar,
    face_clusters: listed(gates.faces, filter.faceClusters),
    face_poses: listed(gates.faces, filter.facePoses),
    face_races: listed(gates.fairface, filter.faceRaces),
    face_genders: listed(gender, filter.faceGenders),
    face_ages: listed(gates.fairface, filter.faceAges),
    min_age_years: gates.mivolo ? filter.minAgeYears : null,
    max_age_years: gates.mivolo ? filter.maxAgeYears : null,
    min_attribute_conf: filter.minAttributeConf,
    scenes: listed(gates.scenes, filter.scenes),
    scene_environments: listed(gates.scenes, filter.sceneEnvironments),
    min_scene_conf: filter.minSceneConf,
    garments: listed(gates.garments, filter.garments),
    exclude_garments: listed(gates.garments, filter.excludeGarments),
    min_garment_conf: filter.minGarmentConf,
    garments_uncropped: gates.garments ? filter.garmentsUncropped : false,
    nsfw_threshold: threshold,
    nsfw_label_thresholds: null,
    nsfw_exposed_labels: exposedLabelsForRequest(filter, threshold != null),
    guard_unsafe: gates.guard ? filter.guardUnsafe : false,
    guard_rules: filter.guardUnsafe ? null : listed(gates.guard, filter.guardRules),
    guard_policies: guardPoliciesForRequest(summary, guardActive),
  };
}

export interface ScanBody {
  folder: string;
  faces: FaceConfig;
  scenes: SceneConfig;
  garments: GarmentConfig;
  nsfw: CheckConfig;
  guard: GuardConfig;
}

/**
 * SingGuard config for a scan. Names are sent only when the curator lists
 * them: an older curator ignores the field and would judge the scan under its
 * default policy without saying so, so it sees `{ enabled }` only.
 */
export function guardBody(detectors: Detectors, choice: PolicyChoice | null): GuardConfig {
  const enabled = Boolean(detectors.singguard);
  const available = detectors.singguard_policies ?? [];
  if (!enabled || !choice || available.length === 0) return { enabled };
  const { policy, variants } = normalisePolicyChoice(choice, available);
  return variants.length > 0 ? { enabled, policy, variants } : { enabled, policy };
}

/** Turn a detector on only when /detectors says its weights are loaded. */
/** What the viewer chose to leave out of a scan. Every check the curator has loaded runs unless named here. */
export interface ScanChecks {
  skipGarments: boolean;
}

export const ALL_CHECKS: ScanChecks = { skipGarments: false };

export function scanBody(folder: string, detectors: Detectors, policies: PolicyChoice | null = null, checks: ScanChecks = ALL_CHECKS): ScanBody {
  const fairface = detectors.fairface;
  const mivolo = detectors.mivolo;
  return {
    folder,
    faces: {
      enabled: detectors.insightface || fairface || mivolo,
      fairface,
      mivolo,
    },
    scenes: { enabled: detectors.places365 },
    garments: { enabled: detectors.garments && !checks.skipGarments, min_conf: 0.3 },
    // NudeNet and SingGuard are remote servers. Ask only when /detectors says the URL is set.
    nsfw: { enabled: Boolean(detectors.nudenet) },
    guard: guardBody(detectors, policies),
  };
}

export function recordedScenes(summary: ScanSummary | null): string[] {
  const labels = new Set<string>();
  for (const result of summary?.results ?? []) {
    for (const category of result.scene?.categories ?? []) labels.add(category.label);
  }
  return [...labels].sort();
}
