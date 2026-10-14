"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon, SponsoLogo } from "@/components/ui";

export const navigation = [
  { label: "Übersicht", href: "/", icon: "grid" },
  { label: "Events", href: "/events", icon: "calendar" },
  { label: "Sponsoren", href: "/sponsors", icon: "users" },
  { label: "Aufgaben", href: "/aufgaben", icon: "check" },
  { label: "Bausteine", href: "/bausteine", icon: "layers" },
  { label: "Einstellungen", href: "/einstellungen", icon: "settings" },
];

export function MobileMenu({ isPlatformAdmin = false }: { isPlatformAdmin?: boolean }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        toggleRef.current?.focus();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])");
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      if (dialog.open) dialog.close();
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useEffect(() => setOpen(false), [path]);

  return <>
    <button
      ref={toggleRef}
      className="icon-button menu-toggle"
      type="button"
      aria-label={open ? "Menü schließen" : "Menü öffnen"}
      aria-expanded={open}
      aria-controls="mobile-primary-navigation"
      onClick={() => setOpen((value) => !value)}
    ><Icon name="menu" size={18}/></button>
    {open && createPortal(<dialog className="mobile-menu-layer" aria-label="Hauptmenü" ref={dialogRef} onCancel={(event) => { event.preventDefault(); setOpen(false); toggleRef.current?.focus(); }}>
      <div className="mobile-menu-backdrop" aria-hidden="true" onClick={() => { setOpen(false); toggleRef.current?.focus(); }}/>
      <div className="mobile-drawer" id="mobile-primary-navigation">
        <div className="mobile-drawer-head">
          <Link href="/" className="brand" aria-label="sponso Startseite"><SponsoLogo /></Link>
          <button ref={closeRef} className="icon-button" type="button" aria-label="Menü schließen" onClick={() => { setOpen(false); toggleRef.current?.focus(); }}><Icon name="close" size={17}/></button>
        </div>
        <div className="nav-label">Workspace</div>
        <nav className="nav-list" aria-label="Hauptnavigation">{navigation.map((item) => {
          const route = item.href.split("?")[0];
          const active = path === route || (route !== "/" && path.startsWith(`${route}/`));
          return <a href={item.href} key={item.label} className={`nav-link ${active ? "active" : ""}`} aria-current={active ? "page" : undefined} onClick={() => setOpen(false)}><span className="nav-icon"><Icon name={item.icon} size={17}/></span>{item.label}</a>;
        })}{isPlatformAdmin && <a href="/admin" className={`nav-link ${path.startsWith("/admin") ? "active" : ""}`} aria-current={path.startsWith("/admin") ? "page" : undefined} onClick={() => setOpen(false)}><span className="nav-icon"><Icon name="users" size={17}/></span>Administration</a>}</nav>
      </div>
    </dialog>, document.body)}
  </>;
}
