import { finalJudgment } from "./guardText";
import { isPositive, type ImageLabel } from "./labels";
import type { GuardPolicyInfo, GuardResult, ImageResult } from "./types";

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

/** The listed wording for a policy name, or null when `/guard/policies` did not name it. */
export function policyByName(catalog: readonly GuardPolicyInfo[] | null | undefined, name: string): GuardPolicyInfo | null {
  return catalog?.find((entry) => entry.name === name) ?? null;
}

/** One word for `source`, as the wording fold's summary shows it. */
export function policySourceLabel(source: string): string {
  if (source === "file") return "policy file";
  if (source === "singguard") return "SingGuard";
  if (source === "builtin") return "built in";
  return source;
}

export interface PolicyVerdict {
  policy: string;
  result: GuardResult;
  official: boolean;
}

type Guarded = Pick<ImageResult, "guard" | "guard_variants">;

/**
 * Fast is a screen: a pass stands, a flag is settled by slower reasoning.
 * When the recorded payload kept the snap or treated an unreadable parse as
 * unsafe, but Step 3 or the answer said Safe, that slower result is the verdict.
 */
export function slowResultSafe(guard: GuardResult): boolean {
  if (guard.safe) return true;
  const judgment = finalJudgment(guard.explanation);
  if (judgment === "safe") return true;
  if (judgment === "unsafe") return false;
  if (guard.rules.length > 0 && guard.rules.every((rule) => rule.trim().toLowerCase() === "safe")) return true;
  return /the answer is Safe/i.test(guard.explanation ?? "");
}

/** The verdict to show and filter on: slow's result when it passed, else the record. */
export function resolvedGuard(guard: GuardResult): GuardResult {
  if (guard.safe || !slowResultSafe(guard)) return guard;
  return { ...guard, safe: true, rules: [] };
}

/** Every verdict on an image, official first, then variants in the curator's order. */
export function policyVerdicts(image: Guarded): PolicyVerdict[] {
  const out: PolicyVerdict[] = [];
  const official = image.guard ?? null;
  const officialName = official?.policy ?? null;
  if (official) out.push({ policy: officialName ?? "default", result: resolvedGuard(official), official: true });
  for (const [policy, result] of Object.entries(image.guard_variants ?? {})) {
    if (policy === officialName || result == null) continue;
    out.push({ policy, result: resolvedGuard(result), official: false });
  }
  return out;
}

/**
 * Policy names a scan ran, official first. Taken from the config when it says,
 * else from the results. The curator records a policy name even when SingGuard
 * did not run, so a config marked not run names none.
 */
