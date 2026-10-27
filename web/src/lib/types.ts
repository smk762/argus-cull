export const CURATOR_URL = process.env.NEXT_PUBLIC_CURATOR_URL || "http://localhost:8101";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "0.0.0.0"]);

/** Curator origin for the page the browser actually opened.

The port and scheme come from CURATOR_URL. When that URL names a loopback host
(the default), the host follows the page, so http://192.168.30.39:3000 calls
http://192.168.30.39:8101 and a localhost page keeps calling localhost. A
CURATOR_URL that names another machine is used as written. */
export function curatorUrl(pageHost?: string, configured: string = CURATOR_URL): string {
  const host = pageHost ?? (typeof window === "undefined" ? "" : window.location.hostname);
  if (!host) return configured;
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    return configured;
  }
  if (!LOOPBACK_HOSTS.has(url.hostname)) return url.origin;
  url.hostname = host;
  return url.origin;
}

export const PAGE_SIZE = 48;

export const POSES = ["frontal", "three_quarter", "profile"] as const;
export type FacePose = (typeof POSES)[number];

export const RACES = [
  "white",
  "black",
  "latino_hispanic",
  "east_asian",
  "southeast_asian",
  "indian",
  "middle_eastern",
] as const;
export type FaceRace = (typeof RACES)[number];

export const GENDERS = ["male", "female"] as const;
export type FaceGender = (typeof GENDERS)[number];

export const AGE_BRACKETS = ["0-2", "3-9", "10-19", "20-29", "30-39", "40-49", "50-59", "60-69", "70+"] as const;
export type FaceAge = (typeof AGE_BRACKETS)[number];

export const ENVIRONMENTS = ["indoor", "outdoor"] as const;
export type SceneEnvironment = (typeof ENVIRONMENTS)[number];

export const GARMENTS = [
  "shirt_blouse",
  "top_tshirt_sweatshirt",
  "sweater",
  "cardigan",
  "jacket",
  "vest",
  "pants",
  "shorts",
  "skirt",
  "coat",
  "dress",
  "jumpsuit",
  "cape",
  "glasses",
  "hat",
  "headband_hair_accessory",
  "tie",
  "glove",
  "watch",
  "belt",
  "leg_warmer",
  "tights_stockings",
  "sock",
  "shoe",
  "bag_wallet",
  "scarf",
  "umbrella",
] as const;
export type GarmentLabel = (typeof GARMENTS)[number];

/** NudeNet's 18 detector classes, in the detector's own order. */
export const NUDENET_LABELS = [
  "FEMALE_GENITALIA_COVERED",
  "FACE_FEMALE",
  "BUTTOCKS_EXPOSED",
  "FEMALE_BREAST_EXPOSED",
  "FEMALE_GENITALIA_EXPOSED",
  "MALE_BREAST_EXPOSED",
  "ANUS_EXPOSED",
  "FEET_EXPOSED",
  "BELLY_COVERED",
  "FEET_COVERED",
  "ARMPITS_COVERED",
  "ARMPITS_EXPOSED",
  "FACE_MALE",
  "BELLY_EXPOSED",
  "MALE_GENITALIA_EXPOSED",
  "ANUS_COVERED",
  "FEMALE_BREAST_COVERED",
  "BUTTOCKS_COVERED",
] as const;
export type NudeNetLabel = (typeof NUDENET_LABELS)[number];

/** Classes the exposed score starts from. Matches argus-cortex DEFAULT_EXPOSED_LABELS. */
export const EXPOSED_LABELS = [
  "BUTTOCKS_EXPOSED",
  "FEMALE_BREAST_EXPOSED",
  "FEMALE_GENITALIA_EXPOSED",
  "MALE_GENITALIA_EXPOSED",
  "ANUS_EXPOSED",
] as const satisfies readonly NudeNetLabel[];
export type ExposedLabel = (typeof EXPOSED_LABELS)[number];

/** SingGuard's default policy, addressed by letter the way `--guard-rules` accepts. */
export const GUARD_RULES = [
  { id: "A", label: "A. Sexual Content Risk" },
  { id: "B", label: "B. Real-World Crimes & Public Safety" },
  { id: "C", label: "C. Unethical Behavior" },
  { id: "D", label: "D. Cybersecurity" },
  { id: "E", label: "E. Agent Safety" },
  { id: "F", label: "F. Politically Sensitive" },
  { id: "G", label: "G. Animal Abuse" },
] as const;

/**
 * A SingGuard policy name the curator lists in `singguard_policies`: `default`,
 * `adult` (rule A covers only apparent minors, non-consent and sexual violence,
 * and consensual adult nudity is safe), and the variants under evaluation.
 * Letters B to G mean the same thing under every policy.
 */
export type GuardPolicy = string;

/** Rule A under the adult policy; B to G keep the default names. */
export const ADULT_RULE_A = "A. Illegal or Extreme Sexual Content";

