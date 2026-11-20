import { docHeadings, docTitle } from "@/lib/docs";
import { DOC_PAGES, curatorLinks, docsHref, type DocPage } from "@/lib/docsLinks";

import { DocArticle, LINK } from "./DocArticle";
import { DocsNav } from "./DocsNav";
import { ExternalLink } from "./ExternalLink";

/** One doc with its contents beside it: the pages, and this page's sections. */
export async function DocPageView({ page }: { page: DocPage }) {
  const headings = (await docHeadings(page)).filter((heading) => heading.depth <= 3);
  const title = docTitle(page);
  return (
    <div className="grid gap-8 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:self-start lg:overflow-auto">
        <DocsNav pages={DOC_PAGES.map((doc) => ({ href: docsHref(doc), title: docTitle(doc) }))} current={docsHref(page)} headings={headings} />
      </aside>
      <article className="min-w-0 max-w-[54rem]" aria-labelledby="doc-title">
        <h2 id="doc-title" className="font-display text-heading font-semibold">
          {title}
        </h2>
        <p className="mt-1 mb-6 text-caption text-text-muted">
          From{" "}
          <ExternalLink href={curatorLinks().blob(page.file)} className={LINK}>
            {page.file}
          </ExternalLink>{" "}
          in argus-curator.
        </p>
        <DocArticle page={page} />
      </article>
    </div>
  );
}
