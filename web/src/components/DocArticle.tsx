import Link from "next/link";
import type { ComponentProps, JSX } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { curatorDoc, readDoc } from "@/lib/docs";
import type { DocPage } from "@/lib/docsLinks";

import { ExternalLink } from "./ExternalLink";

export const LINK = "text-interactive underline underline-offset-2 hover:text-interactive-hover";

type Props<T extends keyof JSX.IntrinsicElements> = ComponentProps<T> & { node?: unknown };

/** A heading with its id and a self-link, so a section can be linked to. */
function heading(Tag: "h2" | "h3" | "h4", className: string) {
  return function DocHeading({ id, children }: Props<"h2">) {
    return (
      <Tag id={id} className={`group scroll-mt-6 ${className}`}>
        {children}
        {id ? (
          <a href={`#${id}`} className="ml-2 text-text-muted no-underline opacity-0 group-hover:opacity-100 focus:opacity-100" aria-label="Link to this section">
            #
          </a>
        ) : null}
      </Tag>
    );
  };
}

/** The markdown's elements in the site's tokens. No `style` attribute anywhere: the static build's CSP has no 'unsafe-inline'. */
const COMPONENTS = {
  h2: heading("h2", "mt-10 border-b border-base-700 pb-1 font-display text-subheading font-semibold text-text-primary first:mt-0"),
  h3: heading("h3", "mt-6 font-display text-body font-semibold text-text-primary"),
  h4: heading("h4", "mt-4 text-small font-semibold text-text-primary"),
  p: ({ children }: Props<"p">) => <p className="my-3 leading-relaxed text-text-secondary">{children}</p>,
  a: ({ href = "", children }: Props<"a">) =>
    href.startsWith("/") && !href.startsWith("//") ? (
      <Link href={href} className={LINK}>
        {children}
      </Link>
    ) : href.startsWith("#") ? (
      <a href={href} className={LINK}>
        {children}
      </a>
    ) : (
      <ExternalLink href={href} className={LINK}>
        {children}
      </ExternalLink>
    ),
  ul: ({ children }: Props<"ul">) => <ul className="my-3 list-disc space-y-1 pl-6 text-text-secondary">{children}</ul>,
  ol: ({ children }: Props<"ol">) => <ol className="my-3 list-decimal space-y-1 pl-6 text-text-secondary">{children}</ol>,
  li: ({ children }: Props<"li">) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }: Props<"strong">) => <strong className="font-semibold text-text-primary">{children}</strong>,
  blockquote: ({ children }: Props<"blockquote">) => <blockquote className="my-3 border-l-2 border-base-600 pl-3 text-text-secondary">{children}</blockquote>,
  code: ({ className, children }: Props<"code">) => <code className={`rounded-sm bg-base-800 px-1 py-0.5 font-mono text-[0.9em] text-text-primary ${className ?? ""}`}>{children}</code>,
  pre: ({ children }: Props<"pre">) => (
    <pre className="my-3 overflow-x-auto rounded-md border border-base-700 bg-base-800 p-3 font-mono text-caption leading-relaxed text-text-secondary [&_code]:bg-transparent [&_code]:p-0">{children}</pre>
  ),
  table: ({ children }: Props<"table">) => (
    <div className="my-4 overflow-x-auto">
      <table className="w-full border-collapse text-small">{children}</table>
    </div>
  ),
  // GFM alignment arrives as a `style`; drop it.
  th: ({ children }: Props<"th">) => <th className="border-b border-base-600 px-2 py-1.5 text-left font-semibold text-text-primary">{children}</th>,
  td: ({ children }: Props<"td">) => <td className="border-b border-base-700 px-2 py-1.5 align-top text-text-secondary">{children}</td>,
  hr: () => <hr className="my-6 border-base-700" />,
  // eslint-disable-next-line @next/next/no-img-element -- a vendored doc image, same origin
  img: ({ src, alt }: Props<"img">) => (typeof src === "string" ? <img src={src} alt={alt ?? ""} loading="lazy" className="my-3 rounded-md" /> : null),
};

/** One imported curator doc. A server component: the file is read and transformed on the server, never in the browser. */
export function DocArticle({ page }: { page: DocPage }) {
  const { plugin } = curatorDoc(page);
  return (
    <div className="min-w-0 text-small">
      <ReactMarkdown remarkPlugins={[remarkGfm, plugin]} skipHtml components={COMPONENTS}>
        {readDoc(page)}
      </ReactMarkdown>
    </div>
  );
}