export type ExportMode = "copy" | "symlink" | "move";

export interface Health {
  status: string;
  service: string;
  version: string;
  manifest_version: string;
  source_root: string | null;
  export_root: string | null;
  allow_move: boolean;
}

export interface Detectors {
  torch: boolean;
  cuda: boolean;
  clip: boolean;
  insightface: boolean;
  onnxruntime: boolean;
  fairface: boolean;
  mivolo: boolean;
  places365: boolean;
  garments: boolean;
  /** A NudeNet server is configured (ARGUS_CURATOR_NUDENET_URL). */
  nudenet?: boolean;
  /** A SingGuard server is configured (ARGUS_CURATOR_SINGGUARD_URL). */
  singguard?: boolean;
  /** Policies a scan can pass as `guard.policy`, in the curator's order (curator 0.5+; empty without SingGuard). */
  singguard_policies?: string[];
}

export interface CheckConfig {
  enabled: boolean | null;
}

/** SingGuard on a scan: the official policy, plus variants run beside it for comparison. */
export interface GuardConfig extends CheckConfig {
  policy?: GuardPolicy;
  variants?: GuardPolicy[];
}

export interface NsfwDetection {
  label: string;
  score: number;
  bbox: number[];
}

export interface NsfwResult {
  detections: NsfwDetection[];
  labels: Record<string, number>;
  exposed_score: number;
}

export interface GuardResult {
  safe: boolean;
  rules: string[];
  explanation?: string | null;
  model?: string | null;
  policy?: string;
}

/**
 * Verdicts from the variant policies a scan ran, by policy name. A variant
 * whose check failed is left out and reads as unknown. Only `lib/policies.ts`
 * reads this; `guard` stays the official verdict.
 */
export type GuardVariants = Record<string, GuardResult>;

export interface FolderEntry {
  name: string;
  rel_path: string;
  abs_path: string;
  image_count: number;
  subfolder_count: number;
}

export interface FolderListing {
  root: string;
  path: string;
  abs_path: string;
  parent: string | null;
  direct_image_count: number;
  folders: FolderEntry[];
}

export interface FaceAttributes {
  race: FaceRace | null;
  race_conf: number | null;
  gender: FaceGender | null;
  gender_conf: number | null;
  gender_source: "fairface" | "mivolo" | null;
  age: FaceAge | null;
  age_conf: number | null;
  age_years: number | null;
  age_source: "fairface" | "mivolo" | null;
}

export interface SceneLabel {
  label: string;
  conf: number;
}

export interface SceneTags {
  categories: SceneLabel[];
  environment: SceneEnvironment;
  environment_conf: number;
}

export interface GarmentDetection {
  label: GarmentLabel;
  conf: number;
  bbox: number[];
  touches_edge: boolean;
  color: string;
}

export interface FaceDetection {
  primary?: boolean;
  attributes: FaceAttributes | null;
}

export interface ImageResult {
  rel_path: string;
  abs_path: string;
  score: number;
  passed: boolean;
  reject_reason: string | null;
  similar_group: number;
  group_size: number;
  is_representative: boolean;
  is_duplicate: boolean;
  duplicate_of: string | null;
  keep_reason: string;
  sharpness: number;
  artifact_score?: number;
  /** Weighted parts of `score`: sharpness, resolution, artifact, target_bonus, face_penalty. */
  score_breakdown?: Record<string, number>;
  width: number;
  height: number;
  face_count: number;
  faces?: FaceDetection[];
  primary_face_cluster: string | null;
  primary_face_pose: FacePose | null;
  primary_face_attributes: FaceAttributes | null;
  scene: SceneTags | null;
  garments: GarmentDetection[] | null;
  nsfw?: NsfwResult | null;
  guard?: GuardResult | null;
  guard_variants?: GuardVariants;
}

export interface FaceCluster {
  cluster_id: string;
  size: number;
  representative_rel_path: string;
  representative_bbox: number[] | null;
  attributes: FaceAttributes | null;
}

export interface FaceConfig {
  enabled: boolean;
  fairface: boolean;
  mivolo: boolean;
}

export interface SceneConfig {
  enabled: boolean;
}

export interface GarmentConfig {
  enabled: boolean;
  min_conf: number;
}

export interface TargetProfile {
  target_style?: string;
  target_backend?: string | null;
  target_category?: "identity" | "wardrobe" | "pose_composition" | "setting";
}

export interface ScanSummary {
  scan_id: string;
  folder: string;
  target_profile?: TargetProfile;
  faces_config: FaceConfig;
  scenes_config: SceneConfig;
  garments_config: GarmentConfig;
  /** Present on curator 0.4 scans. `enabled` is whether that check actually ran. */
  nsfw_config?: CheckConfig;
  guard_config?: GuardConfig;
  total: number;
  passed: number;
  rejected: number;
  duplicates: number;
  face_clusters: FaceCluster[];
  results: ImageResult[];
}

