import Link from "next/link";
import type { ReactNode } from "react";

import { LINK } from "@/components/DocArticle";
import { ExternalLink } from "@/components/ExternalLink";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CURATOR, curatorLinks } from "@/lib/docsLinks";

/**
 * argus-curator's docs, imported at the curator `dev` commit Cull follows (sync/argus-curator.json). The header
 * names that version and commit, which are also what the fixture scan records and what compose builds.
 */
export default function DocsLayout({ children }: { children: ReactNode }) {
  const links = curatorLinks();
  const short = CURATOR.commit.slice(0, 9);
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4">
      <header className="space-y-2 border-b border-base-700 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-caption">
              <Link href="/" className={LINK}>
                ← Argus Cull
              </Link>
            </p>
            <h1 className="font-display text-heading">argus-curator docs</h1>
          </div>
          <ThemeToggle />
        </div>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-text-secondary">
          <span className="font-mono text-text-primary">
            {CURATOR.package} {CURATOR.version} @ {short}
          </span>
          <span aria-hidden="true">·</span>
          <ExternalLink href={links.pypi} className={LINK}>
            PyPI
          </ExternalLink>
          <span aria-hidden="true">·</span>
          <ExternalLink href={links.github} className={LINK}>
            GitHub at {short}
          </ExternalLink>
          <span aria-hidden="true">·</span>
          <ExternalLink href={links.changelog} className={LINK}>
            Changelog
          </ExternalLink>
        </p>
        <p className="max-w-prose text-caption text-text-muted">
          Imported from curator&apos;s <span className="font-mono">{CURATOR.branch}</span> branch at the commit Cull runs and its demo data was recorded with, not hand-copied. A daily check opens a pull request when that branch moves on.
        </p>
      </header>
      <main id="main" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
