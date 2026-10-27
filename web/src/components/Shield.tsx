import type { ShieldState } from "@/lib/policies";

const FILL: Record<ShieldState, string> = {
  none: "text-text-muted",
  safe: "text-success",
  "safe-split": "text-success",
  unsafe: "text-error",
  "unsafe-split": "text-error",
};

const BODY = "M12 2 4 5.5V11c0 5.1 3.4 9.8 8 11 4.6-1.2 8-5.9 8-11V5.5L12 2Z";
// The same shape at about half size, centred, for the disagreement core.
const CORE = "M12 7.5 8.5 9v2.6c0 2.4 1.5 4.6 3.5 5.2 2-.6 3.5-2.8 3.5-5.2V9L12 7.5Z";

/**
 * Policy verdict as a shield. The colour is the verdict the shield follows:
 * grey before a verdict, green passed, red flagged. An orange core means
 * another policy disagreed.
 */
export function Shield({ state, title, className = "h-4 w-4" }: { state: ShieldState; title: string; className?: string }) {
  const split = state === "safe-split" || state === "unsafe-split";
  return (
    <svg viewBox="0 0 24 24" role="img" aria-label={title} className={`${className} shrink-0 ${FILL[state]}`} fill="currentColor">
      <title>{title}</title>
      <path d={BODY} opacity={state === "none" ? 0.45 : 1} />
      {split ? <path d={CORE} className="text-orange-400" fill="currentColor" /> : null}
      {state === "safe" ? <path d="m9 12 2 2 4-4" fill="none" stroke="#0b1020" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /> : null}
      {state === "unsafe" ? <path d="m9 9 6 6M15 9l-6 6" fill="none" stroke="#0b1020" strokeWidth="2" strokeLinecap="round" /> : null}
    </svg>
  );
}
