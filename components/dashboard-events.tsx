"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchStoredEventsFromDatabase, formatEventDateRange, type StoredEvent } from "@/lib/events-storage";
import { EmptyState, Icon, Status } from "@/components/ui";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { eventLifecycleStage, useEventMetrics } from "@/lib/event-metrics";

function compactEventStatus(label: string) {
  if (label === "Event angelegt") return "Vorbereitung";
  if (label === "Alle Verträge erstellt") return "Verträge erstellt";
  if (label === "Alle Verträge unterschrieben") return "Unterschrieben";
  if (label === "Alle Nachweise erbracht") return "Nachweise erbracht";
  return label;
}

export function DashboardEvents() {
  const [createdEvents, setCreatedEvents] = useState<StoredEvent[]>([]);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    async function loadEvents() {
      setReady(false);
      setLoadError(false);
      try {
        if (isSupabaseConfigured) {
          const { data, error } = await fetchStoredEventsFromDatabase();
          if (error) throw error;
          setCreatedEvents(data ?? []);
        } else setCreatedEvents([]);
      } catch {
        setCreatedEvents([]);
        setLoadError(true);
      } finally {
        setReady(true);
      }
    }
    void loadEvents();
  }, [retryKey]);

  const visibleEvents = createdEvents;
  const eventMetrics = useEventMetrics(visibleEvents.map((event) => event.id));
  const featuredEvents = visibleEvents.map((event) => {
    const metrics = eventMetrics.byEvent[event.id];
    const status = metrics ? eventLifecycleStage(metrics) : null;
    return ({
      id: event.id,
      title: event.title,
      date: formatEventDateRange(event.startDate, event.endDate),
      location: event.location,
      status: status ? { label: compactEventStatus(status.label), color: status.color } : null,
    });
  });

  return <>
    <div className="dashboard-event-list">
      {featuredEvents.map((event) => <Link href={`/events/${event.id}`} className="dashboard-event-row" key={event.id}>
        <div className="dashboard-event-primary"><h3>{event.title}</h3><span className="dashboard-event-meta"><span>{event.date}</span><span aria-hidden="true">·</span><Icon name="pin" size={12}/><span>{event.location || "Ort nicht angegeben"}</span></span></div>
        <div className="dashboard-event-status"><small>Status</small>{event.status ? <Status value={event.status.label} tone={event.status.color === "green" ? "done" : event.status.color === "yellow" ? "progress" : "waiting"}/> : <span className="dashboard-event-status-loading">{eventMetrics.error ? "Nicht verfügbar" : "Lädt …"}</span>}</div>
        <span className="dashboard-event-open">Öffnen <Icon name="arrow" size={13}/></span>
      </Link>)}
      {ready && loadError && <EmptyState title="Events gerade nicht verfügbar" description="Die Veranstaltungen konnten nicht geladen werden." action={<button className="btn" type="button" onClick={() => setRetryKey((key) => key + 1)}>Erneut laden</button>} />}
      {ready && !loadError && featuredEvents.length === 0 && <EmptyState title="Noch keine Events" description="Lege ein Event an, um Sponsoren und Leistungen zu verwalten." action={<Link className="btn btn-primary" href="/events"><Icon name="plus" size={14}/> Event erstellen</Link>} />}
    </div>
  </>;
}
