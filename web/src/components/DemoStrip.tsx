// The Dragonhound Labs family bar, rendered natively from the vendored source (vendor/dh/dh-strip.mjs,
// dh-shared 1.2.1): links, labels and mark come from there, so a re-sync updates it with no hand copy.
// Styles are vendor/dh/dh-strip.css (imported by globals.css). No JS. src/lib/shared.test.ts checks the
// rendered markup against the module's own stripHtml(). Only the static demo build carries it.
//
// The strip's link list does not name Cull yet (it lists Lightbox, Studio and Realms), so the <nav>
// says data-dh-site="cull" and no link is marked current. Once dh-shared adds a cull link, the same
// code marks it with no change here.
import { strip } from "../../vendor/dh/dh-strip.mjs";

export const STRIP_SITE = "cull";

/** The strip, with this site's link (when the shared list has one) marked current. Same-tab links: *.dragonhound.dev is one family. */
export function DemoStrip({ current = STRIP_SITE }: { current?: string }) {
  const { home } = strip;
  return (
    <nav className="dh-strip" aria-label={strip.ariaLabel} data-dh-site={current}>
      <a className="dh-strip-home" href={home.href} data-dh-site={home.site}>
        <svg className="dh-strip-mark" viewBox="0 0 100 100" width="18" height="18" aria-hidden="true" focusable="false">
          <path fillRule="evenodd" d={strip.markPath} />
        </svg>
        <span className="dh-strip-name">{home.label}</span>
      </a>
      <ul className="dh-strip-links">
        {strip.links.map((link) => (
          <li key={link.site}>
            <a href={link.href} data-dh-site={link.site} aria-current={link.site === current ? "page" : undefined}>
              {link.label}
            </a>
          </li>
        ))}
      </ul>
      <p className="dh-strip-label">
        {strip.label}
        <span className="dh-strip-more">{strip.labelMore}</span>
      </p>
    </nav>
  );
}
