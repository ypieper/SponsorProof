"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LogoutButton } from "@/components/logout-button";

export function OrganizerAccountMenu({ initials, name }: { initials: string; name: string }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstItemRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => setOpen(false), [path]);

  useEffect(() => {
    if (!open) return;
    firstItemRef.current?.focus();

    function closeOnOutsideClick(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return <div className="organizer-account-menu" ref={containerRef}>
    <button ref={triggerRef} className="avatar top-user-avatar organizer-account-trigger" type="button" aria-label={`Kontomenü für ${name} ${open ? "schließen" : "öffnen"}`} aria-expanded={open} aria-controls={open ? "organizer-account-dropdown" : undefined} onClick={() => setOpen((value) => !value)}>{initials}</button>
    {open && <div className="organizer-account-dropdown" id="organizer-account-dropdown">
      <Link ref={firstItemRef} href="/einstellungen?tab=profile" onClick={() => setOpen(false)}>Eigene Daten</Link>
      <LogoutButton/>
    </div>}
  </div>;
}
