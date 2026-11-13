"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const HALF_WIDTH = 136;
/** Long enough to move the pointer across the 6px gap onto the tooltip. */
const HIDE_DELAY_MS = 150;

/**
 * A tooltip for whatever it wraps, on hover or keyboard focus. It renders into
 * the page body at a fixed position, so a scrolling sidebar does not clip it,
 * and it keeps inside the viewport's sides. Above the target unless that would
 * leave the top of the screen.
 *
 * WCAG 1.4.13: Escape dismisses it without moving focus or the pointer (and
 * only it: an open dialog stays open), and the pointer can move onto it
 * without it closing, so a magnified reader can follow the text.
 */
export function Tooltip({ text, children, className = "" }: { text: string; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = useId();
  const [pos, setPos] = useState<{ x: number; y: number; below: boolean; host: Element } | null>(null);
  const open = pos !== null;

  function cancelHide() {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = null;
  }

  function hideSoon() {
    cancelHide();
    hideTimer.current = setTimeout(() => setPos(null), HIDE_DELAY_MS);
  }

  function hideNow() {
    cancelHide();
    setPos(null);
  }

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      // Close the tooltip, not the <dialog> it sits in: a dialog's close request comes from this keydown.
      event.preventDefault();
      event.stopPropagation();
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = null;
      setPos(null);
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open]);

  useEffect(() => cancelHide, []);

  function show() {
    cancelHide();
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
      onMouseLeave={hideSoon}
      onFocus={show}
      onBlur={hideNow}
    >
      {children}
      {pos
        ? createPortal(
            <span
              id={id}
              role="tooltip"
              onMouseEnter={cancelHide}
              onMouseLeave={hideSoon}
              className="fixed z-50 w-max max-w-64 rounded-md border border-base-600 bg-base-900 px-2 py-1.5 text-caption font-normal text-text-secondary shadow-lg"
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
