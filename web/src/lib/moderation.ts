import { ADULT_RULE_A, EXPOSED_LABELS, GUARD_RULES, type FilterState, type ImageResult, type NudeNetLabel, type ScanSummary } from "./types";

export function sameMembers(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const have = new Set(right);
  return left.every((item) => have.has(item));
}

/** Blur until the viewer asks. An exposed score or an unsafe verdict is enough. */
export function isSensitive(image: Pick<ImageResult, "nsfw" | "guard">): boolean {
  if ((image.nsfw?.exposed_score ?? 0) > 0) return true;
  return image.guard?.safe === false;
}

export function nudeNetLabel(label: string): string {
  return label.toLowerCase().replaceAll("_", " ");
}

/** Send a custom exposed set only when a threshold is live and the set is not the default. */
export function exposedLabelsForRequest(filter: FilterState, active: boolean): NudeNetLabel[] | undefined {
  if (!active || filter.nsfwThreshold == null || filter.nsfwExposedLabels.length === 0) return undefined;
  if (sameMembers(filter.nsfwExposedLabels, EXPOSED_LABELS)) return undefined;
  return [...filter.nsfwExposedLabels];
}

/** Rules a scan recorded that are not already in the default policy list. */
export function recordedGuardRules(summary: ScanSummary | null, known: readonly string[]): string[] {
  const knownSet = new Set(known);
  const extra = new Set<string>();
  for (const image of summary?.results ?? []) {
    for (const rule of image.guard?.rules ?? []) {
      const letter = rule.trim().slice(0, 1).toUpperCase();
      if (!knownSet.has(letter) && !knownSet.has(rule)) extra.add(rule);
    }
  }
  return [...extra].sort();
}

/** The name a rule letter has under the policy *summary* was judged by. */
export function guardRuleLabel(id: string, summary: ScanSummary | null): string {
  if (id === "A" && summary?.guard_config?.policy === "adult") return ADULT_RULE_A;
  return GUARD_RULES.find((rule) => rule.id === id)?.label ?? id;
}
