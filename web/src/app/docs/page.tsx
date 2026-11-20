import type { Metadata } from "next";

import { DocPageView } from "@/components/DocPageView";
import { DOC_PAGES } from "@/lib/docsLinks";

export const metadata: Metadata = { title: "argus-curator docs · Argus Cull" };

export default function DocsOverview() {
  return <DocPageView page={DOC_PAGES[0]} />;
}
