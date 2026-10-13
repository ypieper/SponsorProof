"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { EventOverviewDetails } from "@/components/event-overview-details";
import { readStoredEvents, type StoredEvent } from "@/lib/events-storage";
import { Icon, Metric, PageHeading } from "@/components/ui";

export function CustomEventPage({ eventId }: { eventId: string }) {
  const [event, setEvent] = useState<StoredEvent | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setEvent(readStoredEvents().find((item) => item.id === eventId) ?? null);
    setLoaded(true);
  }, [eventId]);

  if (!loaded) return <main className="content" aria-busy="true"><p className="subtitle">Event wird geladen …</p></main>;
  if (!event) return <main className="content"><PageHeading eyebrow="EVENT" title="Event nicht gefunden" subtitle="Dieses Event ist in diesem Browser nicht gespeichert." action={<Link className="btn" href="/events"><Icon name="chevron" size={14}/> Zur Eventübersicht</Link>} /></main>;

  return <main className="content">
    <PageHeading eyebrow="EVENT · IN VORBEREITUNG" title={event.title} subtitle="Stammdaten und Veranstaltungsdetails." action={<Link className="btn" href="/events"><Icon name="chevron" size={14}/> Alle Events</Link>} />
    <section className="metric-grid"><Metric label="Sponsoringvolumen" value="0 €" icon="spark"/><Metric label="Sponsoren" value="0" icon="users"/><Metric label="Leistungen" value="0" icon="check"/><Metric label="Erledigt" value="0 %" note="0 von 0" icon="layers"/></section>
    <EventOverviewDetails eventId={event.id} initialDetails={{ startDate: event.startDate, endDate: event.endDate, location: event.location, responsible: event.responsible }} />
  </main>;
}
