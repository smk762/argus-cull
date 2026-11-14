import { describe, expect, it } from "vitest";

import { parseOpenSections, SECTIONS_KEY, sectionStore } from "./sidebarSections";

function memoryStorage(initial: string | null = null) {
  const data = new Map<string, string>(initial == null ? [] : [[SECTIONS_KEY, initial]]);
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value), data };
}

describe("sidebar sections", () => {
  it("start closed, and keep only boolean entries from storage", () => {
    expect(parseOpenSections(null)).toEqual({});
    expect(parseOpenSections("not json")).toEqual({});
    expect(parseOpenSections("[true]")).toEqual({});
    expect(parseOpenSections('{"display":true,"people":"yes","places365":false}')).toEqual({ display: true, places365: false });
  });

  it("remember a section opened, and tell subscribers", () => {
    const storage = memoryStorage();
    const store = sectionStore(() => storage);
    let calls = 0;
    store.subscribe(() => (calls += 1));
    expect(store.snapshot().display).toBeUndefined();
    store.set("display", true);
    expect(store.snapshot().display).toBe(true);
    expect(JSON.parse(storage.data.get(SECTIONS_KEY)!)).toEqual({ display: true });
    store.set("display", true);
    expect(calls).toBe(1);
    expect(sectionStore(() => storage).snapshot()).toEqual({ display: true });
  });

  it("still open and close when storage is blocked", () => {
    const blocked = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    const store = sectionStore(() => blocked);
    expect(store.snapshot()).toEqual({});
    store.set("people", true);
    expect(store.snapshot().people).toBe(true);
    const none = sectionStore(() => null);
    none.set("people", true);
    expect(none.snapshot().people).toBe(true);
  });
});
