// getDisplay on the live page: a failed /api/display falls back to the default blur, never rejects.
import { afterEach, describe, expect, it, vi } from "vitest";

import { getDisplay } from "./api";
import { DEFAULT_BLUR } from "./chunks";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getDisplay", () => {
  it("falls back to the default blur when /api/display fails", async () => {
    const answers: (() => Promise<Response>)[] = [
      async () => new Response("<html>Internal Server Error</html>", { status: 500 }),
      async () => new Response("<html>not json</html>", { status: 200 }),
      async () => new Response("null", { status: 200 }),
      async () => {
        throw new TypeError("fetch failed");
      },
    ];
    for (const answer of answers) {
      vi.stubGlobal("fetch", answer);
      await expect(getDisplay()).resolves.toEqual(DEFAULT_BLUR);
    }
  });

  it("returns the page server's policy when it answers", async () => {
    const policy = { exposedScore: 0.4, policyBlur: false };
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify(policy), { status: 200 }));
    await expect(getDisplay()).resolves.toEqual(policy);
  });
});
