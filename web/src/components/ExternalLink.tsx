// The one way this app links off-site. GitHub, PyPI, Wikimedia and other outside sites open in a new
// tab without handing the new page a window.opener or a Referer, and screen readers are told so.
// The sibling Dragonhound demos (*.dragonhound.dev) are the same family and open in this tab, so
// Back returns here (src/lib/links.ts). Same-site links stay plain <a>/<Link>.

import type { AnchorHTMLAttributes } from "react";

import { isFamilyUrl } from "@/lib/links";

export function ExternalLink({ children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  if (isFamilyUrl(props.href)) return <a {...props}>{children}</a>;
  return (
    <a {...props} target="_blank" rel="noopener noreferrer">
      {children}
      <span className="sr-only"> (opens in new tab)</span>
    </a>
  );
}
