"use client";

import { policySourceLabel } from "@/lib/policies";
import type { GuardPolicyInfo } from "@/lib/types";

/**
 * The text a verdict was judged against, from `GET /guard/policies`. Folded:
 * the adult policies are a page of rules, and the scan form should stay short.
 * `default` with no file sends no text; that is SingGuard's own rules.
 */
export function PolicyWording({ info }: { info: GuardPolicyInfo | null }) {
  if (!info) return null;
  const recorded = info.recorded && info.recorded !== info.name ? ` · recorded as ${info.recorded}` : "";
  return (
    <details className="rounded-md border border-base-700 px-3 py-2">
      <summary className="cursor-pointer text-caption text-text-muted">
        Wording · {policySourceLabel(info.source)}
        {recorded}
      </summary>
      {info.error ? <p className="mt-2 text-caption text-warning">{info.error}</p> : null}
      {info.text ? (
        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-caption leading-relaxed text-text-secondary">{info.text}</pre>
      ) : !info.error ? (
        <p className="mt-2 text-caption text-text-muted">SingGuard&apos;s own rules. This server sends no policy text.</p>
      ) : null}
    </details>
  );
}
