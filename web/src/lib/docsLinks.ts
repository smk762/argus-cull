/**
 * Where the in-context help points: argus-curator's own docs as `/docs` renders them, imported at the
 * commit sync/argus-curator.json records (web/content/curator/pin.json repeats it inside web/).
 * `docsLinks.test.tsx` renders those pages and fails when an anchor here no longer exists, so a heading
 * renamed in curator breaks `npm test` in the sync PR that brings it in, not a link in production.
 *
 * Client-safe: no file reads here (those are in docs.ts, on the server).
 */
import pin from "../../content/curator/pin.json";

/** The imported files, in the order the docs nav lists them. Must match scripts/curator-docs.mjs's allowlist. */
export const DOC_FILES = [
  "README.md",
  "docs/scoring.md",
  "docs/face-attributes.md",
  "docs/scene-tags.md",
  "docs/garments.md",
  "docs/nudity.md",
  "docs/policy-check.md",
  "docs/moderation.md",
  "docs/prefilter.md",
  "docs/crops.md",
  "docs/sidecars.md",
  "docs/xmp.md",
  "docs/manifest.md",
  "docs/http-api.md",
  "docs/cli.md",
  "docs/gpu.md",
] as const;

export type DocFile = (typeof DOC_FILES)[number];

export interface DocPage {
  /** The route under /docs: "" for the README, else the file's name without `.md`. */
  slug: string;
  /** The path in curator's repo. */
  file: DocFile;
}

export const DOC_PAGES: DocPage[] = DOC_FILES.map((file) => ({ file, slug: file === "README.md" ? "" : file.replace(/^docs\//, "").replace(/\.md$/, "") }));

export const docPage = (file: DocFile): DocPage => DOC_PAGES.find((page) => page.file === file)!;

export const docsHref = (page: DocPage, anchor?: string): string => `/docs${page.slug ? `/${page.slug}` : ""}${anchor ? `#${anchor}` : ""}`;

const at = (file: DocFile, anchor?: string) => docsHref(docPage(file), anchor);

/** Every in-context link, by what it explains. */
export const DOCS = {
  home: at("README.md"),
  // Scan form checks.
  garments: at("docs/garments.md"),
  setAge: at("docs/face-attributes.md", "an-age-for-the-frames-with-no-face"),
  bodies: at("docs/face-attributes.md", "reading-the-body-as-well"),
  prefilter: at("docs/prefilter.md"),
  crops: at("docs/crops.md", "finding-watermarks"),
  // Filter groups.
  // No clustering page in curator yet; the quick start shows identity clustering and export by cluster.
  people: at("README.md", "quick-start"),
  appearance: at("docs/face-attributes.md", "filters"),
  scenes: at("docs/scene-tags.md", "filters"),
  wardrobe: at("docs/garments.md", "filters"),
  nudenet: at("docs/nudity.md", "scores-and-filters"),
  singguard: at("docs/policy-check.md", "results-and-filters"),
  // Detail view folds.
  quality: at("docs/scoring.md"),
  nudity: at("docs/nudity.md"),
  erax: at("docs/nudity.md", "erax-a-second-detector"),
  policyCheck: at("docs/policy-check.md"),
  moderation: at("docs/moderation.md"),
  // Run stats.
  runStats: at("docs/sidecars.md", "run-stats"),
} as const;

/** Where to get each detector's weights: the setup the "not loaded" hint names (`mivolo-convert`, ...). */
export const MODEL_SETUP: Record<"insightface" | "mivolo" | "places365" | "garments", string> = {
  insightface: at("README.md", "installation"),
  mivolo: at("docs/face-attributes.md", "installing-the-model"),
  places365: at("docs/scene-tags.md", "installing-the-model"),
  garments: at("docs/garments.md", "installing-the-model"),
};

export interface CuratorPin {
  package: string;
  repo: string;
  branch: string;
  commit: string;
  version: string;
}

export const CURATOR: CuratorPin = pin;

export const curatorLinks = (record: CuratorPin = CURATOR) => ({
  github: `https://github.com/${record.repo}/tree/${record.commit}`,
  blob: (path: string) => `https://github.com/${record.repo}/blob/${record.commit}/${path}`,
  changelog: `https://github.com/${record.repo}/blob/${record.commit}/CHANGELOG.md`,
  pypi: `https://pypi.org/project/${record.package}/`,
});
