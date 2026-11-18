import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { labelFileName, readLabels, writeLabel } from "./labelStore";

describe("label store: odd files and keys", () => {
  it("reads a file that is not a label object as empty, and can write over it", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "cull-labels-"));
    for (const [folder, body] of [["/data/images/null", "null"], ["/data/images/array", '{"labels": ["x"]}'], ["/data/images/number", "7"]] as const) {
      await writeFile(path.join(dir, labelFileName(folder)), body);
      expect(Object.keys((await readLabels(dir, folder)).labels)).toEqual([]);
      await writeLabel(dir, folder, "a.jpg", { expect: "safe" });
      expect(Object.keys((await readLabels(dir, folder)).labels)).toEqual(["a.jpg"]);
    }
  });

  it("stores a relPath of __proto__ as a label, not as the object's prototype", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "cull-labels-"));
    const folder = "/data/images/proto";
    const written = await writeLabel(dir, folder, "__proto__", { expect: "hard" });
    expect(Object.keys(written.labels)).toEqual(["__proto__"]);
    expect(Object.getPrototypeOf(written.labels)).toBeNull();
    const stored = JSON.parse(await readFile(path.join(dir, labelFileName(folder)), "utf8")) as { labels: Record<string, unknown> };
    expect(Object.keys(stored.labels)).toEqual(["__proto__"]);
    await writeLabel(dir, folder, "__proto__", null);
    expect(Object.keys((await readLabels(dir, folder)).labels)).toEqual([]);
  });
});
