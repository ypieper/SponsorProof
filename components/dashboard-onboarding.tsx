"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui";
import { fetchStoredEventsFromDatabase, type StoredEvent } from "@/lib/events-storage";
import { fetchSponsorRecords, type SponsorRecord } from "@/lib/sponsors-storage";
import { fetchStoredBenefits } from "@/lib/benefits-storage";
import { fetchStoredEvidence } from "@/lib/evidence-storage";
import { isSupabaseConfigured } from "@/lib/supabase/config";

type OnboardingState = { events: StoredEvent[]; sponsors: SponsorRecord[]; benefits: Awaited<ReturnType<typeof fetchStoredBenefits>>["data"]; evidence: Awaited<ReturnType<typeof fetchStoredEvidence>>["data"] };

export function DashboardOnboarding() {
  const [state, setState] = useState<OnboardingState | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!isSupabaseConfigured) return;
      const [eventsResult, sponsorsResult, benefitsResult, evidenceResult] = await Promise.all([
        fetchStoredEventsFromDatabase(), fetchSponsorRecords(), fetchStoredBenefits(), fetchStoredEvidence(),
      ]);
      if (!active || eventsResult.error || sponsorsResult.error || benefitsResult.error || evidenceResult.error) return;
      setState({ events: eventsResult.data ?? [], sponsors: sponsorsResult.data ?? [], benefits: benefitsResult.data ?? [], evidence: evidenceResult.data ?? [] });
    }
    void load().catch(() => undefined);
    return () => { active = false; };
  }, []);

  if (!state) return null;
  const event = [...state.events].sort((a, b) => (a.startDate || a.createdAt).localeCompare(b.startDate || b.createdAt))[0];
  const linkedSponsor = event ? state.sponsors.find((record) => record.sponsor.eventIds.includes(event.id)) : undefined;
  const contract = linkedSponsor?.contracts.find((item) => item.eventId === event?.id);
  const benefits = event ? (state.benefits ?? []).filter((item) => item.eventId === event.id) : [];
  const evidence = event ? (state.evidence ?? []).filter((item) => item.eventId === event.id) : [];
  const steps = [
    { label: "Event anlegen", done: Boolean(event), href: "/events", detail: "Lege die Veranstaltung mit Zeitraum und Ort an." },
    { label: "Sponsor zuordnen", done: Boolean(linkedSponsor), href: event ? `/events/${event.id}?tab=sponsoren` : "/events", detail: "Wähle einen Sponsor aus deiner Bibliothek oder lege einen neuen an." },
    { label: "Vereinbarung erfassen", done: Boolean(contract), href: event && linkedSponsor ? `/events/${event.id}?tab=sponsoren&sponsor=${linkedSponsor.sponsor.id}` : event ? `/events/${event.id}?tab=sponsoren` : "/events", detail: "Hinterlege den Vertragswert und erstelle den Vertrag." },
    { label: "Leistung vereinbaren", done: benefits.length > 0, href: event && linkedSponsor ? `/events/${event.id}?tab=sponsoren&sponsor=${linkedSponsor.sponsor.id}` : event ? `/events/${event.id}?tab=sponsoren` : "/events", detail: "Wähle die passenden Leistungsbausteine für den Sponsor." },
    { label: "Ersten Nachweis dokumentieren", done: evidence.length > 0, href: event ? `/event-modus?tab=nachweise&event=${event.id}` : "/events", detail: "Halte die erbrachte Leistung mit einem Foto oder einer Datei fest." },
  ];
  if (steps.every((step) => step.done)) return null;
  const nextIndex = steps.findIndex((step) => !step.done);

  return <section className="panel dashboard-onboarding" aria-labelledby="onboarding-title">
    <div className="dashboard-onboarding-intro"><span className="dashboard-onboarding-icon"><Icon name="spark" size={18}/></span><div><span className="eyebrow">SCHNELLSTART</span><h2 id="onboarding-title">Richte dein erstes Sponsoring ein</h2><p>In wenigen Schritten vom Event bis zum fertigen Nachweis. Dein Fortschritt wird automatisch gespeichert.</p></div></div>
    <ol className="dashboard-onboarding-steps">{steps.map((step, index) => <li className={`dashboard-onboarding-step ${step.done ? "is-done" : index === nextIndex ? "is-next" : ""}`} key={step.label}>
      <span className="dashboard-onboarding-step-icon">{step.done ? <Icon name="check" size={14}/> : <span>{index + 1}</span>}</span>
      <div className="dashboard-onboarding-step-copy"><strong>{step.label}</strong><small>{step.detail}</small></div>
      {index === nextIndex && <Link href={step.href} className="btn btn-primary">Weiter <Icon name="arrow" size={14}/></Link>}
    </li>)}</ol>
  </section>;
}
