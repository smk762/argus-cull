import { describe, expect, it } from "vitest";

import { scanToRefetch } from "./scanWatch";

describe("scanToRefetch", () => {
  it("fetches the watched scan once more when it stops being the active one", () => {
    expect(scanToRefetch("s1", null, "s1", false)).toBe("s1");
    expect(scanToRefetch("s1", "s2", "s1", false)).toBe("s1");
  });

  it("does nothing when nothing was watched, the page moved on, or this tab is scanning", () => {
    expect(scanToRefetch(null, null, "s1", false)).toBeNull();
    expect(scanToRefetch("s1", null, "s2", false)).toBeNull();
    expect(scanToRefetch("s1", null, "s1", true)).toBeNull();
    expect(scanToRefetch("s1", "s1", "s1", false)).toBeNull();
  });
});
