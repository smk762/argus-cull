import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DocArticle } from "@/components/DocArticle";

import { DOCS as ALLOWLIST } from "../../scripts/curator-docs.mjs";
import { opsecHits } from "../../scripts/opsec.mjs";
import { curatorDoc, docHeadings, docTitle, slugger } from "./docs";
import { CURATOR, DOC_FILES, DOC_PAGES, DOCS, MODEL_SETUP, docsHref, type DocPage } from "./docsLinks";

const html = new Map<DocPage, string>(DOC_PAGES.map((page) => [page, renderToStaticMarkup(<DocArticle page={page} />)]));
const idsOn = (page: DocPage) => new Set([...html.get(page)!.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));

describe("in-context help", () => {
  const targets = [...Object.values(DOCS), ...Object.values(MODEL_SETUP)];

  it.each(targets.map((href) => [href]))("%s lands on a section of the imported docs", (href) => {
    const [path, anchor] = href.split("#");
    const page = DOC_PAGES.find((doc) => docsHref(doc) === path);
    expect(page, `no docs page at ${path}`).toBeDefined();
    if (anchor) expect(idsOn(page!), `#${anchor} is not on ${path}`).toContain(anchor);
  });
});

describe("the imported docs", () => {
  it("are the import script's allowlist, page for page", () => {
    expect([...DOC_FILES]).toEqual(ALLOWLIST);
  });

  it("sit at the commit the sync record names", () => {
    const record = JSON.parse(readFileSync(join(process.cwd(), "..", "sync", "argus-curator.json"), "utf8"));
    expect(CURATOR).toEqual({ package: record.package, repo: record.repo, branch: record.branch, commit: record.commit, version: record.version });
  });

  it("number repeated headings as GitHub does", () => {
    const slug = slugger();
    expect(["Why not FiftyOne / fastdup / Immich?", "HTTP API (:8101)", "Filters", "Filters"].map(slug)).toEqual(["why-not-fiftyone--fastdup--immich", "http-api-8101", "filters", "filters-1"]);
  });

  it("render without a style attribute, raw HTML, a script or a remote image, so the CSP needs nothing new", () => {
    for (const markup of html.values()) {
      expect(markup).not.toMatch(/\sstyle="/);
      expect(markup).not.toMatch(/<script|<iframe|<img[^>]+src="https?:/);
    }
  });

  it("pass the opsec gate as rendered", () => {
    for (const [page, markup] of html) expect(opsecHits(markup), page.file).toEqual([]);
  });

  it("drop the page's own title, and list its sections", async () => {
    const crops = DOC_PAGES.find((page) => page.slug === "crops")!;
    expect(docTitle(crops)).toBe("Crops: watermarks and borders, without touching the source");
    expect(html.get(crops)).not.toContain("<h1");
    expect((await docHeadings(crops)).map((heading) => heading.id)).toContain("finding-watermarks");
  });

  it("link curator's other files at the recorded commit, imported ones on this site, and outside sites in a new tab", () => {
    const overview = html.get(DOC_PAGES[0])!;
    expect(overview).toContain('href="/docs/cli"');
    expect(overview).toContain(`href="https://github.com/${CURATOR.repo}/blob/${CURATOR.commit}/docs/synthetic-face-sets.md"`);
    expect(overview).toMatch(/target="_blank" rel="noopener noreferrer"/);
  });

  it("resolve a sibling repo's file to its dev branch and keep an anchor on an imported page", async () => {
    const page = DOC_PAGES.find((doc) => doc.slug === "nudity")!;
    const markdown = "# T\n\nSee [policy](policy-check.md#modes), [lens](../../argus-lens/README.md) and [design](../DESIGN.md#x).\n";
    const [{ unified }, { default: remarkParse }] = await Promise.all([import("unified"), import("remark-parse")]);
    const doc = curatorDoc(page);
    const processor = unified().use(remarkParse).use(doc.plugin);
    const tree = await processor.run(processor.parse(markdown));
    expect(JSON.stringify(tree).match(/"url":"[^"]+"/g)).toEqual([
      '"url":"/docs/policy-check#modes"',
      '"url":"https://github.com/smk762/argus-lens/blob/dev/README.md"',
      `"url":"https://github.com/${CURATOR.repo}/blob/${CURATOR.commit}/DESIGN.md#x"`,
    ]);
  });
});
