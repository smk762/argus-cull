import { describe, expect, it } from "vitest";

import { madeWith, thinkingMode } from "./madeWith";
import type { GuardResult, ImageResult } from "./types";

const withModel = (model: string | null) => ({ guard: { safe: true, rules: [], model } }) as unknown as ImageResult;
const judged = (thinking: string | null, variants: (string | null)[] = []) =>
  ({
    guard: { safe: true, rules: [], model: "Sing-Guard-4b", thinking },
    guard_variants: Object.fromEntries(variants.map((mode, index) => [`v${index}`, { safe: true, rules: [], thinking: mode } as GuardResult])),
  }) as unknown as ImageResult;
const guardOn = { enabled: true, policy: "adult" };

describe("made with", () => {
  it("names the curator version, the recorded policy and variants, and the models that judged", () => {
    const result = madeWith(
      { guard_config: { enabled: true, policy: "adult", variants: ["adult-cinematic"] }, results: [withModel("Sing-Guard-4b"), withModel("Sing-Guard-4b"), withModel(null)] },
      "0.14.1",
    );
    expect(result.line).toBe("Scanned by argus-curator 0.14.1 · policy adult (+ adult-cinematic) · model Sing-Guard-4b");
    expect(result.note).toContain("/health");
  });

  it("leaves the policy out when SingGuard did not run", () => {
    expect(madeWith({ guard_config: { enabled: false, policy: "adult" }, results: [] }, "0.14.1").line).toBe("Scanned by argus-curator 0.14.1");
    expect(madeWith({ results: [] }, "0.14.1").line).toBe("Scanned by argus-curator 0.14.1");
  });

  it("does not invent a version the curator did not report", () => {
    const result = madeWith({ guard_config: { enabled: null, policy: "default" }, results: [] }, null);
    expect(result.line).toBe("Scanned by argus-curator · policy default");
    expect(result.note).toBe("The curator did not report a version.");
  });
});

describe("thinking mode", () => {
  it("reads fast and slow verdicts together as cascade, counting the official and every variant verdict", () => {
    const summary = { guard_config: guardOn, results: [judged("fast", ["fast", "fast"]), judged("slow", ["slow", "fast"])] };
    expect(thinkingMode(summary)).toEqual({ text: "cascade (fast 4, slow 2)", caveat: null });
    expect(madeWith(summary, "0.15.1").line).toBe("Scanned by argus-curator 0.15.1 · policy adult · model Sing-Guard-4b · thinking cascade (fast 4, slow 2)");
  });

  it("says all-fast may be a cascade that escalated nothing", () => {
    const result = madeWith({ guard_config: guardOn, results: [judged("fast"), judged("fast")] }, "0.15.1");
    expect(result.line).toMatch(/ · thinking fast$/);
    expect(result.note).toContain("A cascade scan whose fast screen flagged nothing reads the same");
  });

  it("names a mode that names itself", () => {
    expect(thinkingMode({ guard_config: guardOn, results: [judged("fast-slow"), judged("fast-slow")] })).toEqual({ text: "fast-slow", caveat: null });
    expect(thinkingMode({ guard_config: guardOn, results: [judged("slow")] })).toEqual({ text: "slow", caveat: null });
  });

  it("prefers the mode the scan asked for, once curator records it (argus-curator#152)", () => {
    expect(thinkingMode({ guard_config: { ...guardOn, thinking: "cascade" }, results: [judged("fast"), judged("fast")] })).toEqual({ text: "cascade (fast 2)", caveat: null });
    expect(thinkingMode({ guard_config: { ...guardOn, thinking: "fast" }, results: [judged("fast")] })).toEqual({ text: "fast", caveat: null });
  });

  it("leaves thinking out when no verdict names a mode, as before argus-cortex 0.5", () => {
    expect(thinkingMode({ guard_config: guardOn, results: [judged(null), withModel("Sing-Guard-4b")] })).toBeNull();
    expect(madeWith({ guard_config: guardOn, results: [judged(null)] }, "0.14.1").line).toBe("Scanned by argus-curator 0.14.1 · policy adult · model Sing-Guard-4b");
  });
});
