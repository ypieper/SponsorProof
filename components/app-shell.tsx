"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Icon, SponsoLogo } from "@/components/ui";
import { MobileMenu, navigation } from "@/components/mobile-menu";
import { LogoutButton } from "@/components/logout-button";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { fetchOrganizerSettings } from "@/lib/organization-settings-storage";
import { clearLegacyBrowserData } from "@/lib/clear-legacy-browser-data";

type UserDisplay = { name: string; initials: string; organization: string };

const defaultUserDisplay: UserDisplay = { name: "Benutzer", initials: "SP", organization: "Veranstalter" };

function userDisplayName(firstName: string, lastName: string, email: string) {
  const fullName = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
  return fullName || email || "Benutzer";
}

function userInitials(firstName: string, lastName: string, email: string) {
  const initials = [firstName.trim(), lastName.trim()].filter(Boolean).map((part) => part[0]).join("").slice(0, 2);
  return (initials || email.slice(0, 2) || "SP").toLocaleUpperCase("de-DE");
}

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const [userDisplay, setUserDisplay] = useState(defaultUserDisplay);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);

  useEffect(() => {
    let active = true;
    clearLegacyBrowserData();
    const loadOrganization = () => {
      if (!isSupabaseConfigured) return;
      void fetchOrganizerSettings().then(({ data }) => {
        if (active) setUserDisplay((current) => ({ ...current, organization: data?.organization?.trim() || defaultUserDisplay.organization }));
      }).catch(() => undefined);
    };
    const loadUser = () => {
      if (!isSupabaseConfigured) return;
      void createClient().auth.getUser().then(({ data }) => {
        if (!active) return;
        if (!data.user) return;
        const firstName = String(data.user.user_metadata?.first_name ?? "");
        const lastName = String(data.user.user_metadata?.last_name ?? "");
        const email = data.user.email ?? "";
        setUserDisplay((current) => ({ ...current, name: userDisplayName(firstName, lastName, email), initials: userInitials(firstName, lastName, email) }));
      }).catch(() => undefined);
    };

    loadOrganization();
    loadUser();
    if (isSupabaseConfigured) {
      void fetch("/api/admin/access").then((response) => response.ok ? response.json() : null)
        .then((result) => { if (active) setIsPlatformAdmin(Boolean(result?.isAdmin)); })
        .catch(() => undefined);
    }
    window.addEventListener("sponsorproof:organizer-settings-updated", loadOrganization);
    window.addEventListener("sponsorproof:user-account-updated", loadUser);

    return () => {
      active = false;
      window.removeEventListener("sponsorproof:organizer-settings-updated", loadOrganization);
      window.removeEventListener("sponsorproof:user-account-updated", loadUser);
    };
  }, []);

  if (path.startsWith("/login")) return <>{children}</>;
  if (["/agb", "/impressum", "/datenschutz", "/kontakt"].includes(path) || path.startsWith("/sponsor-upload/")) return <>{children}</>;
  const isMobileMode = path === "/event-modus";
  if (isMobileMode) return <>{children}</>;
  return <div className="app-frame">
    <aside className="sidebar">
      <Link href="/" className="brand" aria-label="sponso Startseite"><SponsoLogo /></Link>
      <div className="nav-label">Veranstalterbereich</div>
      <nav className="nav-list">{navigation.map((item) => {
        const route = item.href.split("?")[0];
        const active = path === route || (route !== "/" && path.startsWith(`${route}/`));
        return <a href={item.href} key={item.label} className={`nav-link ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}><span className="nav-icon"><Icon name={item.icon} size={17}/></span>{item.label}</a>;
      })}{isPlatformAdmin && <a href="/admin" className={`nav-link ${path.startsWith("/admin") ? "active" : ""}`} aria-current={path.startsWith("/admin") ? "page" : undefined}><span className="nav-icon"><Icon name="users" size={17}/></span>Administration</a>}</nav>
      <div className="sidebar-bottom">
        <div className="help-card"><span className="metric-icon"><Icon name="spark" size={15}/></span><strong>Gut vorbereitet?</strong><p>Behalte alle Sponsoringleistungen an einem Ort im Blick.</p><Link href="/event-modus">Event-Modus öffnen →</Link></div>
        <Link className="profile" href="/einstellungen?tab=profile" aria-label="Einstellungen und Meine Daten öffnen" title="Meine Daten bearbeiten"><span className="avatar">{userDisplay.initials}</span><div><b title={userDisplay.name}>{userDisplay.name}</b><small title={userDisplay.organization}>{userDisplay.organization}</small></div><span style={{marginLeft:"auto",color:"#8a94a0"}}><Icon name="chevron" size={16}/></span></Link>
      </div>
    </aside>
    <div className="main-area">
      <header className="topbar"><MobileMenu isPlatformAdmin={isPlatformAdmin}/><div className="crumb">Veranstalterbereich <span style={{padding:"0 7px",color:"#c1c7ce"}}>/</span> <b>{path.startsWith("/admin") ? "Administration" : path === "/" ? "Übersicht" : path === "/events" ? "Events" : path.startsWith("/events/") ? "Event" : path === "/aufgaben" ? "Aufgaben" : path.includes("sponsors") ? "Sponsoren" : path.includes("bausteine") ? "Bausteine" : path.includes("einstellungen") ? "Einstellungen" : "Veranstalterbereich"}</b></div><div className="top-actions"><Link className="avatar top-user-avatar" href="/einstellungen?tab=profile" aria-label="Meine Daten öffnen" title="Meine Daten">{userDisplay.initials}</Link><LogoutButton/></div></header>
      {children}
      <footer className="app-footer"><span>© {new Date().getFullYear()} sponso</span><nav aria-label="Rechtliche Hinweise"><Link href="/agb">AGB</Link><Link href="/impressum">Impressum</Link><Link href="/datenschutz">Datenschutz</Link><Link href="/kontakt">Kontakt</Link></nav></footer>
    </div>
    <Link className="event-mode-fab" href="/event-modus"><Icon name="camera" size={17}/> Nachweis-Modus</Link>
  </div>;
}
