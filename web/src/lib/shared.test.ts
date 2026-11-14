// The vendored Dragonhound shared layer (vendor/dh/). The files themselves are pinned by
// `node vendor/dh/sync-shared.mjs --check .` in CI; this pins what the app builds from them.
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DemoStrip } from "@/components/DemoStrip";
import { isFamilyUrl } from "@/lib/links";

import { strip, stripHtml } from "../../vendor/dh/dh-strip.mjs";

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const squash = (html: string) =>
  html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/>\s+</g, "><")
    .replace(/<(path)([^>]*)\/>/g, "<$1$2></$1>")
    .trim();
// The JSX strip also carries data-dh-site on the <nav> (dh-strip.css marks the current link from it).
const rendered = (current?: string) => renderToStaticMarkup(createElement(DemoStrip, current ? { current } : {})).replace(/<nav ([^>]*) data-dh-site="[a-z]+">/, "<nav $1>");

describe("dh-strip", () => {
  it("renders the shared source's markup", () => {
    expect(rendered()).toBe(squash(stripHtml({ current: "cull" })));
    expect(rendered("lightbox")).toBe(squash(stripHtml({ current: "lightbox" })));
  });

  it("matches the vendored static strip", () => {
    expect(rendered()).toBe(squash(read("vendor/dh/dh-strip.html")));
  });

  it("says this is cull on the nav, and marks a cull link once the shared list has one", () => {
    const html = renderToStaticMarkup(createElement(DemoStrip));
    expect(html).toContain('<nav class="dh-strip" aria-label="Dragonhound Labs demos" data-dh-site="cull">');
    const listed = strip.links.some((link) => (link.site as string) === "cull");
    expect((html.match(/aria-current/g) ?? []).length).toBe(listed ? 1 : 0);
  });

  it("links the family in the same tab", () => {
    for (const link of [strip.home, ...strip.links]) expect(isFamilyUrl(link.href)).toBe(true);
    expect(isFamilyUrl("https://github.com/smk762/argus-cull")).toBe(false);
    expect(renderToStaticMarkup(createElement(DemoStrip))).not.toContain("target=");
  });
});

describe("dh-theme", () => {
  it("serves the vendored script unchanged", () => {
    expect(read("public/dh-theme.js")).toBe(read("vendor/dh/dh-theme.js"));
  });
});
