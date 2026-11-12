"use client";

import { useEffect, useRef, type MouseEvent, type ReactNode } from "react";

/** Whether a pointer event landed outside the dialog's box, on its backdrop. */
function outside(event: PointerEvent, dialog: HTMLDialogElement): boolean {
  const box = dialog.getBoundingClientRect();
  return event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
}

/** A Close or Cancel button's handler: closes the dialog the button sits in. */
export function closeModal(event: MouseEvent<HTMLElement>) {
  event.currentTarget.closest("dialog")?.close();
}

/**
 * A native modal `<dialog>`, open for as long as it is mounted. The browser
 * supplies what the old overlays built by hand: the page behind goes inert,
 * focus stays inside and returns to the opener on close, and Escape, the back
 * gesture and a click on the backdrop (`closedby="any"`) all close it.
 *
 * Every way of closing ends in the dialog's `close` event, which calls
 * `onClose`; the parent then unmounts it. Close buttons use `closeModal`
 * rather than `onClose`, so focus goes back to the opener before the dialog
 * leaves the page.
 */
export function Modal({
  labelledBy,
  className = "",
  onClose,
  children,
}: {
  labelledBy: string;
  /** Width and padding; the frame (colour, radius, height cap) is shared. */
  className?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    // Safari has no closedby yet: rebuild click-outside from the pointer
    // position, needing both the press and the release outside so a text
    // selection dragged onto the backdrop does not dismiss.
    if ("closedBy" in HTMLDialogElement.prototype) return;
    let pressedOutside = false;
    const down = (event: PointerEvent) => {
      pressedOutside = outside(event, dialog);
    };
    const up = (event: PointerEvent) => {
      if (pressedOutside && outside(event, dialog)) dialog.close();
    };
    dialog.addEventListener("pointerdown", down);
    dialog.addEventListener("pointerup", up);
    return () => {
      dialog.removeEventListener("pointerdown", down);
      dialog.removeEventListener("pointerup", up);
    };
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      closedby="any"
      onClose={onClose}
      className={`m-auto max-h-[90dvh] w-[calc(100%-2rem)] overflow-auto rounded-xl bg-base-800 text-text-primary shadow-soft ${className}`}
    >
      {children}
    </dialog>
  );
}
