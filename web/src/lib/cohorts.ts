import type { ImageLabel } from "./labels";
import { policyVerdicts } from "./policies";
import type { ImageResult } from "./types";

/**
 * Cohorts group images by setting and wardrobe so flag rates can be compared
 * for the same performer across styles. The rules come from cohorts.json at
 * the repo root (`CULL_COHORTS_FILE` inside the container), served by
 * `/api/cohorts`, so the list can be refined without a rebuild.
 */
export interface CohortRule {
  tag: string;
  /** setting, wardrobe, prop, or any word that groups the tags in the panel. */
  group: string;
  /** Places365 category names as the curator records them, e.g. "library/indoor". */
  scenes: string[];
  /** Whole-word phrases matched against the image's caption sidecar. */
  captions: string[];
  /** Overrides the file's scene_min_conf for this tag. */
  min_scene_conf?: number;
}

export interface CohortConfig {
  scene_min_conf: number;
  tags: CohortRule[];
}

export const EMPTY_COHORTS: CohortConfig = { scene_min_conf: 0.2, tags: [] };

export const TAG_PATTERN = /^[a-z0-9][a-z0-9_/-]{0,63}$/i;

/** Validate a parsed cohorts.json. Throws with the first problem found, naming the entry. */
export function parseCohortConfig(raw: unknown): CohortConfig {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) throw new Error("cohorts.json must be an object");
  const file = raw as Record<string, unknown>;
  const sceneMinConf = file.scene_min_conf == null ? EMPTY_COHORTS.scene_min_conf : file.scene_min_conf;
  if (typeof sceneMinConf !== "number" || !(sceneMinConf >= 0 && sceneMinConf <= 1)) throw new Error("scene_min_conf must be a number from 0 to 1");
  if (!Array.isArray(file.tags)) throw new Error("tags must be a list");
  const seen = new Set<string>();
  const tags = file.tags.map((entry, index) => {
    const where = `tags[${index}]`;
    if (entry == null || typeof entry !== "object" || Array.isArray(entry)) throw new Error(`${where} must be an object`);
    const rule = entry as Record<string, unknown>;
    if (typeof rule.tag !== "string" || !TAG_PATTERN.test(rule.tag)) throw new Error(`${where}.tag must be a short name of letters, digits, _ - or /`);
    if (seen.has(rule.tag)) throw new Error(`${where}.tag "${rule.tag}" repeats an earlier tag`);
    seen.add(rule.tag);
    const group = rule.group == null ? "other" : rule.group;
    if (typeof group !== "string" || group.trim() === "") throw new Error(`${where}.group must be a word`);
    const scenes = stringList(rule.scenes, `${where}.scenes`);
    const captions = stringList(rule.captions, `${where}.captions`);
    if (scenes.length === 0 && captions.length === 0) throw new Error(`${where} needs scenes or captions`);
    let minSceneConf: number | undefined;
    if (rule.min_scene_conf != null) {
      if (typeof rule.min_scene_conf !== "number" || !(rule.min_scene_conf >= 0 && rule.min_scene_conf <= 1)) throw new Error(`${where}.min_scene_conf must be a number from 0 to 1`);
      minSceneConf = rule.min_scene_conf;
    }
    return { tag: rule.tag, group: group.trim(), scenes, captions, ...(minSceneConf == null ? {} : { min_scene_conf: minSceneConf }) };
  });
  return { scene_min_conf: sceneMinConf, tags };
}

function stringList(value: unknown, where: string): string[] {
  if (value == null) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim() === "")) throw new Error(`${where} must be a list of words`);
  return (value as string[]).map((item) => item.trim());
}

/** What a caption sidecar said about an image: the caption text and any keywords. */
export interface Caption {
  text: string;
  keywords: string[];
}

