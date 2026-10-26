import { exposedLabelsForRequest } from "./moderation";
import type { CheckConfig, Detectors, FaceConfig, FilterState, GarmentConfig, ScanSummary, SceneConfig, SelectRequest } from "./types";

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

/** Export-filter fields only. No dest, mode, max_keep, or diversify flags. */
export function selectBody(filter: FilterState, gates: FilterAvailability): SelectRequest {
  const gender = gates.fairface || gates.mivolo;
  const threshold = gates.nsfw && filter.nsfwThreshold != null && filter.nsfwExposedLabels.length > 0 ? filter.nsfwThreshold : null;
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
  };
}

export interface ScanBody {
  folder: string;
  faces: FaceConfig;
  scenes: SceneConfig;
  garments: GarmentConfig;
  nsfw: CheckConfig;
  guard: CheckConfig;
}

/** Turn a detector on only when /detectors says its weights are loaded. */
export function scanBody(folder: string, detectors: Detectors): ScanBody {
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
    garments: { enabled: detectors.garments, min_conf: 0.3 },
    // NudeNet and SingGuard are remote servers. Ask only when /detectors says the URL is set.
    nsfw: { enabled: Boolean(detectors.nudenet) },
    guard: { enabled: Boolean(detectors.singguard) },
  };
}

export function recordedScenes(summary: ScanSummary | null): string[] {
  const labels = new Set<string>();
  for (const result of summary?.results ?? []) {
    for (const category of result.scene?.categories ?? []) labels.add(category.label);
  }
  return [...labels].sort();
}
