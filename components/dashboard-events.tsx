"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchStoredEventsFromDatabase, formatEventDateRange, type StoredEvent } from "@/lib/events-storage";
import { EmptyState, Icon, Progress } from "@/components/ui";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { useEventMetrics } from "@/lib/event-metrics";


export function DashboardEvents() {
  const [createdEvents, setCreatedEvents] = useState<StoredEvent[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function loadEvents() {
      try {
        if (isSupabaseConfigured) {
          const { data, error } = await fetchStoredEventsFromDatabase();
          setCreatedEvents(!error && data ? data : []);
        } else setCreatedEvents([]);
      } finally {
        setReady(true);
      }
    }
    void loadEvents();
  }, []);

  const visibleEvents = createdEvents.slice(0, 3);
  const eventMetrics = useEventMetrics(visibleEvents.map((event) => event.id));
  const featuredEvents = visibleEvents.map((event) => {
    const metrics = eventMetrics.byEvent[event.id];
    return ({
      id: event.id,
      title: event.title,
      date: formatEventDateRange(event.startDate, event.endDate),
      location: event.location,
      status: "In Vorbereitung",
      sponsorship: metrics?.sponsorship ?? 0,
      sponsors: metrics?.sponsors ?? 0,
      completed: metrics?.completed ?? 0,
      benefits: metrics?.benefits ?? 0,
      trackedBenefits: metrics?.trackedBenefits ?? 0,
      loading: eventMetrics.loading || eventMetrics.error,
    });
  });

  return <>
    <div className="dashboard-event-list">
      {featuredEvents.map((event) => <Link href={`/events/${event.id}`} className="dashboard-event-row" key={event.id}>
        <div className="dashboard-event-primary"><span className="dashboard-event-date">{event.date}</span><h3>{event.title}</h3><span className="event-location"><Icon name="pin" size={13}/>{event.location}</span></div>
        <div className="dashboard-event-facts"><div className="dashboard-event-fact"><small>Sponsoringvolumen netto</small><b>{event.loading ? "—" : new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(event.sponsorship)}</b></div><div className="dashboard-event-fact"><small>Sponsoren</small><b>{event.loading ? "—" : event.sponsors}</b></div><div className="dashboard-event-fact"><small>Leistungen</small><b>{event.loading ? "—" : event.benefits}</b></div><div className="dashboard-event-fact"><small>Erledigt</small><b>{event.loading ? "—" : `${event.trackedBenefits ? Math.round(event.completed / event.trackedBenefits * 100) : 0} %`}</b></div><div className="dashboard-event-progress"><span>Leistungsfortschritt</span><Progress value={event.trackedBenefits ? Math.round(event.completed / event.trackedBenefits * 100) : 0}/></div></div>
      </Link>)}
      {ready && featuredEvents.length === 0 && <EmptyState title="Noch keine Events" description="Lege ein Event an, um Sponsoren und Leistungen zu verwalten." action={<Link className="btn btn-primary" href="/events"><Icon name="plus" size={14}/> Event erstellen</Link>} />}
    </div>
    <Link className="btn btn-primary dashboard-section-link" href="/events">Alle Events ansehen <Icon name="arrow" size={14}/></Link>
  </>;
}