export interface Progress {
  phase: string;
  done: number;
  total: number;
  /** Checks still running (curator 0.6 and later): faces, nsfw, guard. */
  pending_checks?: string[];
}

/** One batch of images from a scan that is still running. */
export interface ScanChunk {
  scan_id: string;
  folder: string;
  phase: string;
  done: number;
  total: number;
  pending_checks: string[];
  results: ImageResult[];
  face_clusters?: FaceCluster[];
}

export interface ActiveScan {
  scan_id: string;
  folder: string;
  phase: string;
  done: number;
  total: number;
  pending_checks: string[];
}

export interface ScanListItem {
  scan_id: string;
  folder: string;
  total: number;
  updated_at: string;
}

export interface ScanList {
  active: ActiveScan | null;
  scans: ScanListItem[];
}

export interface FilterState {
  minScore: number;
  includeRejected: boolean;
  keepSimilar: boolean;
  faceClusters: string[];
  facePoses: FacePose[];
  faceRaces: FaceRace[];
  faceGenders: FaceGender[];
  faceAges: FaceAge[];
  minAgeYears: number | null;
  maxAgeYears: number | null;
  minAttributeConf: number;
  scenes: string[];
  sceneEnvironments: SceneEnvironment[];
  minSceneConf: number;
  garments: GarmentLabel[];
  excludeGarments: GarmentLabel[];
  minGarmentConf: number;
  garmentsUncropped: boolean;
  /** Null leaves the exposed score unused. Inclusive, and never below 0.2. */
  nsfwThreshold: number | null;
  nsfwExposedLabels: NudeNetLabel[];
  guardUnsafe: boolean;
  guardRules: string[];
}

export interface ViewState {
  scan: string | null;
  folder: string;
  page: number;
  photo: string | null;
  view: "grid" | "people";
  cluster: string | null;
  /** The official SingGuard policy the next scan asks for. Null takes the curator's `adult` when offered, else its first. */
  guardPolicy: GuardPolicy | null;
  /** Policies run beside the official one, for comparison. */
  guardVariants: GuardPolicy[];
  filter: FilterState;
}

export interface SelectRequest {
  min_score: number;
  include_rejected: boolean;
  keep_similar: boolean;
  face_clusters: string[] | null;
  face_poses: FacePose[] | null;
  face_races: FaceRace[] | null;
  face_genders: FaceGender[] | null;
  face_ages: FaceAge[] | null;
  min_age_years: number | null;
  max_age_years: number | null;
  min_attribute_conf: number;
  scenes: string[] | null;
  scene_environments: SceneEnvironment[] | null;
  min_scene_conf: number;
  garments: GarmentLabel[] | null;
  exclude_garments: GarmentLabel[] | null;
  min_garment_conf: number;
  garments_uncropped: boolean;
  nsfw_threshold: number | null;
  nsfw_label_thresholds: Record<string, number> | null;
  /** Omitted when the selection is the server's default exposed set. */
  nsfw_exposed_labels?: NudeNetLabel[];
  guard_unsafe: boolean;
  guard_rules: string[] | null;
  /** Policies the unsafe and rule filters read. Omitted means the official verdict only; listed means any of them. */
  guard_policies?: string[];
}

export interface SelectRow {
  rel_path: string;
  abs_path: string;
  keep_reason: string;
}

export interface SelectResult {
  scan_id: string;
  total: number;
  kept: number;
  rows: SelectRow[];
}

export interface ExportResult {
  manifest_version: string;
  manifest_path: string | null;
  copied: number;
  skipped: number;
  dest: string;
  mode: string;
  selected_rel_paths: string[];
  exported_paths: Record<string, string>;
  exported_abs_paths: Record<string, string>;
}

export const DEFAULT_FILTER: FilterState = {
  minScore: 0.6,
  includeRejected: false,
  keepSimilar: false,
  faceClusters: [],
  facePoses: [],
  faceRaces: [],
  faceGenders: [],
  faceAges: [],
  minAgeYears: null,
  maxAgeYears: null,
  minAttributeConf: 0,
  scenes: [],
  sceneEnvironments: [],
  minSceneConf: 0.1,
  garments: [],
  excludeGarments: [],
  minGarmentConf: 0.5,
  garmentsUncropped: false,
  nsfwThreshold: null,
  nsfwExposedLabels: [...EXPOSED_LABELS],
  guardUnsafe: false,
  guardRules: [],
};

export const DEFAULT_VIEW: ViewState = {
  scan: null,
  folder: "",
  page: 1,
  photo: null,
  view: "grid",
  cluster: null,
  guardPolicy: null,
  guardVariants: [],
  filter: DEFAULT_FILTER,
};

export function poseLabel(pose: FacePose): string {
  if (pose === "three_quarter") return "Three-quarter";
  if (pose === "profile") return "Profile";
  return "Frontal";
}

export function slugLabel(value: string): string {
  return value.replaceAll("_", " ");
}
