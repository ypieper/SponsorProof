"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Icon, SponsoLogo } from "@/components/ui";
import { MobileMenu, adminNavigation, navigation } from "@/components/mobile-menu";
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
  const [isSalesPartner, setIsSalesPartner] = useState(false);
  const adminNavigationOnly = isPlatformAdmin || path.startsWith("/admin");

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

    if (!path.startsWith("/login")) loadOrganization();
    loadUser();
    if (isSupabaseConfigured) {
      void fetch("/api/admin/access").then((response) => response.ok ? response.json() : null)
        .then((result) => { if (active) setIsPlatformAdmin(Boolean(result?.isAdmin)); })
        .catch(() => undefined);
      void fetch("/api/partner", { cache: "no-store" }).then((response) => { if (active) setIsSalesPartner(response.ok); }).catch(() => undefined);
    }
    window.addEventListener("sponsorproof:organizer-settings-updated", loadOrganization);
    window.addEventListener("sponsorproof:user-account-updated", loadUser);

    return () => {
      active = false;
      window.removeEventListener("sponsorproof:organizer-settings-updated", loadOrganization);
      window.removeEventListener("sponsorproof:user-account-updated", loadUser);
    };
  }, [path]);

  useEffect(() => {
    const title = path === "/" ? "Sponsoringmanagement für Veranstalter"
      : path === "/dashboard" ? "Übersicht"
      : path === "/events" ? "Events"
      : path.startsWith("/events/") ? "Eventdetails"
      : path === "/aufgaben" ? "Aufgaben"
      : path === "/bausteine" ? "Vertragsbausteine"
      : path === "/sponsors" ? "Sponsoren"
      : path.startsWith("/sponsors/") ? "Sponsorprofil"
      : path.startsWith("/einstellungen") ? "Einstellungen"
      : path === "/event-modus" ? "Nachweise vor Ort"
      : path.startsWith("/login") ? "Anmelden"
      : path === "/landing" ? "Sponsoringmanagement für Veranstalter"
      : path === "/demo" ? "Produktdemo"
      : path === "/passwort-zuruecksetzen" ? "Passwort zurücksetzen"
      : path === "/agb" ? "Allgemeine Geschäftsbedingungen"
      : path === "/impressum" ? "Impressum"
      : path === "/datenschutz" ? "Datenschutzerklärung"
      : path === "/kontakt" ? "Kontakt"
      : path.startsWith("/team/join") ? "Team beitreten"
      : path === "/onboarding" ? "Zugang einrichten"
      : path === "/admin/users" ? "Benutzer"
      : path === "/admin/organizations" ? "Veranstalterbereiche"
      : path === "/admin/codes" ? "Freischaltcodes"
      : path === "/admin/enterprise" ? "Enterprise"
      : path === "/admin/contacts" ? "Kontaktanfragen"
      : path === "/admin/partners" ? "Vertriebspartner"
      : path === "/admin/commissions" ? "Provisionen"
      : path === "/admin/commission-rules" ? "Provisionsregeln"
      : path.startsWith("/admin") ? "Administration"
      : "Sponsoring verwalten";
    document.title = `${title} | sponso`;
  }, [path]);

  if (path.startsWith("/login") || path === "/admin/login" || path === "/onboarding" || path === "/partner" || path === "/sponsor" || path.startsWith("/sponsor/")) return <>{children}</>;
  if (["/", "/demo", "/agb", "/impressum", "/datenschutz", "/kontakt", "/landing"].includes(path)) return <>{children}</>;
  const isMobileMode = path === "/event-modus";
  if (isMobileMode) return <>{children}</>;
  return <div className="app-frame">
    <aside className="sidebar">
      <Link href={adminNavigationOnly ? "/admin/users" : "/dashboard"} className="brand" aria-label={adminNavigationOnly ? "sponso Administration" : "sponso Übersicht öffnen"}><SponsoLogo /></Link>
      <div className="nav-label">{adminNavigationOnly ? "Plattform" : "Veranstalterbereich"}</div>
      <nav className="nav-list">{adminNavigationOnly ? adminNavigation.map((item) => {
        const active = path === item.href || (item.href !== "/admin/users" && path.startsWith(`${item.href}/`));
        return <Link href={item.href} key={item.label} className={`nav-link ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}><span className="nav-icon"><Icon name={item.icon} size={17}/></span>{item.label}</Link>;
      }) : [...navigation, ...(isSalesPartner ? [{ label: "Vertriebspartner", href: "/partner", icon: "spark" }] : [])].map((item) => {
        const route = item.href.split("?")[0];
        const active = path === route || (route !== "/" && path.startsWith(`${route}/`));
        return <Link href={item.href} key={item.label} className={`nav-link ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}><span className="nav-icon"><Icon name={item.icon} size={17}/></span>{item.label}</Link>;
      })}</nav>
      {!adminNavigationOnly && <div className="sidebar-bottom">
        <nav className="sidebar-legal-links" aria-label="Kontakt"><Link href="/kontakt">Kontakt</Link></nav>
        <Link className="profile" href="/einstellungen?tab=profile" aria-label="Einstellungen und Meine Daten öffnen" title="Meine Daten bearbeiten"><span className="avatar">{userDisplay.initials}</span><div><b title={userDisplay.name}>{userDisplay.name}</b><small title={userDisplay.organization}>{userDisplay.organization}</small></div><span style={{marginLeft:"auto",color:"#8a94a0"}}><Icon name="chevron" size={16}/></span></Link>
      </div>}
    </aside>
    <div className={`main-area ${path === "/dashboard" ? "dashboard-main-area" : ""}`}>
      <header className="topbar"><MobileMenu isPlatformAdmin={adminNavigationOnly} isSalesPartner={isSalesPartner}/><div className="crumb">{adminNavigationOnly ? "Plattform" : "Veranstalterbereich"} <span style={{padding:"0 7px",color:"#c1c7ce"}}>/</span> <b>{path.startsWith("/admin") ? (adminNavigation.find((item) => item.href === path)?.label ?? "Benutzer") : path === "/dashboard" ? "Übersicht" : path === "/events" ? "Events" : path.startsWith("/events/") ? "Event" : path === "/aufgaben" ? "Aufgaben" : path.includes("sponsors") ? "Sponsoren" : path.includes("bausteine") ? "Vertragsbausteine" : path.includes("einstellungen") ? "Einstellungen" : "Veranstalterbereich"}</b></div><div className="top-actions">{!adminNavigationOnly && <><Link className="top-event-mode-link" href="/event-modus" aria-label="Event-Modus öffnen" title="Event-Modus öffnen"><Icon name="camera" size={15}/><span>Event-Modus öffnen</span></Link><Link className="avatar top-user-avatar" href="/einstellungen?tab=profile" aria-label="Meine Daten öffnen" title="Meine Daten">{userDisplay.initials}</Link></>}<LogoutButton/></div></header>
      {children}
      <footer className="app-footer"><span>© {new Date().getFullYear()} sponso</span><nav aria-label="Rechtliche Hinweise">{adminNavigationOnly && <><Link href="/agb">AGB</Link><Link href="/impressum">Impressum</Link><Link href="/datenschutz">Datenschutz</Link></>}<Link href="/kontakt">Kontakt</Link></nav></footer>
    </div>
  </div>;
}
