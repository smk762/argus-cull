import { sameMembers } from "./moderation";
import {
  AGE_BRACKETS,
  DEFAULT_FILTER,
  DEFAULT_VIEW,
  ENVIRONMENTS,
  EXPOSED_LABELS,
  NUDENET_LABELS,
  GARMENTS,
  GENDERS,
  POSES,
  RACES,
  type ExposedLabel,
  type FaceAge,
  type FaceGender,
  type FacePose,
  type FilterState,
  type GarmentLabel,
  type SceneEnvironment,
  type ViewState,
} from "./types";

const FACET_GROUPS = {
  cluster: "cluster",
  pose: "pose",
  race: "race",
  gender: "gender",
  age: "age",
  scene: "scene",
  env: "env",
  garment: "garment",
  exclude: "exclude",
  exposed: "exposed",
  rule: "rule",
} as const;

function snap(value: number): number {
  return Math.round(value * 100) / 100;
}

function take<T extends string>(raw: string, allowed: readonly T[]): T | null {
  return (allowed as readonly string[]).includes(raw) ? (raw as T) : null;
}

function readNumber(params: URLSearchParams, key: string, fallback: number): number {
  const raw = params.get(key);
  if (raw == null || raw === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? snap(value) : fallback;
}

function readOptional(params: URLSearchParams, key: string): number | null {
  const raw = params.get(key);
  if (raw == null || raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? snap(value) : null;
}

function readFlag(params: URLSearchParams, key: string): boolean {
  const raw = params.get(key);
  return raw === "1" || raw === "true";
}

/** A SingGuard policy name as the curator spells them. The scan body drops any the curator does not list. */
function policyName(value: string | null): string | null {
  const name = (value ?? "").trim();
  return /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(name) ? name : null;
}

export function parseView(params: URLSearchParams): ViewState {
  const filter: FilterState = {
    ...DEFAULT_FILTER,
    faceClusters: [],
    facePoses: [],
    faceRaces: [],
    faceGenders: [],
    faceAges: [],
    scenes: [],
    sceneEnvironments: [],
    garments: [],
    excludeGarments: [],
    nsfwExposedLabels: [...EXPOSED_LABELS],
    guardRules: [],
  };
  let exposedCustom = false;
  for (const raw of params.getAll("f")) {
    const i = raw.indexOf(":");
    if (i <= 0) continue;
    const group = raw.slice(0, i);
    const term = raw.slice(i + 1);
    if (!term) continue;
    if (group === FACET_GROUPS.cluster && !filter.faceClusters.includes(term)) filter.faceClusters.push(term);
    const pose = group === FACET_GROUPS.pose ? take(term, POSES) : null;
    if (pose && !filter.facePoses.includes(pose)) filter.facePoses.push(pose);
    const race = group === FACET_GROUPS.race ? take(term, RACES) : null;
    if (race && !filter.faceRaces.includes(race)) filter.faceRaces.push(race);
    const gender = group === FACET_GROUPS.gender ? take(term, GENDERS) : null;
    if (gender && !filter.faceGenders.includes(gender)) filter.faceGenders.push(gender);
    const age = group === FACET_GROUPS.age ? take(term, AGE_BRACKETS) : null;
    if (age && !filter.faceAges.includes(age)) filter.faceAges.push(age);
    if (group === FACET_GROUPS.scene && !filter.scenes.includes(term)) filter.scenes.push(term);
    const env = group === FACET_GROUPS.env ? take(term, ENVIRONMENTS) : null;
    if (env && !filter.sceneEnvironments.includes(env)) filter.sceneEnvironments.push(env);
    const garment = group === FACET_GROUPS.garment ? take(term, GARMENTS) : null;
    if (garment && !filter.garments.includes(garment)) filter.garments.push(garment);
    const excluded = group === FACET_GROUPS.exclude ? take(term, GARMENTS) : null;
    if (excluded && !filter.excludeGarments.includes(excluded)) filter.excludeGarments.push(excluded);
    const exposed = group === FACET_GROUPS.exposed ? take(term, NUDENET_LABELS) : null;
    if (exposed) {
      if (!exposedCustom) {
        filter.nsfwExposedLabels = [];
        exposedCustom = true;
      }
      if (!filter.nsfwExposedLabels.includes(exposed)) filter.nsfwExposedLabels.push(exposed);
    }
    if (group === FACET_GROUPS.rule && !filter.guardRules.includes(term)) filter.guardRules.push(term);
  }
  filter.minScore = readNumber(params, "min_score", DEFAULT_FILTER.minScore);
  filter.includeRejected = readFlag(params, "include_rejected");
  filter.keepSimilar = readFlag(params, "keep_similar");
  filter.minAgeYears = readOptional(params, "min_age");
  filter.maxAgeYears = readOptional(params, "max_age");
  filter.minAttributeConf = readNumber(params, "min_attr_conf", DEFAULT_FILTER.minAttributeConf);
  filter.minSceneConf = readNumber(params, "min_scene_conf", DEFAULT_FILTER.minSceneConf);
  filter.minGarmentConf = readNumber(params, "min_garment_conf", DEFAULT_FILTER.minGarmentConf);
  filter.garmentsUncropped = readFlag(params, "uncropped");
  const nsfw = readOptional(params, "nsfw");
  filter.nsfwThreshold = nsfw != null && nsfw >= 0.2 && nsfw <= 1 ? nsfw : null;
  filter.guardUnsafe = readFlag(params, "guard_unsafe");

  const page = readNumber(params, "page", 1);
  const view = params.get("view") === "people" ? "people" : "grid";
  return {
    scan: params.get("scan") || null,
    folder: params.get("folder") ?? "",
    page: page >= 1 ? Math.floor(page) : 1,
    photo: params.get("photo") || null,
    view,
    cluster: params.get("cluster") || null,
    guardPolicy: policyName(params.get("policy")),
    guardVariants: (params.get("variants") ?? "").split(",").map((name) => policyName(name)).filter((name): name is string => name != null),
    skipGarments: params.get("garments") === "off",
    setAge: params.get("set") === "1",
    filter,
  };
}

function appendFacet(params: URLSearchParams, group: string, terms: readonly string[]): void {
  for (const term of [...terms].sort()) params.append("f", `${group}:${term}`);
}

export function serializeView(view: ViewState): string {
  const params = new URLSearchParams();
  const filter = view.filter;
  if (view.scan) params.set("scan", view.scan);
  if (view.folder) params.set("folder", view.folder);
  if (view.page > 1) params.set("page", String(view.page));
  if (view.photo) params.set("photo", view.photo);
  if (view.view === "people") params.set("view", "people");
  if (view.cluster) params.set("cluster", view.cluster);
  if (view.guardPolicy) params.set("policy", view.guardPolicy);
  if (view.guardVariants.length > 0) params.set("variants", view.guardVariants.join(","));
  if (view.skipGarments) params.set("garments", "off");
  if (view.setAge) params.set("set", "1");
  if (filter.minScore !== DEFAULT_FILTER.minScore) params.set("min_score", String(filter.minScore));
  if (filter.includeRejected) params.set("include_rejected", "1");
  if (filter.keepSimilar) params.set("keep_similar", "1");
  if (filter.minAgeYears != null) params.set("min_age", String(filter.minAgeYears));
  if (filter.maxAgeYears != null) params.set("max_age", String(filter.maxAgeYears));
  if (filter.minAttributeConf !== DEFAULT_FILTER.minAttributeConf) {
    params.set("min_attr_conf", String(filter.minAttributeConf));
  }
  if (filter.minSceneConf !== DEFAULT_FILTER.minSceneConf) params.set("min_scene_conf", String(filter.minSceneConf));
  if (filter.minGarmentConf !== DEFAULT_FILTER.minGarmentConf) {
    params.set("min_garment_conf", String(filter.minGarmentConf));
  }
  if (filter.garmentsUncropped) params.set("uncropped", "1");
  if (filter.nsfwThreshold != null) params.set("nsfw", String(filter.nsfwThreshold));
  if (filter.guardUnsafe) params.set("guard_unsafe", "1");
  if (!sameMembers(filter.nsfwExposedLabels, EXPOSED_LABELS)) appendFacet(params, "exposed", filter.nsfwExposedLabels);
  appendFacet(params, "rule", filter.guardRules);
  appendFacet(params, "cluster", filter.faceClusters);
  appendFacet(params, "pose", filter.facePoses);
  appendFacet(params, "race", filter.faceRaces);
  appendFacet(params, "gender", filter.faceGenders);
  appendFacet(params, "age", filter.faceAges);
  appendFacet(params, "scene", filter.scenes);
  appendFacet(params, "env", filter.sceneEnvironments);
  appendFacet(params, "garment", filter.garments);
  appendFacet(params, "exclude", filter.excludeGarments);
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function toggleValue<T extends string>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export function withFilter(view: ViewState, patch: Partial<FilterState>): ViewState {
  return { ...view, page: 1, filter: { ...view.filter, ...patch } };
}

export type { ExposedLabel, FaceAge, FaceGender, FacePose, GarmentLabel, SceneEnvironment };
export { DEFAULT_VIEW };
