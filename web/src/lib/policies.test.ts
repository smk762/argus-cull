import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { shouldBlur, sortImages } from "./chunks";
import { emptyLabel, isPositive, labelsJsonl, type ImageLabel } from "./labels";
import { labelFileName, readLabels, writeLabel } from "./labelStore";
import { defaultPolicyChoice, dissentingPolicies, effectiveUnsafe, filterByShield, matchesShieldPick, normalisePolicyChoice, pathsByShield, policiesRun, policyByName, policyShields, policySourceLabel, policyStats, policyVerdicts, resolvedGuard, shieldLabel, shieldState, shieldTitle, slowResultSafe, verdictConflict } from "./policies";
import { guardBody, guardPoliciesForRequest, selectBody } from "./select";
import { DEFAULT_FILTER, type Detectors, type GuardResult, type ImageResult, type ScanSummary } from "./types";

const safe = (policy: string): GuardResult => ({ safe: true, rules: [], policy });
const unsafe = (policy: string, rule = "A. Sexual Content Risk"): GuardResult => ({ safe: false, rules: [rule], policy });

const DETECTORS: Detectors = {
  torch: true,
  cuda: false,
  clip: false,
  insightface: false,
  onnxruntime: false,
  fairface: false,
  mivolo: false,
  places365: false,
  garments: false,
  singguard: true,
  singguard_policies: ["default", "adult", "adult-granular", "adult-cautious"],
};

/** Official adult passes; granular flags. The curator includes the official verdict in guard_variants. */
const split = {
  rel_path: "split.jpg",
  guard: safe("adult"),
  guard_variants: { adult: safe("adult"), "adult-granular": unsafe("adult-granular", "H. Apparent Minor"), "adult-cautious": safe("adult-cautious") },
} as unknown as ImageResult;
const agreed = { rel_path: "agreed.jpg", guard: unsafe("adult"), guard_variants: { adult: unsafe("adult"), "adult-granular": unsafe("adult-granular"), "adult-cautious": unsafe("adult-cautious") } } as unknown as ImageResult;
const clean = { rel_path: "clean.jpg", guard: safe("adult"), guard_variants: { adult: safe("adult"), "adult-granular": safe("adult-granular") } } as unknown as ImageResult;
const single = { rel_path: "single.jpg", guard: unsafe("default"), guard_variants: null } as unknown as ImageResult;
/** Official flags; a variant passes. Determined fail, split. */
const dissent = { rel_path: "dissent.jpg", guard: unsafe("adult"), guard_variants: { "adult-cautious": safe("adult-cautious") } } as unknown as ImageResult;
const unchecked = { rel_path: "unchecked.jpg" } as unknown as ImageResult;

describe("policy catalog", () => {
  const catalog = [
    { name: "default", recorded: "default", source: "singguard" as const, text: null, error: null },
    { name: "adult", recorded: "adult", source: "builtin" as const, text: "### A. Minors", error: null },
    { name: "file-broken", recorded: null, source: "file" as const, text: null, error: "set ARGUS_CURATOR_SINGGUARD_POLICY" },
  ];

  it("looks a policy up by the name a scan uses", () => {
    expect(policyByName(catalog, "adult")?.text).toBe("### A. Minors");
    expect(policyByName(catalog, "missing")).toBeNull();
    expect(policyByName(null, "adult")).toBeNull();
    expect(policySourceLabel("builtin")).toBe("built in");
    expect(policySourceLabel("file")).toBe("policy file");
    expect(policySourceLabel("singguard")).toBe("SingGuard");
  });
});

