import { describe, expect, it } from "vitest";

import { madeWith } from "./madeWith";
import type { ImageResult } from "./types";

const withModel = (model: string | null) => ({ guard: { safe: true, rules: [], model } }) as unknown as ImageResult;

describe("made with", () => {
  it("names the curator version, the recorded policy and variants, and the models that judged", () => {
    const result = madeWith(
      { guard_config: { enabled: true, policy: "adult", variants: ["adult-cinematic"] }, results: [withModel("Sing-Guard-4b"), withModel("Sing-Guard-4b"), withModel(null)] },
      "0.14.1",
    );
    expect(result.line).toBe("Scanned by argus-curator 0.14.1 · policy adult (+ adult-cinematic) · model Sing-Guard-4b");
    expect(result.versionNote).toContain("/health");
  });

  it("leaves the policy out when SingGuard did not run", () => {
    expect(madeWith({ guard_config: { enabled: false, policy: "adult" }, results: [] }, "0.14.1").line).toBe("Scanned by argus-curator 0.14.1");
    expect(madeWith({ results: [] }, "0.14.1").line).toBe("Scanned by argus-curator 0.14.1");
  });

  it("does not invent a version the curator did not report", () => {
    const result = madeWith({ guard_config: { enabled: null, policy: "default" }, results: [] }, null);
    expect(result.line).toBe("Scanned by argus-curator · policy default");
    expect(result.versionNote).toBe("The curator did not report a version.");
  });
});
