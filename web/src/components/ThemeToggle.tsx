"use client";

import { useSyncExternalStore } from "react";

import { effectiveScheme, serverScheme, subscribeScheme } from "@/lib/theme";

import { Tooltip } from "./Tooltip";

/**
 * The family's two-state theme toggle. public/dh-theme.js handles clicks on any
 * `[data-dh-theme-toggle]`, stores the choice in the shared cookie and keeps
 * `aria-pressed` (pressed = dark) in step, so React renders it once and leaves
 * it alone. Both icons are in the markup and globals.css shows the right one
 * from the first paint.
 */
export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribeScheme, effectiveScheme, serverScheme) === "dark";
  return (
    <Tooltip text={dark ? "Dark theme on" : "Dark theme off"} className="shrink-0">
      <button
        type="button"
        data-dh-theme-toggle=""
        aria-label="Dark theme"
        // Owned by dh-theme.js, which corrects it before hydration; React never updates it.
        aria-pressed="false"
        suppressHydrationWarning
        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-base-600 text-text-secondary hover:border-accent-primary hover:text-text-primary"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className="theme-icon-moon h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
        <svg viewBox="0 0 24 24" aria-hidden="true" className="theme-icon-sun h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      </button>
    </Tooltip>
  );
}
