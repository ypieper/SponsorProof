"use client";

import { useEffect, useMemo, useState } from "react";
import type { StoredEvent } from "@/lib/events-storage";
import type { SponsorRecord } from "@/lib/sponsors-storage";
import { fetchEventMetrics, type EventMetricValues } from "@/lib/event-metrics";
import { Icon } from "@/components/ui";

type TimelineStep = { title: string; detail: string; complete: boolean };

function formatDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(date);
}

export function EventTimeline({ event, sponsors }: { event: StoredEvent; sponsors: SponsorRecord[] }) {
  const contracts = useMemo(() => sponsors.flatMap((record) => record.contracts).filter((contract) => contract.eventId === event.id), [event.id, sponsors]);
  const eventSponsors = useMemo(() => sponsors.filter((record) => record.sponsor.eventIds.includes(event.id) || record.contracts.some((contract) => contract.eventId === event.id)), [event.id, sponsors]);
  const [steps, setSteps] = useState<TimelineStep[]>([
    { title: "Event angelegt", detail: formatDate(event.createdAt) || "Erfasst", complete: true },
    { title: "Sponsoren hinzugefügt", detail: "Wird geladen …", complete: false },
    { title: "Verträge erstellt", detail: "Wird geladen …", complete: false },
    { title: "Verträge unterschrieben", detail: "Wird geladen …", complete: false },
    { title: "Alle Nachweise erbracht", detail: "Wird geladen …", complete: false },
    { title: "Abschlussreport erstellt und versendet", detail: "Wird geladen …", complete: false },
  ]);
  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const metrics = (await fetchEventMetrics([event.id]))[event.id] as EventMetricValues;
        const totalContracts = contracts.length;
        const totalSponsors = eventSponsors.length;
        const reportsComplete = totalContracts > 0 && metrics.reportsCreated === totalContracts && metrics.reportsSent === totalContracts;
        const next: TimelineStep[] = [
          { title: "Event angelegt", detail: formatDate(event.createdAt) || "Erfasst", complete: true },
          { title: "Sponsoren hinzugefügt", detail: totalSponsors ? `${totalSponsors} ${totalSponsors === 1 ? "Sponsor hinzugefügt" : "Sponsoren hinzugefügt"}` : "Noch keine Sponsoren hinzugefügt", complete: totalSponsors > 0 },
          { title: "Verträge erstellt", detail: `${metrics.contractsCreated} von ${totalContracts} Verträgen`, complete: totalContracts > 0 && metrics.contractsCreated === totalContracts },
          { title: "Verträge unterschrieben", detail: `${metrics.contractsSigned} von ${totalSponsors} gezeichnete Vereinbarungen hochgeladen`, complete: totalSponsors > 0 && metrics.contractsSigned === totalSponsors },
          { title: "Alle Nachweise erbracht", detail: metrics.evidenceTasks ? `${metrics.completedEvidenceTasks} von ${metrics.evidenceTasks} Nachweisen` : "Noch keine Aufgaben oder Leistungen", complete: metrics.evidenceTasks > 0 && metrics.completedEvidenceTasks === metrics.evidenceTasks },
          { title: "Abschlussreport erstellt und versendet", detail: reportsComplete ? "Abgeschlossen" : `${metrics.reportsCreated} von ${totalContracts} erstellt · ${metrics.reportsSent} von ${totalContracts} versendet`, complete: reportsComplete },
        ];
        if (!cancelled) setSteps(next);
      } catch {
        if (!cancelled) setSteps((current) => current.map((step, index) => index === 0 ? step : { ...step, detail: "Status nicht verfügbar" }));
      }
    }
    void refresh();
    const refreshOnChange = () => { void refresh(); };
    window.addEventListener("sponso:event-timeline-updated", refreshOnChange);
    window.addEventListener("sponsorproof:event-sponsors-updated", refreshOnChange);
    return () => {
      cancelled = true;
      window.removeEventListener("sponso:event-timeline-updated", refreshOnChange);
      window.removeEventListener("sponsorproof:event-sponsors-updated", refreshOnChange);
    };
  }, [contracts, event.createdAt, event.id, eventSponsors]);
  const activeIndex = steps.findIndex((step) => !step.complete);
  const completedPrefixLength = activeIndex === -1 ? steps.length : activeIndex;
  const completedPrefix = steps.slice(0, completedPrefixLength);
  const visibleSteps = steps.slice(completedPrefixLength);
  return <section className="event-timeline" aria-label="Event-Meilensteine"><div className="event-timeline-scroll"><ol className={`event-timeline-steps ${completedPrefix.length ? "event-timeline-steps-condensed" : ""}`}>
    {completedPrefix.length > 0 && <li className="event-timeline-step complete event-timeline-completed-group">
      <details>
        <summary><span className="event-timeline-node"><Icon name="check" size={11}/></span><b>{completedPrefix.length} {completedPrefix.length === 1 ? "Schritt" : "Schritte"} abgeschlossen</b><small>Details anzeigen</small></summary>
        <ol className="event-timeline-completed-list">{completedPrefix.map((step) => <li key={step.title}><b>{step.title}</b><span>{step.detail}</span></li>)}</ol>
      </details>
    </li>}
    {visibleSteps.map((step, index) => {
      const absoluteIndex = completedPrefixLength + index;
      const isActive = absoluteIndex === activeIndex;
      return <li className={`event-timeline-step ${step.complete ? "complete" : isActive ? "active" : "upcoming"}`} key={step.title}><span className="event-timeline-node">{step.complete ? <Icon name="check" size={13}/> : <span/>}</span><b>{step.title}</b><small>{step.detail}</small></li>;
    })}
  </ol></div></section>;
}
