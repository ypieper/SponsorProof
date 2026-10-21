"use client";

import { useEffect, useRef, type ReactNode } from "react";

const openDialogs: HTMLElement[] = [];
let previousBodyOverflow = "";

function focusableElements(dialog: HTMLElement) {
  return Array.from(dialog.querySelectorAll<HTMLElement>('a[href], button, input, textarea, select, [tabindex]'))
    .filter((element) => element.tabIndex >= 0 && !element.matches(":disabled") && !element.closest('[inert], [aria-hidden="true"]') && element.getClientRects().length > 0);
}

/** Shared focus, scrolling and dismissal behavior for all product dialogs. */
export function Modal({ children, labelledBy, describedBy, onClose, busy = false, className = "create-modal", backdropClassName = "modal-backdrop", role = "dialog" }: {
  children: ReactNode;
  labelledBy: string;
  describedBy?: string;
  onClose: () => void;
  busy?: boolean;
  className?: string;
  backdropClassName?: string;
  role?: "dialog" | "alertdialog";
}) {
  const dialogRef = useRef<HTMLElement>(null);
  // Capture the trigger before React applies autoFocus to a child input.
  const previousFocusRef = useRef(typeof document !== "undefined" && document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);
  closeRef.current = onClose;
  busyRef.current = busy;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = previousFocusRef.current;
    if (!openDialogs.length) {
      previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    openDialogs.push(dialog);
    if (!dialog.contains(document.activeElement)) (focusableElements(dialog)[0] ?? dialog).focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || openDialogs.at(-1) !== dialog) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (!busyRef.current) closeRef.current();
      } else if (event.key === "Tab") {
        const elements = focusableElements(dialog!);
        const first = elements[0] ?? dialog!;
        const last = elements.at(-1) ?? dialog!;
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !dialog!.contains(document.activeElement))) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      const index = openDialogs.indexOf(dialog);
      if (index >= 0) openDialogs.splice(index, 1);
      if (!openDialogs.length) document.body.style.overflow = previousBodyOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  return <div className={backdropClassName} onMouseDown={(event) => {
    if (event.target === event.currentTarget && !busy && openDialogs.at(-1) === dialogRef.current) onClose();
  }}>
    <section ref={dialogRef} className={className} role={role} aria-modal="true" aria-labelledby={labelledBy} aria-describedby={describedBy} aria-busy={busy || undefined} tabIndex={-1}>{children}</section>
  </div>;
}
