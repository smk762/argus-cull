// The family's four demo states (dh-shared README, "Demo-state vocabulary"), styled by
// vendor/dh/dh-badge.css. The sidebar names what kind of data the page shows; a control
// the demo can't run carries "Not in this demo" beside it with a one-line reason.

export const DEMO_STATES = {
  recorded: { label: "Recorded", className: "dh-badge", title: "Recorded output from a real run; no model runs while you browse" },
  sample: { label: "Sample data", className: "dh-badge dh-badge--sample", title: "Synthetic sample to show the layout; not real output" },
  browser: { label: "In-browser", className: "dh-badge dh-badge--browser", title: "Runs in your browser; nothing is sent anywhere" },
  off: { label: "Not in this demo", className: "dh-badge dh-badge--off", title: "Needs the self-hosted backend; see the README" },
} as const;

export type DemoState = keyof typeof DEMO_STATES;

export function DemoBadge({ state, title }: { state: DemoState; title?: string }) {
  const s = DEMO_STATES[state];
  return (
    <span className={`${s.className} shrink-0`} title={title ?? s.title}>
      {s.label}
    </span>
  );
}

/** A control the demo turns off: the badge, then why, on one line. */
export function NotInDemo({ reason, className = "" }: { reason: string; className?: string }) {
  return (
    <p className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-text-muted ${className}`}>
      <DemoBadge state="off" title={reason} />
      <span>{reason}</span>
    </p>
  );
}
