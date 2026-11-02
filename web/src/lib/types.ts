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

/** Covered intimate classes. A detection here, with none of the exposed set, is suggestive. */
export const SUGGESTIVE_LABELS = [
  "FEMALE_BREAST_COVERED",
  "FEMALE_GENITALIA_COVERED",
  "BUTTOCKS_COVERED",
  "ANUS_COVERED",
] as const satisfies readonly NudeNetLabel[];

/** NudeNet content rating on an image the detector checked. Unchecked images have none. */
export const CONTENT_RATINGS = ["safe", "suggestive", "explicit"] as const;
export type ContentRating = (typeof CONTENT_RATINGS)[number];

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
export const ADULT_RULE_A = "A. Illegal Sexual Content";

export type ExportMode = "copy" | "symlink" | "move";

export interface Health {
  status: string;
  service: string;
  version: string;
  manifest_version: string;
  source_root: string | null;
  export_root: string | null;
  allow_move: boolean;
  /** Curator 0.6: it can stop a running scan and purge the scan cache. */
  scan_control?: boolean;
  /** Curator 0.12: `DELETE /scan/{id}` removes one cached scan. */
  scan_delete?: boolean;
  /** Curator 0.7: frames with no face can take the set's age (`faces.set_age`). */
  set_age?: boolean;
  /** Curator 0.8: `GET /guard/policies` serves each policy's text. */
  guard_policy_text?: boolean;
  /** Curator 0.12: `POST /scan/{id}/delete` takes any image in the scan, not only under-18 exposed ones. */
  delete_any?: boolean;
  /** Curator 0.12: a scan can prefilter images before scenes, garments and SingGuard (`prefilter` on the request). */
  prefilter?: boolean;
}

/**
 * One SingGuard policy `GET /guard/policies` lists. `source` is `builtin`,
 * `file` (the operator's policy file, for `default`), or `singguard` when
 * `default` sends no text and SingGuard applies its own rules. `recorded` is
 * the name results store; `error` names the env var when the file cannot be read.
 */
export interface GuardPolicyInfo {
  name: string;
  recorded: string | null;
  source: "builtin" | "file" | "singguard" | string;
  text: string | null;
  error: string | null;
}