describe("policy verdicts", () => {
  it("lists the official verdict once, then the variants", () => {
    expect(policyVerdicts(split).map((verdict) => [verdict.policy, verdict.official, verdict.result.safe])).toEqual([
      ["adult", true, true],
      ["adult-granular", false, false],
      ["adult-cautious", false, true],
    ]);
    expect(policyVerdicts(single).map((verdict) => verdict.policy)).toEqual(["default"]);
    expect(policyVerdicts(unchecked)).toEqual([]);
  });

  it("follows the union unless an override names one policy", () => {
    expect(effectiveUnsafe(split)).toBe(true);
    expect(effectiveUnsafe(split, "adult")).toBe(false);
    expect(effectiveUnsafe(split, "adult-granular")).toBe(true);
    expect(effectiveUnsafe(split, "not-run")).toBe(true);
    expect(effectiveUnsafe(clean)).toBe(false);
    expect(effectiveUnsafe(unchecked)).toBeNull();
    expect(dissentingPolicies(split)).toEqual(["adult-granular"]);
    expect(dissentingPolicies(agreed)).toEqual([]);
  });

  it("colours the shield by the followed verdict, with a core when a policy disagrees", () => {
    expect(shieldState(unchecked)).toBe("none");
    expect(shieldState(clean)).toBe("safe");
    expect(shieldState(agreed)).toBe("unsafe");
    expect(shieldState(single)).toBe("unsafe");
    // Official passes, a variant flags: green with the core, and the union still blurs.
    expect(shieldState(split)).toBe("safe-split");
    // Following the flagging variant makes it red with the core; the official one keeps green with the core.
    expect(shieldState(split, "adult-granular")).toBe("unsafe-split");
    expect(shieldState(split, "adult")).toBe("safe-split");
    expect(shieldState(split, "not-run")).toBe("safe-split");
    expect(shieldTitle(unchecked)).toBe("No policy verdict yet");
    expect(shieldTitle(split)).toBe("Safe under adult; adult-granular flagged");
    expect(shieldTitle(split, "adult-granular")).toBe("Unsafe under adult-granular; adult, adult-cautious passed");
    expect(shieldTitle(agreed)).toBe("Unsafe under adult, adult-granular, adult-cautious");
    expect(shieldTitle(clean)).toBe("Safe under adult, adult-granular");
    expect(shieldLabel("unsafe-split")).toBe("unsafe, split");
  });

  it("selects by the determined verdict, and Split is the disagreement", () => {
    const images = [clean, split, agreed, single, dissent, unchecked];
    // Unsafe is a red shield: unanimous fail, or official fail with a passing variant. Official-safe with a flagging variant is not.
    expect(pathsByShield(images, "unsafe")).toEqual(["agreed.jpg", "single.jpg", "dissent.jpg"]);
    expect(pathsByShield(images, "split")).toEqual(["split.jpg", "dissent.jpg"]);
    expect(pathsByShield(images, "safe")).toEqual(["clean.jpg", "split.jpg"]);
    // Following the flagging variant turns the split into a determined fail.
    expect(pathsByShield(images, "unsafe", (rel) => (rel === "split.jpg" ? "adult-granular" : null))).toEqual(["split.jpg", "agreed.jpg", "single.jpg", "dissent.jpg"]);
    expect(pathsByShield(images, "safe", (rel) => (rel === "split.jpg" ? "adult-granular" : null))).toEqual(["clean.jpg"]);
    expect(matchesShieldPick("unsafe-split", "unsafe")).toBe(true);
    expect(matchesShieldPick("safe-split", "unsafe")).toBe(false);
    expect(matchesShieldPick("none", "unsafe")).toBe(false);
    // The same queries hide tiles. All keeps frames with no verdict; Unsafe/Safe/Split do not.
    expect(filterByShield(images, "all")).toHaveLength(6);
    expect(filterByShield(images, "unsafe").map((image) => image.rel_path)).toEqual(["agreed.jpg", "single.jpg", "dissent.jpg"]);
    expect(filterByShield(images, "split").map((image) => image.rel_path)).toEqual(["split.jpg", "dissent.jpg"]);
    expect(filterByShield(images, "safe").map((image) => image.rel_path)).toEqual(["clean.jpg", "split.jpg"]);
    expect(filterByShield(images, "unsafe")).not.toContainEqual(expect.objectContaining({ rel_path: "unchecked.jpg" }));
    expect(filterByShield([unchecked], "all")).toEqual([unchecked]);
    expect(filterByShield([unchecked], "unsafe")).toEqual([]);
    expect(filterByShield([unchecked], "safe")).toEqual([]);
    expect(filterByShield([unchecked], "split")).toEqual([]);
  });

  it("spots a recorded unsafe whose only rule is Safe", () => {
    expect(verdictConflict({ safe: false, rules: ["Safe"] })).toBe(true);
    expect(verdictConflict({ safe: false, rules: ["safe "] })).toBe(true);
    expect(verdictConflict({ safe: false, rules: ["A. Sexual Content Risk"] })).toBe(false);
    expect(verdictConflict({ safe: false, rules: [] })).toBe(false);
    expect(verdictConflict({ safe: true, rules: ["Safe"] })).toBe(false);
  });

  it("treats a slow pass as safe, not as a disagreement with the fast flag", () => {
    const cascadeSafe: GuardResult = {
      safe: false,
      rules: [],
      policy: "adult-granular",
      explanation: [
        "Cascade: fast flagged this; the slow pass is the verdict.",
        "SingGuard did not give a safe or unsafe verdict. The check is unsafe so an unreadable result is not treated as safe.",
        "[Step 3] Final Judgment",
        "The subject is an adult, the content is non-exploitative. Therefore, the content is safe.",
      ].join("\n\n"),
    };
    expect(slowResultSafe(cascadeSafe)).toBe(true);
    expect(resolvedGuard(cascadeSafe)).toMatchObject({ safe: true, rules: [] });
    expect(verdictConflict({ safe: false, rules: ["Safe"] })).toBe(true);
    expect(slowResultSafe({ safe: false, rules: ["Safe"] })).toBe(true);
    expect(resolvedGuard({ safe: false, rules: ["Safe"] }).safe).toBe(true);
    const image = { rel_path: "cascade.jpg", guard: cascadeSafe } as unknown as ImageResult;
    expect(effectiveUnsafe(image)).toBe(false);
    expect(shieldState(image)).toBe("safe");
    expect(policyVerdicts(image)[0].result.safe).toBe(true);
  });

  it("keeps a slow fail, and an unreadable result with no final judgment", () => {
    const slowFail: GuardResult = {
      safe: false,
      rules: ["A. Sexual Content Risk"],
      explanation: "[Step 3] Final Judgment\nBased on the assessment, conclude unsafe.\n",
    };
    expect(slowResultSafe(slowFail)).toBe(false);
    expect(resolvedGuard(slowFail).safe).toBe(false);
    expect(slowResultSafe({ safe: false, rules: [], explanation: "SingGuard did not give a safe or unsafe verdict." })).toBe(false);
  });

  it("blurs and sorts on the union, and lets an override lift it", () => {
    const low = { nsfw: { detections: [], labels: {}, exposed_score: 0 } };
    expect(shouldBlur({ ...low, ...split }, [])).toBe(true);
    expect(shouldBlur({ ...low, ...split }, [], undefined, "adult")).toBe(false);
    expect(sortImages([clean, split], "policy").map((image) => image.rel_path)).toEqual(["split.jpg", "clean.jpg"]);
  });

  it("names the policies a scan ran from its config, else from the results", () => {
    const configured = { guard_config: { enabled: true, policy: "adult", variants: ["adult-granular", "adult"] }, results: [] } as unknown as ScanSummary;
    expect(policiesRun(configured)).toEqual(["adult", "adult-granular"]);
    expect(policiesRun({ guard_config: { enabled: true }, results: [split, clean] } as unknown as ScanSummary)).toEqual(["adult", "adult-granular", "adult-cautious"]);
    expect(policiesRun(null)).toEqual([]);
    expect(policiesRun({ guard_config: { enabled: false, policy: "adult" }, results: [] } as unknown as ScanSummary)).toEqual([]);
  });

  it("counts flag rate, disagreement, and a confusion table against labels", () => {
    const labels = new Map<string, ImageLabel>([
      ["split.jpg", { expect: "hard", proxy: true, updated_at: "" }],
      ["agreed.jpg", { expect: "adult", updated_at: "" }],
      ["clean.jpg", { expect: "safe", updated_at: "" }],
    ]);
    const stats = policyStats([split, agreed, clean, unchecked], labels, ["adult", "adult-granular", "adult-cautious"]);
    expect(stats.map((entry) => entry.policy)).toEqual(["adult", "adult-granular", "adult-cautious"]);
    const [adult, granular, cautious] = stats;
    expect(adult.official).toBe(true);
    expect([adult.checked, adult.unsafe]).toEqual([3, 1]);
    expect(adult.agreement).toBeNull();
    // Adult flags agreed.jpg (labelled adult: a false positive) and misses the proxy hard case.
    expect([adult.tp, adult.fp, adult.fn, adult.tn]).toEqual([0, 1, 1, 1]);
    expect(granular.agreement).toEqual({ both: 1, onlyOfficial: 0, onlyThis: 1, neither: 1 });
    expect([granular.tp, granular.fp, granular.fn, granular.tn]).toEqual([1, 1, 0, 1]);
    expect(granular.rules).toEqual({ "H. Apparent Minor": 1, "A. Sexual Content Risk": 1 });
    expect([cautious.checked, cautious.labelled]).toEqual([2, 2]);
  });
});

