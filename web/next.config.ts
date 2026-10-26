import type { NextConfig } from "next";

// Scans and exports are live, so this is a server (`next start`), not a static export.
const nextConfig: NextConfig = {
  images: { unoptimized: true },
};

export default nextConfig;
