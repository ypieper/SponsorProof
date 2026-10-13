"use client";

import { useEffect, useState } from "react";
import { Metric } from "@/components/ui";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { fetchStoredEventsFromDatabase, readStoredEvents } from "@/lib/events-storage";
import { useEventMetrics } from "@/lib/event-metrics";

export function DashboardMetrics() {
  const [eventIds, setEventIds] = useState<string[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const metrics = useEventMetrics(eventIds);

  useEffect(() => {
    async function loadEvents() {
      try {
        const { data, error } = isSupabaseConfigured ? await fetchStoredEventsFromDatabase() : { data: readStoredEvents(), error: null };
        const deleted = JSON.parse(localStorage.getItem("sponsorproof.deleted-events.v1") ?? "[]") as unknown;
        const deletedIds = Array.isArray(deleted) ? deleted.filter((id): id is string => typeof id === "string") : [];
        setEventIds((error || !data ? readStoredEvents() : data).filter((event) => !deletedIds.includes(event.id)).map((event) => event.id));
      } catch {
        setEventIds(readStoredEvents().map((event) => event.id));
      } finally {
        setEventsLoading(false);
      }
    }
    void loadEvents();
  }, []);

  const { aggregate, loading, error } = metrics;
  const unavailable = eventsLoading || loading || error;
  const amount = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(aggregate.sponsorship);
  const fulfilled = aggregate.benefits ? `${Math.round(aggregate.completed / aggregate.benefits * 100)} %` : "0 %";

  return <section className="metric-grid">
    <Metric label="Sponsoringvolumen netto" value={unavailable ? "—" : amount} icon="spark"/>
    <Metric label="Sponsoren" value={unavailable ? "—" : String(aggregate.sponsors)} icon="users"/>
    <Metric label="Leistungen" value={unavailable ? "—" : String(aggregate.benefits)} icon="check"/>
    <Metric label="Erledigt" value={unavailable ? "—" : fulfilled} icon="layers"/>
  </section>;
}
