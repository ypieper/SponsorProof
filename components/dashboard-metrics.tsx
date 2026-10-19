"use client";

import { useEffect, useState } from "react";
import { Icon, Progress } from "@/components/ui";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { fetchStoredEventsFromDatabase } from "@/lib/events-storage";
import { useEventMetrics } from "@/lib/event-metrics";

export type DashboardTaskSummary = { open: number; overdue: number; error?: boolean };

export function DashboardMetrics({ taskSummary }: { taskSummary: DashboardTaskSummary | null }) {
  const [eventIds, setEventIds] = useState<string[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError, setEventsError] = useState(false);
  const metrics = useEventMetrics(eventIds);

  useEffect(() => {
    let active = true;
    async function loadEvents() {
      try {
        const { data, error } = isSupabaseConfigured ? await fetchStoredEventsFromDatabase() : { data: [], error: null };
        if (!active) return;
        setEventsError(Boolean(error));
        setEventIds(error || !data ? [] : data.map((event) => event.id));
      } catch {
        if (active) {
          setEventsError(true);
          setEventIds([]);
        }
      } finally {
        if (active) setEventsLoading(false);
      }
    }
    void loadEvents();
    return () => { active = false; };
  }, []);

  const { aggregate, loading, error } = metrics;
  const unavailable = eventsLoading || loading || error || eventsError;
  const amount = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(aggregate.signedSponsorship);
  const completion = aggregate.trackedBenefits ? Math.round(aggregate.completed / aggregate.trackedBenefits * 100) : 0;

  return <>
    <section className="dashboard-kpi-grid" aria-label="Sponsoring-Kennzahlen">
      <article className="dashboard-kpi-card"><div className="dashboard-kpi-label"><span>Gezeichnetes Sponsoringvolumen</span><span className="metric-icon"><Icon name="spark" size={15}/></span></div><strong>{unavailable ? "—" : amount}</strong><small>{unavailable ? "Wird geladen" : "aus unterschriebenen Verträgen"}</small></article>
      <article className="dashboard-kpi-card"><div className="dashboard-kpi-label"><span>Eigene offene Aufgaben</span><span className="metric-icon"><Icon name="clock" size={15}/></span></div><strong>{taskSummary && !taskSummary.error ? taskSummary.open : "—"}</strong><small>{taskSummary?.error ? "Aufgaben nicht verfügbar" : taskSummary ? `${taskSummary.overdue} überfällig` : "Wird geladen"}</small></article>
      <article className="dashboard-kpi-card"><div className="dashboard-kpi-label"><span>Leistungen erfüllt</span><span className="metric-icon"><Icon name="check" size={15}/></span></div><strong>{unavailable ? "—" : `${aggregate.completed} von ${aggregate.trackedBenefits}`}</strong><small>{unavailable ? "Wird geladen" : "nachweispflichtige Leistungen"}</small><Progress value={unavailable ? 0 : completion}/></article>
      <article className="dashboard-kpi-card"><div className="dashboard-kpi-label"><span>Verträge unterschrieben</span><span className="metric-icon"><Icon name="file" size={15}/></span></div><strong>{unavailable ? "—" : `${aggregate.contractsSigned} von ${aggregate.contracts}`}</strong><small>{unavailable ? "Wird geladen" : `${Math.max(aggregate.contracts - aggregate.contractsSigned, 0)} noch offen`}</small></article>
    </section>
    {(error || eventsError) && <p className="dashboard-data-error" role="status">Einige Kennzahlen konnten gerade nicht geladen werden.</p>}
  </>;
}
