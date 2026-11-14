import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DocPageView } from "@/components/DocPageView";
import { docTitle } from "@/lib/docs";
import { DOC_PAGES } from "@/lib/docsLinks";

// Only the imported pages exist; the static export prerenders each one.
export const dynamicParams = false;

export function generateStaticParams() {
  return DOC_PAGES.filter((page) => page.slug).map((page) => ({ slug: page.slug }));
}

const pageFor = (slug: string) => DOC_PAGES.find((page) => page.slug && page.slug === slug);

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const page = pageFor((await params).slug);
  return { title: page ? `${docTitle(page)} · argus-curator docs · Argus Cull` : "argus-curator docs · Argus Cull" };
}

export default async function DocsPage({ params }: { params: Promise<{ slug: string }> }) {
  const page = pageFor((await params).slug);
  if (!page) notFound();
  return <DocPageView page={page} />;
}
