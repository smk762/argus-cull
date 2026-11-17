import { describe, expect, it } from "vitest";

import { applyLabelPatch, LabelSaver, labelFields, labelsForFolder, type ImageLabel, type LabelFields, type LabelFile } from "./labels";

const saved: ImageLabel = { expect: "adult", proxy: false, override: null, note: "", updated_at: "2026-01-01T00:00:00Z" };

function server() {
  const puts: (LabelFields | null)[] = [];
  const release: (() => void)[] = [];
  const put = (folder: string, relPath: string, label: LabelFields | null) =>
    new Promise<LabelFile>((resolve) => {
      puts.push(label);
      release.push(() => resolve({ folder, labels: label ? { [relPath]: { ...label, updated_at: "now" } } : {} }));
    });
  return { puts, release, put };
}

describe("LabelSaver", () => {
  it("keeps a note saved on blur when a verdict is clicked before the save returns", async () => {
    const { puts, release, put } = server();
    const saver = new LabelSaver(put);
    // Both built from the same render: the label as loaded, with no note.
    const first = saver.save("/data/set", "a.jpg", { note: "typed" }, saved);
    const second = saver.save("/data/set", "a.jpg", { expect: "hard" }, saved);
    await Promise.resolve();
    release[0]();
    await first;
    await Promise.resolve();
    release[1]();
    const file = await second;
    expect(puts).toEqual([
      { expect: "adult", proxy: false, override: null, note: "typed" },
      { expect: "hard", proxy: false, override: null, note: "typed" },
    ]);
    expect(file.labels["a.jpg"].note).toBe("typed");
  });

  it("sends one save at a time, in order", async () => {
    const { puts, release, put } = server();
    const saver = new LabelSaver(put);
    void saver.save("/data/set", "a.jpg", { note: "one" }, saved);
    void saver.save("/data/set", "a.jpg", { note: "two" }, saved);
    await Promise.resolve();
    expect(puts).toHaveLength(1);
    release[0]();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(puts).toHaveLength(2);
    expect(puts[1]?.note).toBe("two");
  });

  it("merges against the loaded label again once nothing is in flight", async () => {
    const { puts, release, put } = server();
    const saver = new LabelSaver(put);
    const first = saver.save("/data/set", "a.jpg", { note: "typed" }, saved);
    await Promise.resolve();
    release[0]();
    await first;
    void saver.save("/data/set", "a.jpg", { proxy: true }, { ...saved, note: "edited elsewhere" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(puts[1]?.note).toBe("edited elsewhere");
  });
});

describe("label patches", () => {
  it("hands the tags back when the patch clears them, and keeps them otherwise", () => {
    const tagged = labelFields({ ...saved, tags: ["beach"] });
    expect(applyLabelPatch(tagged, { tags: undefined })).not.toHaveProperty("tags");
    expect(applyLabelPatch(tagged, { note: "x" }).tags).toEqual(["beach"]);
  });
});

describe("labelsForFolder", () => {
  it("never applies one folder's labels to another folder's scan", () => {
    const labels = new Map([["a.jpg", { ...saved, override: "adult" }]]);
    expect(labelsForFolder(labels, "/data/old", "/data/new").size).toBe(0);
    expect(labelsForFolder(labels, null, "/data/new").size).toBe(0);
    expect(labelsForFolder(labels, "/data/new", "/data/new").get("a.jpg")?.override).toBe("adult");
  });
});
