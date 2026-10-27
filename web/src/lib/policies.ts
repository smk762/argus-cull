import { isPositive, type ImageLabel } from "./labels";
import type { GuardResult, ImageResult } from "./types";

/** What a scan asks SingGuard to run: the official policy and the variants beside it. */
export interface PolicyChoice {
  policy: string;
  variants: string[];
}

export const DEFAULT_POLICY_CHOICE: PolicyChoice = { policy: "adult", variants: [] };

/** Pick the official policy the curator offers: adult when it exists, else the first listed. */
export function defaultPolicyChoice(available: readonly string[] | undefined): PolicyChoice {
  if (!available || available.length === 0) return DEFAULT_POLICY_CHOICE;
  return { policy: available.includes("adult") ? "adult" : available[0], variants: [] };
}

/** Drop the official name and repeats from the variant list, keeping the curator's order. */
export function normalisePolicyChoice(choice: PolicyChoice, available: readonly string[]): PolicyChoice {
  const policy = available.includes(choice.policy) ? choice.policy : (available.includes("adult") ? "adult" : available[0] ?? choice.policy);
  const variants = available.filter((name) => name !== policy && choice.variants.includes(name));
  return { policy, variants };
}

export interface PolicyVerdict {
  policy: string;
  result: GuardResult;
  official: boolean;
}

type Guarded = Pick<ImageResult, "guard" | "guard_variants">;

/** Every verdict on an image, official first, then variants in the curator's order. */
export function policyVerdicts(image: Guarded): PolicyVerdict[] {
  const out: PolicyVerdict[] = [];
  const official = image.guard ?? null;
  const officialName = official?.policy ?? null;
  if (official) out.push({ policy: officialName ?? "default", result: official, official: true });
  for (const [policy, result] of Object.entries(image.guard_variants ?? {})) {
    if (policy === officialName || result == null) continue;
    out.push({ policy, result, official: false });
  }
  return out;
}

/** Policy names a scan ran, official first. Taken from the config when it says, else from the results. */
export function policiesRun(summary: { guard_config?: { policy?: string; variants?: string[] }; results: Guarded[] } | null): string[] {
  if (!summary) return [];
  const config = summary.guard_config;
  if (config?.policy) return [config.policy, ...(config.variants ?? []).filter((name) => name !== config.policy)];
  const names: string[] = [];
  for (const image of summary.results) {
    for (const verdict of policyVerdicts(image)) if (!names.includes(verdict.policy)) names.push(verdict.policy);
  }
  return names;
}

/**
 * The verdict the shield follows. An override names one policy and uses it
 * alone. Otherwise the official verdict counts, and any variant that flags
 * where the official passes counts too. Null until a verdict exists.
 */
export function effectiveUnsafe(image: Guarded, override?: string | null): boolean | null {
  const verdicts = policyVerdicts(image);
  if (verdicts.length === 0) return null;
  if (override) {
    const chosen = verdicts.find((verdict) => verdict.policy === override);
    if (chosen) return !chosen.result.safe;
  }
  return verdicts.some((verdict) => !verdict.result.safe);
}

/** Names of the policies that flagged the image where the official one did not. */
export function dissentingPolicies(image: Guarded): string[] {
  const verdicts = policyVerdicts(image);
  const official = verdicts.find((verdict) => verdict.official);
  if (!official || !official.result.safe) return [];
  return verdicts.filter((verdict) => !verdict.official && !verdict.result.safe).map((verdict) => verdict.policy);
}

/**
 * What the shield on a tile shows. `none` is grey: no verdict yet. `unsafe` is
 * red: the verdict the shield follows flagged the image. `dissent` is orange:
 * the followed verdict passed but another policy flagged. `safe` is green.
 */
export type ShieldState = "none" | "safe" | "dissent" | "unsafe";

export function shieldState(image: Guarded, override?: string | null): ShieldState {
  const verdicts = policyVerdicts(image);
  if (verdicts.length === 0) return "none";
  const followed = (override && verdicts.find((verdict) => verdict.policy === override)) || verdicts.find((verdict) => verdict.official) || verdicts[0];
  if (!followed.result.safe) return "unsafe";
  return verdicts.some((verdict) => !verdict.result.safe) ? "dissent" : "safe";
}

