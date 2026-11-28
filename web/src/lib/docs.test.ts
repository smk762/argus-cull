import type { Nodes, Root } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { describe, expect, it } from "vitest";

import { curatorDoc } from "./docs";
import { CURATOR, DOC_PAGES, docPage, type DocPage } from "./docsLinks";

async function transform(markdown: string, page: DocPage = DOC_PAGES[0]): Promise<Root> {
  const processor = unified().use(remarkParse).use(remarkGfm).use(curatorDoc(page).plugin);
  return (await processor.run(processor.parse(markdown))) as Root;
}

function nodes(tree: Nodes): Nodes[] {
  return [tree, ...("children" in tree ? (tree.children as Nodes[]).flatMap(nodes) : [])];
}

describe("images in the imported docs", () => {
  it("drops a remote reference-style badge with its link and definition", async () => {
    const tree = await transform("[![CI][ci-badge]][ci] Text.\n\n[ci-badge]: https://github.com/x/y/badge.svg\n[ci]: https://github.com/x/y/actions\n");
    const types = nodes(tree).map((node) => node.type);
    expect(types).not.toContain("imageReference");
    expect(types).not.toContain("linkReference");
    expect(nodes(tree).filter((node) => node.type === "definition").map((node) => (node as { identifier: string }).identifier)).toEqual(["ci"]);
  });

  it("points a relative reference-style image at the vendored copy", async () => {
    const tree = await transform("![Diagram][diagram]\n\n[diagram]: img/flow.png\n");
    const definition = nodes(tree).find((node) => node.type === "definition") as { url: string };
    expect(definition.url).toMatch(/^\/docs\/curator\/(?:.*\/)?img\/flow\.png$/);
    expect(nodes(tree).map((node) => node.type)).toContain("imageReference");
  });

  it("drops a relative image that points outside the curator docs", async () => {
    const depth = DOC_PAGES[0].file.split("/").length;
    const outside = `${"../".repeat(depth)}argus-lens/docs/x.png`;
    const tree = await transform(`![Lens](${outside})\n\n![Ref][lens]\n\n[lens]: ${outside}\n`);
    const types = nodes(tree).map((node) => node.type);
    expect(types).not.toContain("image");
    expect(types).not.toContain("imageReference");
    expect(JSON.stringify(tree)).not.toContain("/docs/curator/..");
  });
});

describe("root-relative targets, which GitHub reads as curator's repo root", () => {
  const sub = docPage("docs/scoring.md");
  const urls = async (markdown: string) =>
    nodes(await transform(markdown, sub))
      .filter((node) => node.type === "link" || node.type === "image" || node.type === "definition")
      .map((node) => (node as { url: string }).url);

  it("loads a root-relative image from the copy's root, not the page's directory", async () => {
    expect(await urls("![Flow](/docs/img/flow.png)\n\n![Ref][r]\n\n[r]: /docs/img/flow.png\n")).toEqual([
      "/docs/curator/docs/img/flow.png",
      "/docs/curator/docs/img/flow.png",
    ]);
  });

  it("sends a root-relative link to the imported page or GitHub, never this site's root", async () => {
    const [toDoc, toRepo, climbing] = await urls("[a](/docs/cli.md#usage) [b](/src/x.py) [c](/../argus-lens/x.md)\n");
    expect(toDoc).toBe("/docs/cli#usage");
    expect(toRepo).toBe(`https://github.com/${CURATOR.repo}/blob/${CURATOR.commit}/src/x.py`);
    expect(climbing).toBe(`https://github.com/${CURATOR.repo}/blob/${CURATOR.commit}/argus-lens/x.md`);
  });

  it("matches the relative spelling of the same target", async () => {
    expect(await urls("[a](/docs/nudity.md) ![i](/docs/i.png)\n")).toEqual(await urls("[a](nudity.md) ![i](i.png)\n"));
  });
});
