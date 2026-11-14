import type { Metadata } from "next";
import { DM_Sans, Inter } from "next/font/google";

import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans" });

export const metadata: Metadata = {
  title: "Argus Cull",
  description: "See which images argus-curator would keep for a training set, and download the paths a script should act on.",
  // Favicons: argus-cortex brand/packages/curator/favicon/, copied unchanged. favicon.ico, icon.svg and
  // apple-icon.png sit in src/app/ and Next emits their tags; icon-192/512 in public/ are for the manifest.
  manifest: "/site.webmanifest",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${dmSans.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