/** One line for a tooltip: the followed verdict, then who disagreed. */
export function shieldTitle(image: Guarded, override?: string | null): string {
  const state = shieldState(image, override);
  if (state === "none") return "No policy verdict yet";
  const verdicts = policyVerdicts(image);
  const flagged = verdicts.filter((verdict) => !verdict.result.safe).map((verdict) => verdict.policy);
  if (state === "safe") return verdicts.length > 1 ? `Safe under ${verdicts.map((verdict) => verdict.policy).join(", ")}` : `Safe under ${verdicts[0].policy}`;
  if (state === "unsafe") return `Unsafe: ${flagged.join(", ")} flagged`;
  return `Followed verdict safe; ${flagged.join(", ")} flagged`;
}

/**
 * A verdict recorded as unsafe whose only rule is "Safe". SingGuard's fast
 * first-line signal said unsafe and its reasoned answer said Safe; a server
 * before this fix kept the first line. The scan needs re-running to settle it.
 */
export function verdictConflict(guard: GuardResult): boolean {
  return !guard.safe && guard.rules.length > 0 && guard.rules.every((rule) => rule.trim().toLowerCase() === "safe");
}

export interface PolicyStats {
  policy: string;
  official: boolean;
  /** Images this policy returned a verdict on. */
  checked: number;
  unsafe: number;
  /** Fired rules, by the full rule name. */
  rules: Record<string, number>;
  /** Against the official policy, over images both checked. Null for the official policy. */
  agreement: { both: number; onlyOfficial: number; onlyThis: number; neither: number } | null;
  /** Against labels, over labelled images this policy checked. */
  labelled: number;
  tp: number;
  fp: number;
  fn: number;
  tn: number;
}

/**
 * Flag rate per policy, agreement with the official verdict, and a confusion
 * count against labels. A label counts as positive when `isPositive` says so,
 * so proxy positives land in tp/fn like a hard case would.
 */
export function policyStats(images: readonly (Guarded & { rel_path: string })[], labels: ReadonlyMap<string, ImageLabel>, order: readonly string[] = []): PolicyStats[] {
  const byPolicy = new Map<string, PolicyStats>();
  const stat = (policy: string, official: boolean): PolicyStats => {
    let entry = byPolicy.get(policy);
    if (!entry) {
      entry = { policy, official, checked: 0, unsafe: 0, rules: {}, agreement: official ? null : { both: 0, onlyOfficial: 0, onlyThis: 0, neither: 0 }, labelled: 0, tp: 0, fp: 0, fn: 0, tn: 0 };
      byPolicy.set(policy, entry);
    }
    return entry;
  };
  for (const name of order) stat(name, name === order[0]);
  for (const image of images) {
    const verdicts = policyVerdicts(image);
    const official = verdicts.find((verdict) => verdict.official) ?? null;
    const label = labels.get(image.rel_path);
    const positive = label?.expect ? isPositive(label.expect) : null;
    for (const verdict of verdicts) {
      const entry = stat(verdict.policy, verdict.official);
      entry.checked += 1;
      const flagged = !verdict.result.safe;
      if (flagged) {
        entry.unsafe += 1;
        for (const rule of verdict.result.rules) entry.rules[rule] = (entry.rules[rule] ?? 0) + 1;
      }
      if (!verdict.official && official && entry.agreement) {
        const officialFlagged = !official.result.safe;
        if (flagged && officialFlagged) entry.agreement.both += 1;
        else if (officialFlagged) entry.agreement.onlyOfficial += 1;
        else if (flagged) entry.agreement.onlyThis += 1;
        else entry.agreement.neither += 1;
      }
      if (positive != null) {
        entry.labelled += 1;
        if (flagged && positive) entry.tp += 1;
        else if (flagged) entry.fp += 1;
        else if (positive) entry.fn += 1;
        else entry.tn += 1;
      }
    }
  }
  return [...byPolicy.values()].sort((left, right) => Number(right.official) - Number(left.official) || rank(order, left.policy) - rank(order, right.policy));
}

function rank(order: readonly string[], name: string): number {
  const index = order.indexOf(name);
  return index < 0 ? order.length : index;
}

export function rate(part: number, whole: number): string {
  if (whole <= 0) return "–";
  return `${Math.round((100 * part) / whole)}%`;
}
