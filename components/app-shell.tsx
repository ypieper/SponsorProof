"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Icon } from "@/components/ui";
import { MobileMenu, navigation } from "@/components/mobile-menu";

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const isMobileMode = path === "/event-modus";
  if (isMobileMode) return <>{children}</>;
  return <div className="app-frame">
    <aside className="sidebar">
      <Link href="/" className="brand"><span className="brand-mark"><Icon name="check" size={19}/></span><span>SponsorProof</span></Link>
      <div className="nav-label">Workspace</div>
      <nav className="nav-list">{navigation.map((item) => {
        const route = item.href.split("?")[0];
        const active = path === route || (route !== "/" && path.startsWith(`${route}/`));
        return <Link href={item.href} key={item.label} className={`nav-link ${active ? "active" : ""}`}><span className="nav-icon"><Icon name={item.icon} size={17}/></span>{item.label}</Link>;
      })}</nav>
      <div className="sidebar-bottom">
        <div className="help-card"><span className="metric-icon"><Icon name="spark" size={15}/></span><strong>Gut vorbereitet?</strong><p>Behalte alle Sponsoringleistungen an einem Ort im Blick.</p><Link href="/event-modus">Event-Modus öffnen →</Link></div>
        <div className="profile"><span className="avatar">MK</span><div><b>Maria Krüger</b><small>Stadtlicht Events</small></div><span style={{marginLeft:"auto",color:"#8a94a0"}}><Icon name="chevron" size={16}/></span></div>
      </div>
    </aside>
    <div className="main-area">
      <header className="topbar"><MobileMenu/><div className="crumb">Workspace <span style={{padding:"0 7px",color:"#c1c7ce"}}>/</span> <b>{path === "/" ? "Übersicht" : path === "/events" ? "Events" : path.startsWith("/events/") ? "Event" : path === "/aufgaben" ? "Aufgaben" : path.includes("sponsors") ? "Sponsoren" : path.includes("bausteine") ? "Bausteine" : path.includes("einstellungen") ? "Einstellungen" : "Workspace"}</b></div><div className="top-actions"><button className="icon-button" aria-label="Benachrichtigungen"><Icon name="bell" size={16}/></button><span className="avatar">MK</span></div></header>
      {children}
    </div>
  </div>;
}
