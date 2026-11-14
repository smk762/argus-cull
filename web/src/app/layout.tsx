import type { Metadata, Viewport } from "next";

import { DemoStrip } from "@/components/DemoStrip";
import { staticDemo } from "@/lib/demo";

import "./globals.css";

const DESCRIPTION = "See which images argus-curator would keep for a training set, and download the paths a script should act on.";
const DEMO_DESCRIPTION =
  "Argus Cull, the content-safety screening demo for argus-curator: NudeNet, MiVOLO ages and SingGuard policies, replayed from a recorded scan.";

export const metadata: Metadata = {
  title: staticDemo() ? "Argus Cull demo · Dragonhound Labs" : "Argus Cull",
  description: staticDemo() ? DEMO_DESCRIPTION : DESCRIPTION,
  // Favicons: argus-cortex brand/packages/curator/favicon/, copied unchanged. favicon.ico, icon.svg and
  // apple-icon.png sit in src/app/ and Next emits their tags; icon-192/512 in public/ are for the manifest.
  manifest: "/site.webmanifest",
};

// The browser chrome follows the page: the family's --dh-bg values (a <meta> can't read a CSS variable).
export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfbf9" },
    { media: "(prefers-color-scheme: dark)", color: "#121416" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/*
          The family theme script (public/dh-theme.js, a copy of vendor/dh/dh-theme.js). A plain blocking
          <script src>, first in <head>, so the saved choice (the `dh-theme` cookie, shared across
          *.dragonhound.dev) is on <html> before the first paint. The static demo build adds the same tag
          in scripts/csp.mjs instead, next to its Trusted Types policy: React would create this element through
          innerHTML on a client render, which that policy blocks.
        */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts -- blocking on purpose: it must set the theme before first paint */}
        {staticDemo() ? null : <script src="/dh-theme.js" />}
      </head>
      <body className="min-h-dvh">
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        {staticDemo() ? <DemoStrip /> : null}
        {children}
      </body>
    </html>
  );
}
