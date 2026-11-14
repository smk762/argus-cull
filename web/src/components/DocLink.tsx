// An in-context link into the imported curator docs (/docs). It opens a new tab: the page it sits on
// may be streaming a scan or holding a half-filled scan form, which a same-tab jump would drop.
// Same site, so the opener is cut but the cue is the same as ExternalLink's.

import type { ReactNode } from "react";

export function DocLink({ href, label, children = "Docs", className = "" }: { href: string; label: string; children?: ReactNode; className?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      aria-label={`${label} (curator docs, opens in new tab)`}
      className={`text-caption font-normal text-interactive underline underline-offset-2 hover:text-interactive-hover ${className}`}
    >
      {children}
    </a>
  );
}
