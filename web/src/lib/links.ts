// Where links go, and how they open.
//
// The Dragonhound demos (dragonhound.dev and its *.dragonhound.dev sites) are one family: links
// between them open in the same tab, so Back works. Anything else (GitHub, PyPI)
// opens in a new tab. Pure, unit-tested.

export const FAMILY_DOMAIN = "dragonhound.dev";

/** True for an http(s) URL on dragonhound.dev or one of its subdomains. */
export function isFamilyUrl(href: string | undefined): boolean {
  if (!href) return false;
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return false; // relative: same site, and not this helper's business
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  const host = url.hostname.toLowerCase();
  return host === FAMILY_DOMAIN || host.endsWith(`.${FAMILY_DOMAIN}`);
}