describe("policy shields", () => {
  it("gives every policy the scan ran its own shield, with the rules in the tooltip", () => {
    const image = { guard: safe("adult"), guard_variants: { strict: unsafe("strict") } };
    const shields = policyShields(image, ["adult", "strict"], "strict");
    expect(shields.map((shield) => [shield.policy, shield.state])).toEqual([
      ["adult", "safe"],
      ["strict", "unsafe"],
    ]);
    expect(shields[0].title).toBe("adult (official): safe.");
    expect(shields[1].title).toBe("strict: unsafe. A. Sexual Content Risk. The blur follows this policy.");
  });

  it("greys a missing verdict only while SingGuard is queued, and keeps unlisted verdicts", () => {
    const image = { guard: safe("adult") };
    expect(policyShields(image, ["adult", "strict"], null, true).map((shield) => [shield.policy, shield.state, shield.title])).toEqual([
      ["adult", "safe", "adult (official): safe."],
      ["strict", "none", "strict: queued"],
    ]);
    expect(policyShields(image, ["adult", "strict"]).map((shield) => shield.policy)).toEqual(["adult"]);
    expect(policyShields({ guard: null }, ["adult"])).toEqual([]);
    expect(policyShields({ guard: unsafe("adult") }, []).map((shield) => [shield.policy, shield.official])).toEqual([["adult", true]]);
  });
});

