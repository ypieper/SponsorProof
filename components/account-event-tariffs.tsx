"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useEventEntitlements } from "@/components/event-entitlements";
import { EmptyState, Icon } from "@/components/ui";
import { eventLifecycleStage, useEventMetrics } from "@/lib/event-metrics";
import { fetchStoredEventsFromDatabase, formatEventDateRange, type StoredEvent } from "@/lib/events-storage";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { eventPlanLabel } from "@/lib/event-plan-labels";
import { eventContractPackageLabel } from "@/lib/event-contract-package-labels";

export function AccountEventTariffs() {
  const { requestUpgrade } = useEventEntitlements();
  const [events, setEvents] = useState<StoredEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const metrics = useEventMetrics(events.map((event) => event.id));

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (!isSupabaseConfigured) throw new Error("Supabase ist nicht eingerichtet.");
      const result = await fetchStoredEventsFromDatabase();
      if (result.error || !result.data) throw result.error ?? new Error("Events konnten nicht geladen werden.");
      setEvents(result.data);
    } catch {
      setError("Events und Tarife konnten nicht geladen werden. Bitte versuche es erneut.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEvents();
    const refresh = () => { void loadEvents(); };
    window.addEventListener("sponso:event-entitlement-updated", refresh);
    return () => window.removeEventListener("sponso:event-entitlement-updated", refresh);
  }, [loadEvents]);

  return <section className="settings-section account-event-tariffs">
    <div className="settings-section-heading"><span className="settings-section-icon"><Icon name="calendar" size={16}/></span><div><h2>Aktive Tarife und Events</h2><p>Tarif und Fortschrittsstatus für alle Events in deinem Veranstalterbereich.</p></div></div>
    {loading ? <p className="task-empty">Events und Tarife werden geladen …</p> : error ? <div className="account-event-tariffs-error"><p role="alert">{error}</p><button className="btn" type="button" onClick={() => void loadEvents()}>Erneut laden</button></div> : events.length === 0 ? <EmptyState title="Noch keine Events" description="Sobald du ein Event anlegst, erscheinen hier sein Tarif und Status."/> : <div className="account-event-tariffs-list">
      {events.map((event) => {
        const stage = eventLifecycleStage(metrics.byEvent[event.id] ?? { sponsorship: 0, sponsors: 0, benefits: 0, trackedBenefits: 0, completed: 0, contracts: 0, contractsCreated: 0, contractsSigned: 0, reportsCreated: 0, reportsSent: 0, evidenceTasks: 0, completedEvidenceTasks: 0 });
        const planName = event.planCode === "enterprise" ? eventPlanLabel("enterprise") : event.contractPackage ? `Paket: ${eventContractPackageLabel(event.contractPackage.maxContracts)}` : eventPlanLabel(event.planCode);
        const canUpgrade = !event.contractPackage && event.planCode !== "enterprise" && event.bookedPlanCode !== "event_pro";
        const stageText = metrics.loading ? "Status wird geladen …" : metrics.error ? "Status nicht verfügbar" : stage.label;
        return <article className="account-event-tariff-row" key={event.id}>
          <div className="account-event-tariff-info"><Link href={`/events/${event.id}`}>{event.title}</Link><span>{formatEventDateRange(event.startDate, event.endDate)}</span></div>
          <div className="account-event-tariff-status"><span className={`event-plan-badge ${event.planCode === "enterprise" ? "event-plan-enterprise" : event.contractPackage ? "event-plan-contract-package" : `event-plan-${event.planCode}`}`}>{planName}</span><span className={event.planCode === "enterprise" || event.contractPackage || event.entitlementStatus === "active" ? "account-event-entitlement-active" : "account-event-entitlement-revoked"}>{event.planCode === "enterprise" || event.contractPackage || event.entitlementStatus === "active" ? "Tarif aktiv" : "Tarif inaktiv"}</span><span className={`event-lifecycle-status event-lifecycle-${stage.color}`}>Event Status: {stageText}</span></div>
          <div className="account-event-tariff-action">{canUpgrade && <button className="btn btn-primary" type="button" onClick={() => requestUpgrade(event.id, event.title)}>{event.bookedPlanCode === "event" ? "Auf Pro upgraden" : "Tarif auswählen"}</button>}</div>
        </article>;
      })}
    </div>}
  </section>;
}
