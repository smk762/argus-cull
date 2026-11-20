import type { NextConfig } from "next";

// Two builds from one tree:
//
// - Live (default): scans and exports are live, so this is a server (`next start`) with the API
//   routes in src/app/api (labels, cohorts, captions, display).
// - Static demo (`CULL_STATIC=1`, `make pages`): a pure static export to out/ that reads the
//   recorded tape (NEXT_PUBLIC_CULL_TAPE_URL, /data-tape by default) and has no API routes at all.
//   The routes are named route.live.ts, which only the live build's pageExtensions treat as routes;
//   to the static build they are plain modules nothing imports. scripts/csp.mjs then gives every
//   exported page a hash-based CSP.
const staticDemo = process.env.CULL_STATIC === "1" || process.env.NEXT_PUBLIC_CULL_STATIC === "1";

const nextConfig: NextConfig = {
  images: { unoptimized: true },
  pageExtensions: staticDemo ? ["tsx", "ts"] : ["tsx", "ts", "live.ts"],
  env: { NEXT_PUBLIC_CULL_STATIC: staticDemo ? "1" : "" },
  ...(staticDemo ? { output: "export" as const, trailingSlash: true } : {}),
};

export default nextConfig;
