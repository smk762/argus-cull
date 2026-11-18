import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_VIEW } from "./types";
import { replaceView } from "./urlStore";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("replaceView", () => {
  it("keeps the URL fragment when it writes the view", () => {
    const location = { pathname: "/", search: "", hash: "#detail" };
    const replaced: string[] = [];
    vi.stubGlobal("window", {
      location,
      history: { replaceState: (_state: unknown, _title: string, url: string) => replaced.push(url) },
    });
    replaceView({ ...DEFAULT_VIEW, folder: "set" });
    expect(replaced).toHaveLength(1);
    expect(replaced[0]).toMatch(/^\/\?.*folder=set.*#detail$/);
  });
});
