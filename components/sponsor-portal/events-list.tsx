"use client";

import type { PortalEventSummary } from "@/lib/sponsor-portal/types";
import Link from "next/link";

export function SponsorEventsList({ events, ongoingCount, completedCount, selectedTab, onSelectTab }: { events: PortalEventSummary[]; ongoingCount: number; completedCount: number; selectedTab: "ongoing" | "completed"; onSelectTab: (tab: "ongoing" | "completed") => void }) {
  return <>
    <div className="sponsor-portal-event-list-tabs" id="sponsor-events" role="tablist" aria-label="Events nach Status">
      <button type="button" role="tab" id="sponsor-events-ongoing-tab" aria-selected={selectedTab === "ongoing"} aria-controls="sponsor-events-panel" className={selectedTab === "ongoing" ? "active" : ""} onClick={() => onSelectTab("ongoing")}>Laufende Events<span>{ongoingCount}</span></button>
      <button type="button" role="tab" id="sponsor-events-completed-tab" aria-selected={selectedTab === "completed"} aria-controls="sponsor-events-panel" className={selectedTab === "completed" ? "active" : ""} onClick={() => onSelectTab("completed")}>Abgeschlossene Events<span>{completedCount}</span></button>
    </div>
    {events.length ? <div className="sponsor-portal-event-list" id="sponsor-events-panel" role="tabpanel" aria-labelledby={selectedTab === "ongoing" ? "sponsor-events-ongoing-tab" : "sponsor-events-completed-tab"}>{events.map((event) => <Link className="sponsor-portal-event-card" href={`/sponsor/events/${event.id}`} key={event.id}>
      {event.organizer_logo_url ? <img className="sponsor-portal-event-card-logo" src={event.organizer_logo_url} alt={`Logo ${event.title}`} /> : <span className="sponsor-portal-event-card-logo sponsor-portal-event-card-logo-placeholder" aria-hidden="true">{event.title.slice(0, 1).toLocaleUpperCase("de-DE")}</span>}
      <span className="sponsor-portal-event-card-copy"><b>{event.title}</b><small>{[event.start_date && new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(new Date(`${event.start_date}T00:00:00`)), event.location].filter(Boolean).join(" · ") || "Event"}</small></span>
      <span className="sponsor-portal-event-card-stats" aria-label="Eventübersicht"><span className="sponsor-portal-benefit-count-badge"><b>{event.benefit_count}</b><small>Leistungen</small></span></span>
      <span className="sponsor-portal-event-card-arrow" aria-hidden="true">→</span>
    </Link>)}</div> : <section className="panel sponsor-portal-empty sponsor-portal-event-empty" id="sponsor-events-panel" role="tabpanel" aria-labelledby={selectedTab === "ongoing" ? "sponsor-events-ongoing-tab" : "sponsor-events-completed-tab"}><p>{selectedTab === "ongoing" ? "Zurzeit gibt es keine laufenden Events." : "Es gibt noch keine abgeschlossenen Events."}</p></section>}
  </>;
}
