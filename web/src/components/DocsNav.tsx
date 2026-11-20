import Link from "next/link";

import type { DocHeading } from "@/lib/docs";

/** The docs' pages, and the current page's sections under it. */
export function DocsNav({ pages, current, headings }: { pages: { href: string; title: string }[]; current: string; headings: DocHeading[] }) {
  return (
    <nav aria-label="Curator docs" className="text-small">
      <ul className="space-y-0.5">
        {pages.map((page) => (
          <li key={page.href}>
            <Link
              href={page.href}
              aria-current={page.href === current ? "page" : undefined}
              className={`block rounded-md px-2 py-1 ${page.href === current ? "bg-base-800 font-medium text-text-primary" : "text-text-secondary hover:text-text-primary"}`}
            >
              {page.title}
            </Link>
            {page.href === current && headings.length > 0 ? (
              <ul className="mt-1 mb-2 space-y-0.5 border-l border-base-700 pl-3">
                {headings.map((heading) => (
                  <li key={heading.id} className={heading.depth === 3 ? "pl-3" : ""}>
                    <a href={`#${heading.id}`} className="block py-0.5 text-caption text-text-secondary hover:text-text-primary">
                      {heading.text}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </nav>
  );
}
