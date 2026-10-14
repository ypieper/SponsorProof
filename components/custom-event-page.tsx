"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { EventOverviewDetails } from "@/components/event-overview-details";
import { EventSponsorsOverview } from "@/components/event-sponsors-overview";
import { EventReports } from "@/components/event-reports";
import { EventSponsorDetail } from "@/components/event-sponsor-detail";
import { TasksOverview } from "@/components/tasks-overview";
import { EventTimeline } from "@/components/event-timeline";
import { fetchStoredEventFromDatabase, type StoredEvent } from "@/lib/events-storage";
import { fetchSponsorRecordsForEvent, type SponsorRecord } from "@/lib/sponsors-storage";
import { EmptyState, Icon, Metric, PageHeading, Tabs } from "@/components/ui";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { eventLifecycleStage, useEventMetrics } from "@/lib/event-metrics";
import { useEventEntitlements, type EventEntitlement } from "@/components/event-entitlements";

function mergeSponsorRecords(current: SponsorRecord[], updates: SponsorRecord[]) {
  const records = new Map(updates.map((record) => [record.sponsor.id, record]));
  current.forEach((record) => records.set(record.sponsor.id, record));
  return [...records.values()].sort((a, b) => a.sponsor.name.localeCompare(b.sponsor.name, "de"));
}

