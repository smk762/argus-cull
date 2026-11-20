// Post-build: give every exported page a strict, hash-based Content-Security-Policy.
//
// `next build` (output: "export") emits Next's bootstrap as inline <script>s and
// there is no server to mint nonces, so each page gets a <meta http-equiv> CSP
// listing the sha256 of exactly the inline scripts it shipped with. Hashing at
// build time is safe here because the HTML contains no user content: the page is
// prerendered with no scan in it, and the tape is fetched at runtime as JSON.
// Adapted from argus-lightbox's scripts/csp.mjs. The tape must be same-origin
// (NEXT_PUBLIC_CULL_TAPE_URL is a path), so the policy names no other origin. Directives a <meta> CSP can't carry (frame-ancestors) go in out/_headers,
// which Cloudflare Pages and Netlify read; other hosts should send the same.
//
// Trusted Types: Turbopack's chunk loader (and React's script preinit) assign
// plain strings to script.src, which `require-trusted-types-for 'script'` blocks;
// a <Link> prefetch on the 404 page hit it. Next only ships a policy for webpack
// builds, so each page gets a `default` policy, inline and first in <head>, that
// accepts same-origin `${basePath}/_next/static/**.js` script URLs and rejects
// everything else. It has no createHTML or createScript, so HTML and script sinks
// stay blocked, and `trusted-types default` allows no other policy name.
//
//   node scripts/csp.mjs [outDir]   (run by `npm run build`)
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const INLINE_SCRIPT = /<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;

/** @param {string} html @returns {string[]} CSP hash sources for each non-empty inline script. */
export function inlineScriptHashes(html) {
  const hashes = new Set();
  for (const [, body] of html.matchAll(INLINE_SCRIPT)) {
    if (body) hashes.add(`'sha256-${createHash("sha256").update(body, "utf8").digest("base64")}'`);
  }
  return [...hashes];
}

/** @param {string | undefined} url @returns {string} The tape URL, which must be a same-origin path. */
export function sameOriginTape(url) {
  if (url && /^[a-z][a-z0-9+.-]*:|^\/\//i.test(url)) throw new Error(`csp: NEXT_PUBLIC_CULL_TAPE_URL must be a path on this site, not ${url}`);
  return url || "/data-tape";
}

/**
 * @param {string} basePath NEXT_PUBLIC_BASE_PATH ("" at the root)
 * @returns {string} The inline script that registers the `default` Trusted Types policy. It returns
 *   an accepted URL unchanged: Turbopack finds its chunk scripts by their exact src attribute.
 */
export function trustedTypesPolicy(basePath = "") {
  const prefix = JSON.stringify(`${basePath.replace(/\/+$/, "")}/_next/static/`);
  return (
    `if(self.trustedTypes)trustedTypes.createPolicy("default",{createScriptURL(s){` +
    `const u=new URL(s,location.href);` +
    `return u.origin===location.origin&&u.pathname.startsWith(${prefix})&&u.pathname.endsWith(".js")?s:null}})`
  );
}

/** @param {string[]} hashes */
export function policy(hashes) {
  const self = "'self'";
  return [
    "default-src 'self'",
    `script-src 'self' ${hashes.join(" ")}`.trim(),
    "style-src 'self'",
    `img-src ${self}`,
    `connect-src ${self}`,
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "require-trusted-types-for 'script'",
    "trusted-types default",
  ].join("; ");
}

/**
 * @param {string} html @param {string} basePath
 * @param {string} themeScript the family theme script's URL, added blocking right after the policy. The
 *   static build adds it here rather than in the React tree: React creates a client-rendered <script>
 *   through innerHTML, which Trusted Types blocks.
 * @returns {string} html with the CSP <meta>, then the Trusted Types policy script, ahead of any
 *   other script: right after <meta charset> (which has to stay within the first 1024 bytes),
 *   else first in <head>.
 */
export function withCsp(html, basePath = "", themeScript = "") {
  if (html.includes('http-equiv="Content-Security-Policy"')) throw new Error("page already has a CSP <meta>");
  const anchor = /<meta charset=[^>]*>/i.exec(html) ?? /<head[^>]*>/i.exec(html);
  if (!anchor) throw new Error("no <head> to put the CSP in");
  const end = anchor.index + anchor[0].length;
  const tt = `<script>${trustedTypesPolicy(basePath)}</script>`;
  const theme = themeScript ? `<script src="${themeScript}"></script>` : "";
  const meta = `<meta http-equiv="Content-Security-Policy" content="${policy(inlineScriptHashes(tt + html))}"/>`;
  return html.slice(0, end) + meta + tt + theme + html.slice(end);
}

// Response headers for hosts that read a _headers file. frame-ancestors only works as a header.
// Next's /_next/static/ files are content-hashed, so they can be cached for good.
/** @param {string} basePath @returns {string} the _headers file */
export const headers = (basePath = "") => `/*
  Content-Security-Policy: frame-ancestors 'none'
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), geolocation=(), microphone=()
  Cross-Origin-Opener-Policy: same-origin-allow-popups
  Strict-Transport-Security: max-age=31536000

${basePath.replace(/\/+$/, "")}/_next/static/*
  Cache-Control: public, max-age=31536000, immutable
`;

function htmlFiles(dir) {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && e.name.endsWith(".html"))
    .map((e) => join(e.parentPath, e.name));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = process.argv[2] ?? "out";
  if (process.env.NEXT_PUBLIC_CULL_STATIC !== "1" && process.env.CULL_STATIC !== "1") {
    console.log("csp: skipped (not the static demo build)");
  } else {
    sameOriginTape(process.env.NEXT_PUBLIC_CULL_TAPE_URL);
    const files = htmlFiles(out);
    for (const file of files) writeFileSync(file, withCsp(readFileSync(file, "utf8"), "", "/dh-theme.js"));
    writeFileSync(join(out, "_headers"), headers());
    console.log(`csp: ${files.length} page(s)`);
  }
}
