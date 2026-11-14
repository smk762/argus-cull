import { exposedLabelsForRequest } from "./moderation";
import { normalisePolicyChoice, policiesRun, type PolicyChoice } from "./policies";
import type { CheckConfig, CropConfig, Detectors, FaceConfig, FilterState, GarmentConfig, GuardConfig, ImageResult, Prefilter, PrefilterConfig, ScanSummary, SceneConfig, SelectRequest } from "./types";
import { cropMaxCutPercent } from "./types";

export interface FilterAvailability {
  faces: boolean;
  mivolo: boolean;
  scenes: boolean;
  garments: boolean;
  nsfw: boolean;
  guard: boolean;
}

const NONE: FilterAvailability = {
  faces: false,
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
  // Policies switched off in the sidebar: name the rest, even one alone, so the curator does not fall back to the official verdict.
  if (summary?.policy_subset) return [...summary.policy_subset];
  const run = policiesRun(summary);
  return run.length > 1 ? run : undefined;
}

/** Export-filter fields only. No dest, mode, max_keep, or diversify flags. */
export function selectBody(filter: FilterState, gates: FilterAvailability, summary: ScanSummary | null = null): SelectRequest {
  const threshold = gates.nsfw && filter.nsfwThreshold != null && filter.nsfwExposedLabels.length > 0 ? filter.nsfwThreshold : null;
  // Every policy switched off in the sidebar: there is no verdict left to filter on.
  const guardOn = gates.guard && summary?.policy_subset?.length !== 0;
  const guardActive = guardOn && (filter.guardUnsafe || filter.guardRules.length > 0);
  return {
    min_score: filter.minScore,
    keep_similar: filter.keepSimilar,
    face_clusters: listed(gates.faces, filter.faceClusters),
    face_poses: listed(gates.faces, filter.facePoses),
    face_genders: listed(gates.mivolo, filter.faceGenders),
    // Age brackets left the sidebar; min and max years cover them.
    face_ages: null,
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
    content_ratings: listed(gates.nsfw, filter.contentRatings),
    guard_unsafe: guardOn ? filter.guardUnsafe : false,
    guard_rules: filter.guardUnsafe ? null : listed(guardOn, filter.guardRules),
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
  prefilter?: PrefilterConfig;
  crops?: CropConfig;
}

/** The scan looked for watermarks itself (`crops.detect`). */
export function detectsWatermarks(config: CropConfig | undefined): boolean {
  return config?.enabled === true && config.detect === true;
}

/** The scan request's prefilter block from the form's choices. */
export function prefilterConfig(drops: readonly Prefilter[]): PrefilterConfig {
  return { drop_nsfw: drops.includes("nsfw"), drop_no_face: drops.includes("no-face"), drop_no_age: drops.includes("no-age") };
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

/** What the viewer asked for beyond the curator's defaults. Every check named here is off unless asked for, and runs only when its weights are loaded. */
export interface ScanChecks {
  /** Run Fashionpedia. It is the slowest local check and nothing else in the scan waits on it. */
  withGarments: boolean;
  /** Ask for the set's age on frames with no face. Sent only when MiVOLO is loaded; an older curator ignores it. */
  setAge: boolean;
  /** Give MiVOLO each person's body (`faces.mivolo_body`). Sent only when MiVOLO and the person detector are loaded. */
  readBodies: boolean;
  /**
   * Prefilter before scenes, garments and SingGuard. Sent only to a curator
   * that offers it (`prefilter` on /health): an older one would ignore the
   * block and run every check on every image. The face and age drops need
   * face detection (and MiVOLO for age), so they go only when those run.
   */
  drops?: readonly Prefilter[];
  prefilter?: boolean;
  /** Find watermarks and crop them away before every check (`crops.detect`). Sent only when /detectors names a watermark detector. */
  cropWatermarks?: boolean;
  /** Most of a side one edge cut may take, in percent. Sent only when it differs from the curator's default. */
  cropMaxCut?: number;
}

export const DEFAULT_CHECKS: ScanChecks = { withGarments: false, setAge: false, readBodies: false };

/**
 * Turn a detector on only when /detectors says its weights are loaded.
 * FairFace is never asked for: cull does not offer race, and MiVOLO gives the
 * gender and age.
 */
export function scanBody(folder: string, detectors: Detectors, policies: PolicyChoice | null = null, checks: ScanChecks = DEFAULT_CHECKS): ScanBody {
  const mivolo = detectors.mivolo;
  return {
    folder,
    faces: {
      enabled: detectors.insightface || mivolo,
      fairface: false,
      mivolo,
      ...(checks.setAge && mivolo ? { set_age: true } : {}),
      ...(checks.readBodies && mivolo && detectors.bodies ? { mivolo_body: true } : {}),
    },
    scenes: { enabled: detectors.places365 },
    garments: { enabled: detectors.garments && checks.withGarments, min_conf: 0.3 },
    // NudeNet and SingGuard are remote servers. Ask only when /detectors says the URL is set.
    nsfw: { enabled: Boolean(detectors.nudenet) },
    guard: guardBody(detectors, policies),
    ...prefilterBody(detectors, checks),
    ...(checks.cropWatermarks && detectors.watermark ? { crops: cropsBody(checks) } : {}),
  };
}

function cropsBody(checks: ScanChecks): CropConfig {
  // Always sent: the curator's own default is lower than this form's.
  return { enabled: true, detect: true, max_cut: cropMaxCutPercent(checks.cropMaxCut) / 100 };
}

function prefilterBody(detectors: Detectors, checks: ScanChecks): { prefilter?: PrefilterConfig } {
  if (!checks.prefilter || !checks.drops || checks.drops.length === 0) return {};
  const faces = detectors.insightface || detectors.mivolo;
  const drops = checks.drops.filter((kind) => kind === "nsfw" || (kind === "no-face" && faces) || (kind === "no-age" && detectors.mivolo));
  return drops.length > 0 ? { prefilter: prefilterConfig(drops) } : {};
}

export function recordedScenes(summary: ScanSummary | null): string[] {
  const labels = new Set<string>();
  for (const result of summary?.results ?? []) {
    for (const category of result.scene?.categories ?? []) labels.add(category.label);
  }
  return [...labels].sort();
}

/** Images per scene label, environment and garment at or above the sidebar's confidence. */
export interface FacetCounts {
  scenes: Map<string, number>;
  environments: Map<string, number>;
  garments: Map<string, number>;
}

export function facetCounts(results: readonly ImageResult[], minSceneConf: number, minGarmentConf: number): FacetCounts {
  const scenes = new Map<string, number>();
  const environments = new Map<string, number>();
  const garments = new Map<string, number>();
  const bump = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) ?? 0) + 1);
  for (const image of results) {
    const scene = image.scene;
    if (scene) {
      for (const label of new Set(scene.categories.filter((category) => category.conf >= minSceneConf).map((category) => category.label))) bump(scenes, label);
      if (scene.environment_conf >= minSceneConf) bump(environments, scene.environment);
    }
    for (const label of new Set((image.garments ?? []).filter((garment) => garment.conf >= minGarmentConf).map((garment) => garment.label))) bump(garments, label);
  }
  return { scenes, environments, garments };
}
