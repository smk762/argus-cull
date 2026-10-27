import type { ShieldState } from "@/lib/policies";

const FILL: Record<ShieldState, string> = {
  none: "text-text-muted",
  safe: "text-success",
  dissent: "text-orange-400",
  unsafe: "text-error",
};

/** Policy verdict as a shield: grey before a verdict, green safe, orange when a policy dissents, red unsafe. */
export function Shield({ state, title, className = "h-4 w-4" }: { state: ShieldState; title: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" role="img" aria-label={title} className={`${className} shrink-0 ${FILL[state]}`} fill="currentColor">
      <title>{title}</title>
      <path d="M12 2 4 5.5V11c0 5.1 3.4 9.8 8 11 4.6-1.2 8-5.9 8-11V5.5L12 2Z" opacity={state === "none" ? 0.45 : 1} />
      {state === "safe" ? <path d="m9 12 2 2 4-4" fill="none" stroke="#0b1020" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /> : null}
      {state === "dissent" ? <path d="M12 7v6M12 16.5v.5" fill="none" stroke="#0b1020" strokeWidth="2" strokeLinecap="round" /> : null}
      {state === "unsafe" ? <path d="m9 9 6 6M15 9l-6 6" fill="none" stroke="#0b1020" strokeWidth="2" strokeLinecap="round" /> : null}
    </svg>
  );
}