export function policiesRun(summary: { guard_config?: { enabled?: boolean | null; policy?: string; variants?: string[] }; results: Guarded[] } | null): string[] {
  if (!summary) return [];
  const config = summary.guard_config;
  if (config?.policy && config.enabled !== false) return [config.policy, ...(config.variants ?? []).filter((name) => name !== config.policy)];
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
 * What the shield on a tile shows. The colour is the verdict the shield
 * follows: grey before any verdict, green passed, red flagged. An orange
 * core means another policy disagreed with that verdict.
 */
export type ShieldState = "none" | "safe" | "safe-split" | "unsafe" | "unsafe-split";

/** The verdict the shield follows: the override's policy when it ran, else the official one. */
function followedVerdict(verdicts: PolicyVerdict[], override?: string | null): PolicyVerdict {
  return (override && verdicts.find((verdict) => verdict.policy === override)) || verdicts.find((verdict) => verdict.official) || verdicts[0];
}

export function shieldState(image: Guarded, override?: string | null): ShieldState {
  const verdicts = policyVerdicts(image);
  if (verdicts.length === 0) return "none";
  const followed = followedVerdict(verdicts, override);
  const split = verdicts.some((verdict) => verdict.result.safe !== followed.result.safe);
  if (followed.result.safe) return split ? "safe-split" : "safe";
  return split ? "unsafe-split" : "unsafe";
}

/**
 * What the grid's Policy select picks. These are queries, not a partition:
 * Split overlaps both Safe and Unsafe. Unsafe is the determined fail (the
 * shield is red), so official-safe with a flagging variant is Split, not
 * Unsafe: that is a split toward safe, not a fail.
 */
export type ShieldPick = "safe" | "split" | "unsafe";

export const SHIELD_PICKS = ["unsafe", "split", "safe"] as const satisfies readonly ShieldPick[];

export const SHIELD_PICK_LABELS: Record<ShieldPick, string> = {
  unsafe: "Unsafe",
  split: "Split",
  safe: "Safe",
};

export function matchesShieldPick(state: ShieldState, pick: ShieldPick): boolean {
  switch (pick) {
    case "safe":
      return state === "safe" || state === "safe-split";
    case "unsafe":
      return state === "unsafe" || state === "unsafe-split";
    case "split":
      return state === "safe-split" || state === "unsafe-split";
  }
}

/** Paths whose shield matches the pick. An override names the policy the shield follows, the way the tile does. */
export function pathsByShield(images: readonly (Guarded & { rel_path: string })[], pick: ShieldPick, override: (relPath: string) => string | null = () => null): string[] {
  return filterByShield(images, pick, override).map((image) => image.rel_path);
}

export type ShieldView = "all" | ShieldPick;

/** Keep only images whose shield matches the pick. `all` leaves the list unchanged, including frames with no verdict. */
export function filterByShield<T extends Guarded & { rel_path: string }>(images: readonly T[], view: ShieldView, override: (relPath: string) => string | null = () => null): T[] {
  if (view === "all") return [...images];
  return images.filter((image) => matchesShieldPick(shieldState(image, override(image.rel_path)), view));
}

/** Short word for the state, as the detail view's summary strip shows it. */
export function shieldLabel(state: ShieldState): string {
  switch (state) {
    case "none":
      return "no verdict";
    case "safe":
      return "safe";
    case "safe-split":
      return "safe, split";
    case "unsafe":
      return "unsafe";
    case "unsafe-split":
      return "unsafe, split";
  }
}

/** One line for a tooltip: the followed verdict, then who disagreed. */
export function shieldTitle(image: Guarded, override?: string | null): string {
  const verdicts = policyVerdicts(image);
  if (verdicts.length === 0) return "No policy verdict yet";
  const followed = followedVerdict(verdicts, override);
  const others = verdicts.filter((verdict) => verdict.result.safe !== followed.result.safe).map((verdict) => verdict.policy);
  const verdict = followed.result.safe ? "Safe" : "Unsafe";
  if (others.length === 0) return `${verdict} under ${verdicts.map((entry) => entry.policy).join(", ")}`;
  return `${verdict} under ${followed.policy}; ${others.join(", ")} ${followed.result.safe ? "flagged" : "passed"}`;
}

/**
 * A verdict recorded as unsafe whose only rule is "Safe". That is the fast
 * screen, not a disagreement: `resolvedGuard` treats it as safe.
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

/** One shield per policy on a tile: that policy's own verdict, not the combined one. */
export interface PolicyShield {
  policy: string;
  official: boolean;
  state: "none" | "safe" | "unsafe";
  /** Tooltip: the policy, its verdict, and the rules it fired. */
  title: string;
}

/**
 * A shield for every policy the scan ran, in the scan's order, so a tile shows
 * at a glance how many policies ran and what each said. Grey means queued: a
 * policy with no verdict on this image gets one only while SingGuard is still
 * running, and none once the scan is done. A verdict from a policy the list
 * does not name still gets a shield, after the named ones.
 */
export function policyShields(image: Guarded, policies: readonly string[], override?: string | null, checking = false): PolicyShield[] {
  const verdicts = policyVerdicts(image);
  const names = [...policies];
  for (const verdict of verdicts) if (!names.includes(verdict.policy)) names.push(verdict.policy);
  return names.flatMap((policy, index): PolicyShield[] => {
    const verdict = verdicts.find((entry) => entry.policy === policy) ?? null;
    if (!verdict && !checking) return [];
    const official = verdict ? verdict.official : index === 0 && policies.length > 0;
    const name = `${policy}${official ? " (official)" : ""}`;
    const follows = override === policy ? " The blur follows this policy." : "";
    if (!verdict) return [{ policy, official, state: "none", title: `${name}: queued` }];
    if (verdict.result.safe) return [{ policy, official, state: "safe", title: `${name}: safe.${follows}` }];
    const rules = verdict.result.rules.length > 0 ? verdict.result.rules.join("; ") : "no rule named";
    return [{ policy, official, state: "unsafe", title: `${name}: unsafe. ${rules}.${follows}` }];
  });
}
