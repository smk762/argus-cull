import type { Nodes, Root } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { describe, expect, it } from "vitest";

import { curatorDoc } from "./docs";
import { DOC_PAGES } from "./docsLinks";

async function transform(markdown: string): Promise<Root> {
  const processor = unified().use(remarkParse).use(remarkGfm).use(curatorDoc(DOC_PAGES[0]).plugin);
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
