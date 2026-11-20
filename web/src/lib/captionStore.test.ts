import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { parseXmp, readCaption } from "./captionStore";

const xmp = (keyword: string) =>
  `<x:xmpmeta><rdf:RDF><rdf:Description><dc:subject><rdf:Bag><rdf:li>${keyword}</rdf:li></rdf:Bag></dc:subject></rdf:Description></rdf:RDF></x:xmpmeta>`;

describe("captionStore sidecar limits", () => {
  it("reads at most 64 KiB of a sidecar, counted in bytes", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "cull-sidecar-"));
    // 40,000 two-byte characters: 80,000 bytes, but under 64 Ki characters.
    await writeFile(path.join(root, "a.txt"), "é".repeat(40_000));
    const found = await readCaption(root, path.join(root, "a.jpg"));
    expect(found).not.toBeNull();
    expect(Buffer.byteLength(found!.text, "utf8")).toBeLessThanOrEqual(64 * 1024 + 3);
  });

  it("reads a small sidecar whole and treats a folder where a sidecar would be as none", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "cull-sidecar-"));
    await writeFile(path.join(root, "a.txt"), "a caption\n");
    await mkdir(path.join(root, "b.txt"));
    expect(await readCaption(root, path.join(root, "a.jpg"))).toEqual({ text: "a caption", keywords: [] });
    expect(await readCaption(root, path.join(root, "b.jpg"))).toBeNull();
  });
});

describe("parseXmp numeric entities", () => {
  it("does not throw on a code point past U+10FFFF", () => {
    expect(parseXmp(xmp("a&#99999999;b")).keywords).toEqual(["a�b"]);
  });

  it("decodes hex entities", () => {
    expect(parseXmp(xmp("caf&#xE9; &#x1F600;")).keywords).toEqual(["café 😀"]);
  });

  it("still decodes decimal entities", () => {
    expect(parseXmp(xmp("caf&#233;")).keywords).toEqual(["café"]);
  });
});
