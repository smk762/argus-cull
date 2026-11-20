import { afterEach, describe, expect, it, vi } from "vitest";

import { effectiveScheme, subscribeScheme } from "./theme";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("theme without dh-theme.js", () => {
  it("tells subscribers when the system scheme changes, and stops when unsubscribed", () => {
    const listeners = new Set<() => void>();
    let dark = false;
    vi.stubGlobal("window", {});
    vi.stubGlobal("matchMedia", (query: string) => ({
      media: query,
      get matches() {
        return dark;
      },
      addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
    }));
    const seen: string[] = [];
    const unsubscribe = subscribeScheme(() => seen.push(effectiveScheme()));
    dark = true;
    for (const listener of listeners) listener();
    expect(seen).toEqual(["dark"]);
    unsubscribe();
    expect(listeners.size).toBe(0);
  });
});
