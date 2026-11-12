"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const HALF_WIDTH = 136;

/**
 * A tooltip for whatever it wraps, on hover or keyboard focus. It renders into
 * the page body at a fixed position, so a scrolling sidebar does not clip it,
 * and it keeps inside the viewport's sides. Above the target unless that would
 * leave the top of the screen.
 */
export function Tooltip({ text, children, className = "" }: { text: string; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const id = useId();
  const [pos, setPos] = useState<{ x: number; y: number; below: boolean; host: Element } | null>(null);

  function show() {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const below = rect.top < 120;
    const x = Math.min(Math.max(rect.left + rect.width / 2, HALF_WIDTH), window.innerWidth - HALF_WIDTH);
    // Inside a modal <dialog> the body sits under the top layer and is inert,
    // so the tooltip goes into the dialog to stay visible and describable.
    const host = ref.current?.closest("dialog[open]") ?? document.body;
    setPos({ x, y: below ? rect.bottom + 6 : rect.top - 6, below, host });
  }

  return (
    <span
      ref={ref}
      className={`inline-flex ${className}`}
      aria-describedby={pos ? id : undefined}
      onMouseEnter={show}
      onMouseLeave={() => setPos(null)}
      onFocus={show}
      onBlur={() => setPos(null)}
    >
      {children}
      {pos
        ? createPortal(
            <span
              id={id}
              role="tooltip"
              className="pointer-events-none fixed z-50 w-max max-w-64 rounded-md border border-base-600 bg-base-900 px-2 py-1.5 text-caption font-normal text-text-secondary shadow-lg"
              style={{ left: pos.x, top: pos.y, transform: `translate(-50%, ${pos.below ? "0" : "-100%"})` }}
            >
              {text}
            </span>,
            pos.host,
          )
        : null}
    </span>
  );
}

/** A small "i" beside a label that explains it. Focusable, and a click does not reach the label it sits in. */
export function Info({ text }: { text: string }) {
  return (
    <Tooltip text={text} className="shrink-0 align-middle">
      <span
        role="img"
        tabIndex={0}
        aria-label={text}
        className="inline-flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full border border-text-muted text-[9px] leading-none font-semibold text-text-muted hover:border-text-primary hover:text-text-primary focus-visible:outline focus-visible:outline-accent-primary"
        onClick={(event) => event.preventDefault()}
      >
        i
      </span>
    </Tooltip>
  );
}
