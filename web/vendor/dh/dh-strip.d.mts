/*! dh-strip v1.2.1 | TypeScript declarations for dh-strip.mjs (vendored alongside it; a .mjs import resolves .d.mts). */

/** A site id used in data-dh-site: the lab home or one of the demos. */
export type DhSite = "dragonhound" | "lightbox" | "studio" | "realms";

export interface DhStripLink {
  readonly site: DhSite;
  readonly label: string;
  readonly href: string;
}

export interface DhStrip {
  /** aria-label of the nav landmark. */
  readonly ariaLabel: string;
  /** The "Dragonhound Labs" home link. */
  readonly home: DhStripLink;
  /** The demo links, in display order. */
  readonly links: readonly DhStripLink[];
  /** "Live demo": always shown. */
  readonly label: string;
  /** " · recorded output": visually hidden below 560 px. */
  readonly labelMore: string;
  /** The mark's path data for viewBox 0 0 100 100, fill-rule evenodd. */
  readonly markPath: string;
}

/** Plain, frozen data for rendering the strip natively (React/Next). */
export declare const strip: DhStrip;

/** The strip as an HTML string; `current` adds aria-current="page" to that site's link. */
export declare function stripHtml(options?: { current?: DhSite | string }): string;

/** CSS selector list matching the current site's link from data-dh-site on the html element or the strip. */
export declare function currentSiteSelector(): string;