export function CustomEventPage({ eventId, selectedTab, selectedSponsorId }: { eventId: string; selectedTab?: string; selectedSponsorId?: string }) {
  const [event, setEvent] = useState<StoredEvent | null>(null);
  const [eventSponsors, setEventSponsors] = useState<SponsorRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const { getEntitlement, loadEntitlement, requestUpgrade } = useEventEntitlements();
  const [entitlement, setEntitlement] = useState<EventEntitlement | null>(null);
  const eventMetrics = useEventMetrics(event ? [event.id] : []);

  useEffect(() => {
    async function loadEvent() {
      if (isSupabaseConfigured) {
        const [{ data, error }, sponsorResult] = await Promise.all([
          fetchStoredEventFromDatabase(eventId),
          fetchSponsorRecordsForEvent(eventId),
        ]);
        setEvent(!error && data ? data : null);
        setEventSponsors((current) => mergeSponsorRecords(current, sponsorResult.data ?? []));
      } else {
        setEvent(null);
        setEventSponsors([]);
      }
      setLoaded(true);
    }
    void loadEvent();
  }, [eventId]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const current = getEntitlement(eventId) ?? await loadEntitlement(eventId);
      if (active) setEntitlement(current);
    };
    void load();
    const refresh = (event: Event) => {
      const detail = (event as CustomEvent<{ eventId?: string }>).detail;
      if (!detail?.eventId || detail.eventId === eventId) void load();
    };
    window.addEventListener("sponso:event-entitlement-updated", refresh);
    return () => { active = false; window.removeEventListener("sponso:event-entitlement-updated", refresh); };
  }, [eventId, getEntitlement, loadEntitlement]);

  useEffect(() => {
    let cancelled = false;
    const refreshSponsors = (event: Event) => {
      const detail = (event as CustomEvent<{ eventId?: string; record?: SponsorRecord }>).detail;
      if (detail?.eventId && detail.eventId !== eventId) return;
      if (detail?.record) {
        setEventSponsors((current) => mergeSponsorRecords(current, [detail.record!]));
        return;
      }
      void fetchSponsorRecordsForEvent(eventId).then(({ data }) => {
        if (!cancelled) setEventSponsors(data ?? []);
      });
    };
    window.addEventListener("sponsorproof:event-sponsors-updated", refreshSponsors);
    return () => {
      cancelled = true;
      window.removeEventListener("sponsorproof:event-sponsors-updated", refreshSponsors);
    };
  }, [eventId]);

  if (!loaded) return <main className="content" aria-busy="true"><p className="subtitle">Event wird geladen …</p></main>;
  if (!event) return <main className="content"><PageHeading eyebrow="EVENT" title="Event nicht gefunden" subtitle="Dieses Event ist nicht gespeichert."/><EmptyState title="Kein Event gefunden" description="Wähle ein vorhandenes Event aus oder lege ein neues an." action={<Link className="btn btn-primary" href="/events"><Icon name="calendar" size={14}/> Zur Eventübersicht</Link>} /></main>;

  const activeTab = selectedTab === "sponsoren" || selectedSponsorId ? "Sponsoren" : selectedTab === "aufgaben-nachweise" ? "Aufgaben & Nachweise" : selectedTab === "reports" ? "Reports" : "Übersicht";
  const selectedSponsorRecord = eventSponsors.find((record) => record.sponsor.id === selectedSponsorId);
  const selectedContract = selectedSponsorRecord?.contracts.find((contract) => contract.eventId === event.id);
  const lifecycleStage = eventLifecycleStage(eventMetrics.byEvent[event.id] ?? { sponsorship: 0, sponsors: 0, benefits: 0, completed: 0, contracts: 0, contractsCreated: 0, contractsSigned: 0, reportsCreated: 0, evidenceTasks: 0, completedEvidenceTasks: 0 });

  return <main className="content">
    <PageHeading eyebrow="EVENT" title={event.title} subtitle="Stammdaten und Veranstaltungsdetails." action={<div className="event-heading-actions"><span className={`event-lifecycle-status event-lifecycle-${lifecycleStage.color}`}>{eventMetrics.loading ? "Status wird geladen …" : lifecycleStage.label}</span><span className={`event-plan-badge event-plan-${entitlement?.plan_code ?? event.planCode}`}>{entitlement?.plan.name ?? (event.planCode === "enterprise" ? "Enterprise" : event.planCode === "event_pro" ? "Event Pro" : event.planCode === "event" ? "Event" : "Free")}</span>{event.planCode !== "enterprise" && <button className="btn" type="button" onClick={() => requestUpgrade(event.id, event.title, `Bis zu ${entitlement?.plan.max_sponsors ?? 2} Sponsoren`)}>{(entitlement?.plan_code ?? event.planCode) === "free" ? "Event freischalten" : "Tarif anzeigen"}</button>}<Link className="btn" href="/events"><Icon name="chevron" size={14}/> Alle Events</Link></div>} />
    <EventTimeline event={event} sponsors={eventSponsors} />
    <Tabs items={[{ label: "Übersicht", href: `/events/${event.id}` }, { label: "Sponsoren", href: `/events/${event.id}?tab=sponsoren` }, { label: "Aufgaben & Nachweise", href: `/events/${event.id}?tab=aufgaben-nachweise` }, { label: "Reports", href: `/events/${event.id}?tab=reports` }]} active={activeTab} />
    {activeTab === "Übersicht" && <><section className="metric-grid"><Metric label="Sponsoringvolumen netto" value={eventMetrics.loading || eventMetrics.error ? "—" : new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(eventMetrics.aggregate.sponsorship)} icon="spark"/><Metric label="Sponsoren" value={eventMetrics.loading || eventMetrics.error ? "—" : String(eventMetrics.aggregate.sponsors)} icon="users"/><Metric label="Leistungen" value={eventMetrics.loading || eventMetrics.error ? "—" : String(eventMetrics.aggregate.benefits)} icon="check"/><Metric label="Erledigt" value={eventMetrics.loading || eventMetrics.error ? "—" : `${eventMetrics.aggregate.benefits ? Math.round(eventMetrics.aggregate.completed / eventMetrics.aggregate.benefits * 100) : 0} %`} note={eventMetrics.loading || eventMetrics.error ? undefined : `${eventMetrics.aggregate.completed} von ${eventMetrics.aggregate.benefits}`} icon="layers"/></section><EventOverviewDetails eventId={event.id} initialDetails={{ title: event.title, startDate: event.startDate, endDate: event.endDate, location: event.location, responsible: event.responsible }} onDetailsSaved={(details) => setEvent((current) => current ? { ...current, ...details } : current)} /></>}
    {activeTab === "Sponsoren" && selectedSponsorRecord && selectedContract ? <EventSponsorDetail eventId={event.id} eventTitle={event.title} eventStartDate={event.startDate} eventEndDate={event.endDate} eventLocation={event.location} eventResponsible={event.responsible} sponsor={selectedSponsorRecord.sponsor} contract={selectedContract} baseBenefits={[]} blocks={[]} /> : activeTab === "Sponsoren" && <EventSponsorsOverview eventId={event.id} eventTitle={event.title} sponsors={[]} contracts={[]} benefits={[]} databaseBacked />}
    {activeTab === "Aufgaben & Nachweise" && <TasksOverview eventFilter={event.id} embedded allowCreate />}
    {activeTab === "Reports" && <EventReports eventId={event.id} eventTitle={event.title} sponsors={eventSponsors.map((record) => record.sponsor)} contracts={eventSponsors.flatMap((record) => record.contracts)} benefits={[]} />}
  </main>;
}
