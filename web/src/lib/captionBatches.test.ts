import { describe, expect, it } from "vitest";

import { fetchMissingCaptions } from "./captionBatches";
import type { Caption } from "./cohorts";

const caption = (text: string): Caption => ({ text, keywords: [] });

describe("fetchMissingCaptions", () => {
  it("applies a batch still in flight when more results stream in, and asks only for the new paths", async () => {
    const asked = new Set<string>();
    const applied = new Map<string, Caption | null>();
    const apply = (found: Record<string, Caption | null>) => Object.entries(found).forEach(([abs, value]) => applied.set(abs, value));
    let release: (() => void) | null = null;
    const requests: string[][] = [];
    const get = (batch: string[]) => {
      requests.push(batch);
      return new Promise<Record<string, Caption | null>>((resolve) => {
        release = () => resolve(Object.fromEntries(batch.map((abs) => [abs, caption(abs)])));
      });
    };
    // The first chunk's paths are in flight when the second chunk arrives.
    const first = fetchMissingCaptions(["/a.jpg"], asked, get, apply);
    const second = fetchMissingCaptions(["/a.jpg", "/b.jpg"], asked, async (batch) => {
      requests.push(batch);
      return Object.fromEntries(batch.map((abs) => [abs, caption(abs)]));
    }, apply);
    await second;
    release!();
    await first;
    expect(requests).toEqual([["/a.jpg"], ["/b.jpg"]]);
    expect([...applied.keys()].sort()).toEqual(["/a.jpg", "/b.jpg"]);
  });

  it("gives a failed batch and the ones after it back, so a later call asks again", async () => {
    const asked = new Set<string>();
    const paths = Array.from({ length: 900 }, (_, i) => `/${i}.jpg`);
    let calls = 0;
    const failing = async (batch: string[]) => {
      calls += 1;
      if (calls === 2) throw new Error("curator down");
      return Object.fromEntries(batch.map((abs) => [abs, null]));
    };
    await expect(fetchMissingCaptions(paths, asked, failing, () => {})).rejects.toThrow("curator down");
    expect(asked.size).toBe(400);
    const retried: string[] = [];
    await fetchMissingCaptions(paths, asked, async (batch) => {
      retried.push(...batch);
      return {};
    }, () => {});
    expect(retried).toHaveLength(500);
  });
});
