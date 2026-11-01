import { policyVerdicts, resolvedGuard } from "./policies";
import {
  ADULT_RULE_A,
  EXPOSED_LABELS,
  GUARD_RULES,
  SUGGESTIVE_LABELS,
  type ContentRating,
  type FilterState,
  type ImageResult,
  type NudeNetLabel,
  type NsfwResult,
  type ScanSummary,
} from "./types";

export function sameMembers(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const have = new Set(right);
  return left.every((item) => have.has(item));
}

/** Blur until the viewer asks. An exposed score or an unsafe verdict is enough. */
export function isSensitive(image: Pick<ImageResult, "nsfw" | "guard">): boolean {
  if ((image.nsfw?.exposed_score ?? 0) > 0) return true;
  return image.guard != null && !resolvedGuard(image.guard).safe;
}

export function nudeNetLabel(label: string): string {
  return label.toLowerCase().replaceAll("_", " ");
}

/** NudeNet reports nothing under this. Matches the curator's floor for a content rating. */
const REPORTED = 0.2;

/**
 * NudeNet's content rating, the same way the curator derives `content_rating`.
 * `explicit`: an exposed class at or above 0.2. `suggestive`: otherwise a covered
 * intimate class. `safe`: neither. `null`: NudeNet did not check the image.
 */
export function rateContent(nsfw: NsfwResult | null | undefined): ContentRating | null {
  if (nsfw == null) return null;
  if ((nsfw.exposed_score ?? 0) >= REPORTED) return "explicit";
  if (SUGGESTIVE_LABELS.some((label) => (nsfw.labels[label] ?? 0) >= REPORTED)) return "suggestive";
  return "safe";
}

/** The server's `content_rating` when present, else the same derivation from `nsfw`. */
export function contentRating(image: Pick<ImageResult, "content_rating" | "nsfw">): ContentRating | null {
  if ("content_rating" in image && image.content_rating !== undefined) return image.content_rating;
  return rateContent(image.nsfw);
}

/** How many images in the scan have each rating. Unchecked images are not counted. */
export function ratingCounts(results: readonly Pick<ImageResult, "content_rating" | "nsfw">[]): Record<ContentRating, number> {
  const counts = { safe: 0, suggestive: 0, explicit: 0 };
  for (const image of results) {
    const rating = contentRating(image);
    if (rating) counts[rating] += 1;
  }
  return counts;
}

/** Send a custom exposed set only when a threshold is live and the set is not the default. */
export function exposedLabelsForRequest(filter: FilterState, active: boolean): NudeNetLabel[] | undefined {
  if (!active || filter.nsfwThreshold == null || filter.nsfwExposedLabels.length === 0) return undefined;
  if (sameMembers(filter.nsfwExposedLabels, EXPOSED_LABELS)) return undefined;
  return [...filter.nsfwExposedLabels];
}

/** Rules a scan recorded under any of its policies, official or variant, that are not already in the default policy list. */
export function recordedGuardRules(summary: ScanSummary | null, known: readonly string[]): string[] {
  const knownSet = new Set(known);
  const extra = new Set<string>();
  for (const image of summary?.results ?? []) {
    for (const rule of policyVerdicts(image).flatMap((verdict) => verdict.result.rules)) {
      const letter = rule.trim().slice(0, 1).toUpperCase();
      if (!knownSet.has(letter) && !knownSet.has(rule)) extra.add(rule);
    }
  }
  return [...extra].sort();
}

/** The curator's match: *wanted* names *fired* in full, or by its letter ("A" or "A." for "A. Sexual Content Risk"). */
export function ruleMatches(fired: string, wanted: string): boolean {
  const a = fired.trim().toLowerCase();
  const b = wanted.trim().toLowerCase();
  return a === b || a.startsWith(`${b.replace(/\.$/, "")}.`);
}

/**
 * Images per rule: an image counts once for a rule when any policy's verdict
 * on it is unsafe and names that rule, as the Rules filter tests it.
 */
export function guardRuleCounts(results: readonly ImageResult[], rules: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const image of results) {
    const fired = policyVerdicts(image).flatMap((verdict) => (verdict.result.safe ? [] : verdict.result.rules));
    if (fired.length === 0) continue;
    for (const rule of rules) if (fired.some((name) => ruleMatches(name, rule))) counts.set(rule, (counts.get(rule) ?? 0) + 1);
  }
  return counts;
}

/** The name a rule letter has under the policy *summary* was judged by. */
export function guardRuleLabel(id: string, summary: ScanSummary | null): string {
  if (id === "A" && summary?.guard_config?.policy === "adult") return ADULT_RULE_A;
  return GUARD_RULES.find((rule) => rule.id === id)?.label ?? id;
}