export interface GuardPolicies {
  singguard: boolean;
  policies: GuardPolicyInfo[];
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
  /** Curator 0.10: InsightFace's person detector is loaded, so a scan can give MiVOLO bodies (`faces.mivolo_body`). */
  bodies?: boolean;
  /** A NudeNet server is configured (ARGUS_CURATOR_NUDENET_URL). */
  nudenet?: boolean;
  /** Curator 0.11: an EraX-NSFW server is configured (ARGUS_CURATOR_ERAX_URL), as NudeNet's fill-in. */
  erax?: boolean;
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

/** EraX-NSFW's own view of a frame (curator 0.11). Its five classes are not NudeNet's. */
export interface EraxResult {
  detections: { label: string; score: number; bbox: number[] }[];
  labels: Record<string, number>;
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
  /** Only on a passing frame with no face, when the scan asked for `faces.set_age` and found one subject. */
  set_age?: SetAge | null;
  scene: SceneTags | null;
  garments: GarmentDetection[] | null;
  nsfw?: NsfwResult | null;
  /** Curator #18: derived from NudeNet. Missing on an older server; null when NudeNet did not check the image. */
  content_rating?: ContentRating | null;
  guard?: GuardResult | null;
  guard_variants?: GuardVariants;
  /** Curator 0.11: EraX's own result, when the fill-in ran. */
  erax?: EraxResult | null;
  /** `nsfw` was filled from EraX because NudeNet scored nothing exposed. */
  erax_filled?: boolean;
  /** NudeNet's check failed and `nsfw` holds EraX's hits alone. EraX has no buttocks class, so a low score is not a clean bill. */
  nudenet_failed?: boolean;
  /** Curator 0.10, when the scan asked for `faces.mivolo_body`: one entry per person box. */
  people?: PersonDetection[];
  /** How the person check went. Null when it was not asked for; an empty `people` means "none found" only when it is `ok`. */
  people_check?: PeopleCheck | null;
  people_error?: string | null;
}

export type PeopleCheck = "ok" | "detection_failed" | "body_ages_failed";

/**
 * A person box from the curator's body detector. `face_index` is the face it
 * was matched to; null is a person with no visible face, whose `age_years` is
 * MiVOLO reading the body alone.
 */
export interface PersonDetection {
  bbox: number[];
  det_score: number;
  face_index?: number | null;
  age_years?: number | null;
  age_source?: "mivolo" | "fairface" | null;
  age_body?: boolean | null;
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
  /** Curator 0.7: give frames with no face the set's age when one identity holds the scan. */
  set_age?: boolean;
  /** Curator 0.10: MiVOLO reads each person's body too, and a person with no face gets a body-only age. */
  mivolo_body?: boolean;
}

/**
 * An age for a frame with no face, read off the set it belongs to: the median
 * MiVOLO age of the scan's dominant identity. An inference about the set, not
 * a reading of the frame; shown as such, and counted where a wrong age would
 * be the costlier mistake (the under-18 hold and the delete mark).
 */
export interface SetAge {
  years: number;
  cluster_id: string;
  faces: number;
  share: number;
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

/** What a scan prefilters out before the slow checks. A dropped image stays as a reject named `prefilter:<kind>`. */
export const PREFILTERS = ["nsfw", "no-face", "no-age"] as const;
export type Prefilter = (typeof PREFILTERS)[number];

export interface PrefilterConfig {
  /** An exposed reading of 0.2 or more. An image NudeNet and EraX could not score goes on. */
  drop_nsfw: boolean;
  /** No face detected. */
  drop_no_face: boolean;
  /** No MiVOLO age from a face or a body, and no set age. */
  drop_no_age: boolean;
}

export interface ScanSummary {
  scan_id: string;
  folder: string;
  /** Curator 0.12: what the scan prefiltered. Absent on older scans. */
  prefilter_config?: PrefilterConfig;
  target_profile?: TargetProfile;
  faces_config: FaceConfig;
  scenes_config: SceneConfig;
  garments_config: GarmentConfig;
  /** Present on curator 0.4 scans. `enabled` is whether that check actually ran. */
  nsfw_config?: CheckConfig;
  /** Curator 0.11: whether the EraX fill-in ran on this scan. */
  erax_config?: { enabled: boolean | null };
  guard_config?: GuardConfig;
  total: number;
  passed: number;
  rejected: number;
  duplicates: number;
  face_clusters: FaceCluster[];
  /** When `faces.set_age` was asked: the set age given to the faceless frames, or why none was. */
  set_age?: SetAge | null;
  set_age_skipped?: string | null;
  /**
   * Page-side only, never from the curator: the policies left switched on in
   * the sidebar, set by `withoutPolicies`. Absent when every policy counts.
   */
  policy_subset?: string[];
  results: ImageResult[];
}

export interface Progress {
  phase: string;
  done: number;
  total: number;
  /** Checks still running (curator 0.5.1 and later): faces, nsfw, guard. */
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
  /** Asked to stop; the slot frees once the checks in flight return. */
  cancelling?: boolean;
}

export interface PurgeResult {
  cancelled: string | null;
  deleted: number;
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
  faceGenders: FaceGender[];
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
  /** Keep only these NudeNet ratings. Empty leaves the rating unused. Unchecked images drop once any are set. */
  contentRatings: ContentRating[];
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
  /** Run Fashionpedia on the next scan. Off unless asked for: it is the slowest local check and nothing else waits on it. */
  withGarments: boolean;
  /** The folder is one set of one person: frames with no face may take the set's age. */
  setAge: boolean;
  /** MiVOLO reads bodies on the next scan, so a person with no visible face gets an age. Under evaluation; off unless asked for. */
  readBodies: boolean;
  /** What the next scan prefilters out before scenes, garments and SingGuard. */
  drops: Prefilter[];
  /** Person names by cluster id, for export (`face_names`). The cached scan is not changed. */
  faceNames: Record<string, string>;
  filter: FilterState;
}

export interface SelectRequest {
  min_score: number;
  include_rejected: boolean;
  keep_similar: boolean;
  face_clusters: string[] | null;
  face_poses: FacePose[] | null;
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
  /** Keep only these ratings. Omitted or null leaves the rating unused. Unchecked images are excluded once this is set. */
  content_ratings?: ContentRating[] | null;
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
  /** Sidecars written beside exported files (`write_xmp`). Absent on an older curator. */
  xmp_written?: number;
}

export const DEFAULT_FILTER: FilterState = {
  minScore: 0.6,
  includeRejected: false,
  keepSimilar: false,
  faceClusters: [],
  facePoses: [],
  faceGenders: [],
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
  contentRatings: [],
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
  withGarments: false,
  setAge: false,
  readBodies: false,
  drops: [],
  faceNames: {},
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
