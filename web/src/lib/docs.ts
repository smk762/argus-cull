/**
 * argus-curator's docs, as committed under `content/curator/` by `npm run docs:pull`, turned into a page at
 * render time on the server. Nothing is fetched at runtime and nothing is injected as HTML: the markdown
 * becomes React elements (react-markdown, no rehype-raw), so the page needs no CSP source it does not
 * already have. Adapted from argus-safelight's copy (src/lib/docs.ts).
 *
 * The transforms, in one remark pass:
 * - the `#` title goes (the page shows it in its own header);
 * - every heading gets GitHub's id, counted over the whole file, so a deep link means what it means on GitHub;
 * - links to another imported doc stay on this site, links into curator's repo go to GitHub at the recorded
 *   commit, and `../<sibling>/...` goes to that sibling's `dev`;
 * - remote images (badges), inline or by reference, are dropped with their definitions, since `img-src` would
 *   block them, and so are relative ones outside the vendored copy; the rest load from that copy.
 * Raw HTML is skipped by the renderer.
 */
import { readFileSync } from "node:fs";
import { join, posix } from "node:path";

import type { Heading, Image, Link, Nodes, Root, RootContent } from "mdast";

import { CURATOR, DOC_PAGES, curatorLinks, docsHref, type CuratorPin, type DocPage } from "./docsLinks";

const CONTENT = join(process.cwd(), "content", "curator");

export function readDoc(page: DocPage): string {
  return readFileSync(join(CONTENT, page.file), "utf8");
}

const textOf = (node: Nodes): string =>
  "value" in node && typeof node.value === "string" ? node.value : "children" in node ? (node.children as Nodes[]).map(textOf).join("") : "";

/** The page's `#` title, for the nav and the page header. The README's is the package name. */
export function docTitle(page: DocPage, markdown: string = readDoc(page)): string {
  if (page.file === "README.md") return "Overview";
  const found = /^# (.+)$/m.exec(markdown);
  return found ? found[1].replace(/`/g, "").trim() : page.slug;
}

/** GitHub's heading ids (github-slugger): lower case, punctuation dropped, spaces to hyphens, repeats numbered. */
export function slugger() {
  const seen = new Map<string, number>();
  return (text: string): string => {
    const base = text
      .toLowerCase()
      .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, "")
      .replace(/ /g, "-");
    // As github-slugger: a numbered slug is skipped when a heading already took it ("Foo", "Foo",
    // "Foo 1" are foo, foo-1, foo-1-1), and every slug handed out is taken, numbered or not.
    let slug = base;
    while (seen.has(slug)) {
      const count = (seen.get(base) ?? 0) + 1;
      seen.set(base, count);
      slug = `${base}-${count}`;
    }
    seen.set(slug, 0);
    return slug;
  };
}

export interface DocHeading {
  depth: number;
  text: string;
  id: string;
}

const isRemote = (url: string) => /^[a-z][a-z0-9+.-]*:|^\/\//i.test(url);

/** Every relative target resolved: on this site when it is an imported doc, else GitHub at the recorded commit. */
function resolveUrl(url: string, page: DocPage, record: CuratorPin): string {
  if (isRemote(url) || url.startsWith("/") || url.startsWith("#")) return url;
  const [path, anchor] = url.split("#", 2);
  const target = posix.normalize(posix.join(posix.dirname(page.file), path));
  if (target.startsWith("../")) {
    // A sibling repo in the suite's checkout layout: `../argus-lens/README.md`.
    const [repo, ...rest] = target.slice(3).split("/");
    return `https://github.com/${record.repo.split("/")[0]}/${repo}/blob/dev/${rest.join("/")}${anchor ? `#${anchor}` : ""}`;
  }
  const imported = DOC_PAGES.find((doc) => doc.file === target);
  if (imported) return docsHref(imported, anchor);
  return `${curatorLinks(record).blob(target)}${anchor ? `#${anchor}` : ""}`;
}

/** Where a relative image loads from: the vendored copy. Null for one the page cannot serve (remote, or outside the copy). */
function imageSrc(url: string, page: DocPage): string | null {
  if (isRemote(url)) return null;
  const target = posix.normalize(posix.join(posix.dirname(page.file), url));
  return target === ".." || target.startsWith("../") ? null : `/docs/curator/${target}`;
}

function remove(node: Nodes, parent: Nodes | null) {
  if (parent && "children" in parent) (parent.children as Nodes[]).splice((parent.children as Nodes[]).indexOf(node), 1);
}

function walk(node: Nodes, visit: (node: Nodes, parent: Nodes | null) => void, parent: Nodes | null = null) {
  visit(node, parent);
  if ("children" in node) for (const child of [...(node.children as Nodes[])]) walk(child, visit, node);
}

/** The remark plugin for one page. Collects the headings it kept, for the page's contents list. */
export function curatorDoc(page: DocPage, record: CuratorPin = CURATOR) {
  const headings: DocHeading[] = [];
  const plugin = () => (tree: Root) => {
    const slug = slugger();
    const ids = new Map<Heading, string>();
    walk(tree, (node) => {
      if (node.type === "heading") ids.set(node, slug(textOf(node)));
    });
    tree.children = tree.children.filter((node: RootContent) => !(node.type === "heading" && node.depth === 1));

    walk(tree, (node) => {
      if (node.type !== "heading") return;
      const id = ids.get(node)!;
      node.data = { ...node.data, hProperties: { ...node.data?.hProperties, id } };
      headings.push({ depth: node.depth, text: textOf(node), id });
    });

    // A definition only images use (`[![CI][ci-badge]][ci]` with `[ci-badge]: …svg`) is an image's source, not a link.
    const imageIds = new Set<string>();
    const linkIds = new Set<string>();
    walk(tree, (node) => {
      if (node.type === "imageReference") imageIds.add(node.identifier);
      if (node.type === "linkReference") linkIds.add(node.identifier);
    });
    const imageDefs = new Map<string, string>();
    walk(tree, (node, parent) => {
      if (node.type === "definition" && imageIds.has(node.identifier) && !linkIds.has(node.identifier)) {
        const src = imageSrc(node.url, page);
        if (src) {
          node.url = src;
          imageDefs.set(node.identifier, src);
        } else remove(node, parent);
      } else if (node.type === "link" || node.type === "definition") {
        (node as Link).url = resolveUrl(node.url, page, record);
      } else if (node.type === "image") {
        const src = imageSrc((node as Image).url, page);
        if (src) (node as Image).url = src;
        else remove(node, parent);
      }
    });
    walk(tree, (node, parent) => {
      if (node.type === "imageReference" && !imageDefs.has(node.identifier)) remove(node, parent);
    });
    // A badge's link is empty once its image is gone.
    walk(tree, (node, parent) => {
      if ((node.type === "link" || node.type === "linkReference") && node.children.length === 0) remove(node, parent);
    });
  };
  return { plugin, headings };
}

/** The page's headings, worked out before it renders, for its contents list and the anchor test. */
export async function docHeadings(page: DocPage, markdown: string = readDoc(page), record: CuratorPin = CURATOR): Promise<DocHeading[]> {
  const [{ unified }, { default: remarkParse }, { default: remarkGfm }] = await Promise.all([import("unified"), import("remark-parse"), import("remark-gfm")]);
  const doc = curatorDoc(page, record);
  const processor = unified().use(remarkParse).use(remarkGfm).use(doc.plugin);
  await processor.run(processor.parse(markdown));
  return doc.headings;
}