/** Whole-word, case-insensitive match. Spaces in the phrase also match a hyphen or underscore. */
export function matchesPhrase(text: string, phrase: string): boolean {
  const words = phrase.trim().split(/\s+/).map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (words.length === 0 || words[0] === "") return false;
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${words.join("[\\s_-]+")}(?![\\p{L}\\p{N}])`, "iu");
  return pattern.test(text);
}

function captionText(caption: Caption | null | undefined): string {
  if (!caption) return "";
  return [caption.text, ...caption.keywords].join("\n");
}

/** Tags the rules apply to an image from its scene categories and caption, in config order. */
export function autoTags(image: Pick<ImageResult, "scene">, caption: Caption | null | undefined, config: CohortConfig): string[] {
  const text = captionText(caption);
  const out: string[] = [];
  for (const rule of config.tags) {
    const minConf = rule.min_scene_conf ?? config.scene_min_conf;
    const byScene = rule.scenes.length > 0 && (image.scene?.categories ?? []).some((category) => rule.scenes.includes(category.label) && category.conf >= minConf);
    const byCaption = text !== "" && rule.captions.some((phrase) => matchesPhrase(text, phrase));
    if (byScene || byCaption) out.push(rule.tag);
  }
  return out;
}

/** The tags that count: the label's own list when it has one, else the automatic tags. */
export function effectiveTags(auto: readonly string[], label: Pick<ImageLabel, "tags"> | null | undefined): string[] {
  return label?.tags ? [...label.tags] : [...auto];
}

export function filterByTag(images: ImageResult[], tags: ReadonlyMap<string, readonly string[]>, tag: string | null): ImageResult[] {
  if (tag == null) return images;
  return images.filter((image) => (tags.get(image.rel_path) ?? []).includes(tag));
}

/** NudeNet exposed-score bands. Wardrobe moves exposure too, so rates are read within a band. */
export const BANDS = ["low", "mid", "high", "unscored"] as const;
export type Band = (typeof BANDS)[number];
export const BAND_LABELS: Record<Band, string> = { low: "NudeNet < 0.2", mid: "0.2 – 0.5", high: "≥ 0.5", unscored: "no NudeNet" };

export function bandOf(image: Pick<ImageResult, "nsfw">): Band {
  const score = image.nsfw?.exposed_score;
  if (score == null) return "unscored";
  if (score < 0.2) return "low";
  if (score < 0.5) return "mid";
  return "high";
}

export interface CohortCell {
  checked: number;
  unsafe: number;
}

export interface CohortPolicyStats {
  policy: string;
  official: boolean;
  tagged: CohortCell;
  rest: CohortCell;
  bands: Record<Band, { tagged: CohortCell; rest: CohortCell }>;
}

export interface CohortStats {
  tag: string;
  group: string;
  /** Images in the view carrying the tag. */
  images: number;
  policies: CohortPolicyStats[];
}

const cell = (): CohortCell => ({ checked: 0, unsafe: 0 });

/**
 * Per tag and policy, flag rate on tagged images against the rest of the view,
 * overall and within each NudeNet band. Tags nothing in the view carries are
 * left out; policies follow `order`, official first.
 */
export function cohortStats(
  images: readonly ImageResult[],
  tags: ReadonlyMap<string, readonly string[]>,
  config: CohortConfig,
  order: readonly string[],
): CohortStats[] {
  const out: CohortStats[] = [];
  for (const rule of config.tags) {
    const tagged = images.filter((image) => (tags.get(image.rel_path) ?? []).includes(rule.tag));
    if (tagged.length === 0) continue;
    const byPolicy = new Map<string, CohortPolicyStats>();
    const stat = (policy: string, official: boolean) => {
      let entry = byPolicy.get(policy);
      if (!entry) {
        entry = {
          policy,
          official,
          tagged: cell(),
          rest: cell(),
          bands: { low: { tagged: cell(), rest: cell() }, mid: { tagged: cell(), rest: cell() }, high: { tagged: cell(), rest: cell() }, unscored: { tagged: cell(), rest: cell() } },
        };
        byPolicy.set(policy, entry);
      }
      return entry;
    };
    for (const name of order) stat(name, name === order[0]);
    for (const image of images) {
      const inCohort = (tags.get(image.rel_path) ?? []).includes(rule.tag);
      const band = bandOf(image);
      for (const verdict of policyVerdicts(image)) {
        const entry = stat(verdict.policy, verdict.official);
        const flagged = !verdict.result.safe;
        for (const target of inCohort ? [entry.tagged, entry.bands[band].tagged] : [entry.rest, entry.bands[band].rest]) {
          target.checked += 1;
          if (flagged) target.unsafe += 1;
        }
      }
    }
    const policies = [...byPolicy.values()].sort((left, right) => Number(right.official) - Number(left.official) || rank(order, left.policy) - rank(order, right.policy));
    out.push({ tag: rule.tag, group: rule.group, images: tagged.length, policies });
  }
  return out;
}

function rank(order: readonly string[], name: string): number {
  const index = order.indexOf(name);
  return index < 0 ? order.length : index;
}