describe("policy choice", () => {
  it("defaults to adult when the curator offers it", () => {
    expect(defaultPolicyChoice(DETECTORS.singguard_policies)).toEqual({ policy: "adult", variants: [] });
    expect(defaultPolicyChoice(["default"])).toEqual({ policy: "default", variants: [] });
    expect(defaultPolicyChoice(undefined)).toEqual({ policy: "adult", variants: [] });
  });

  it("drops the official name, repeats, and names the curator does not list", () => {
    const choice = normalisePolicyChoice({ policy: "adult", variants: ["adult", "adult-cautious", "adult-granular", "nope", "adult-granular"] }, DETECTORS.singguard_policies ?? []);
    expect(choice).toEqual({ policy: "adult", variants: ["adult-granular", "adult-cautious"] });
    expect(normalisePolicyChoice({ policy: "nope", variants: [] }, ["default", "adult"]).policy).toBe("adult");
  });

  it("sends names only when the curator lists them", () => {
    expect(guardBody(DETECTORS, { policy: "adult", variants: ["adult-granular"] })).toEqual({ enabled: true, policy: "adult", variants: ["adult-granular"] });
    expect(guardBody(DETECTORS, { policy: "adult", variants: [] })).toEqual({ enabled: true, policy: "adult" });
    expect(guardBody({ ...DETECTORS, singguard_policies: undefined }, { policy: "adult", variants: ["adult-granular"] })).toEqual({ enabled: true });
    expect(guardBody({ ...DETECTORS, singguard: false }, null)).toEqual({ enabled: false });
  });

  it("filters on every policy the scan ran once a guard filter is on", () => {
    const summary = { guard_config: { enabled: true, policy: "adult", variants: ["adult-granular"] }, results: [] } as unknown as ScanSummary;
    const gates = { faces: false, mivolo: false, scenes: false, garments: false, nsfw: false, guard: true };
    expect(guardPoliciesForRequest(summary, true)).toEqual(["adult", "adult-granular"]);
    expect(guardPoliciesForRequest({ ...summary, guard_config: { enabled: true, policy: "adult" } } as ScanSummary, true)).toBeUndefined();
    expect(selectBody({ ...DEFAULT_FILTER, guardUnsafe: true }, gates, summary).guard_policies).toEqual(["adult", "adult-granular"]);
    expect(selectBody(DEFAULT_FILTER, gates, summary).guard_policies).toBeUndefined();
  });
});

describe("labels", () => {
  it("scores hard, ambiguous, other, and a proxy as positives", () => {
    expect(["hard", "ambiguous", "other"].map((expect) => isPositive(expect as "hard"))).toEqual([true, true, true]);
    expect(["adult", "safe"].map((expect) => isPositive(expect as "adult"))).toEqual([false, false]);
    expect(emptyLabel({ expect: null, proxy: false, override: null, note: " " })).toBe(true);
    expect(emptyLabel({ expect: null, override: "adult" })).toBe(false);
  });

  it("writes JSONL rows guard_eval can read, sorted by path", () => {
    const labels = new Map<string, ImageLabel>([
      ["b.jpg", { expect: "safe", updated_at: "t" }],
      ["a.jpg", { expect: "hard", proxy: true, override: "adult", note: "young-looking", updated_at: "t" }],
      ["c.jpg", { expect: null, note: "later", updated_at: "t" }],
    ]);
    const rows = labelsJsonl("/data/images/set", labels, new Map([["a.jpg", "/data/images/set/a.jpg"]])).trim().split("\n").map((line) => JSON.parse(line));
    expect(rows.map((row) => row.id)).toEqual(["img:hard/a.jpg", "img:safe/b.jpg"]);
    expect(rows[0]).toMatchObject({ expect: "hard", proxy: true, rel_path: "a.jpg", abs_path: "/data/images/set/a.jpg", folder: "/data/images/set", override: "adult", note: "young-looking" });
    expect(rows[1].abs_path).toBeNull();
    expect(labelsJsonl("/x", new Map())).toBe("");
  });

  it("stores one file per folder and removes an emptied label", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "cull-labels-"));
    const folder = "/data/images/set/day";
    expect(labelFileName(folder)).toMatch(/^set-day-[0-9a-f]{10}\.json$/);
    expect(labelFileName(folder)).not.toBe(labelFileName("/data/images/set/night"));
    expect(await readLabels(dir, folder)).toEqual({ folder, labels: {} });
    await Promise.all([writeLabel(dir, folder, "a.jpg", { expect: "hard", proxy: true }), writeLabel(dir, folder, "b.jpg", { expect: "safe" })]);
    const stored = await readLabels(dir, folder);
    expect(Object.keys(stored.labels).sort()).toEqual(["a.jpg", "b.jpg"]);
    expect(stored.labels["a.jpg"]).toMatchObject({ expect: "hard", proxy: true });
    expect(stored.labels["a.jpg"].updated_at).toMatch(/^\d{4}-/);
    await writeLabel(dir, folder, "a.jpg", { expect: null, proxy: false, override: null, note: "" });
    expect(Object.keys((await readLabels(dir, folder)).labels)).toEqual(["b.jpg"]);
    await writeLabel(dir, folder, "b.jpg", null);
    expect(await readLabels(dir, folder)).toEqual({ folder, labels: {} });
    expect(await readdir(dir)).toEqual([labelFileName(folder)]);
    expect(JSON.parse(await readFile(path.join(dir, labelFileName(folder)), "utf8"))).toEqual({ folder, labels: {} });
  });
});
