"use client";

import { benefitWorkflowCount, getBenefitStatus } from "@/lib/benefit-workflow";
import { EventBenefitRow } from "./events/benefit-row";
import { SponsorGroup } from "@/components/sponsor-group";
import { EmptyState, Progress } from "@/components/ui";
import { fetchStoredBenefits, type StoredBenefit } from "@/lib/benefits-storage";
import { fetchSponsorRecordsForEvent } from "@/lib/sponsors-storage";
import { fetchStoredTasks, type StoredTaskRecord } from "@/lib/tasks-storage";
import { useEffect, useMemo, useState } from "react";

type SponsorBenefits = { id: string; name: string; benefits: StoredBenefit[] };

export function EventBenefitsOverview({ eventId }: { eventId: string }) {
  const [benefits, setBenefits] = useState<StoredBenefit[]>([]);
  const [tasks, setTasks] = useState<StoredTaskRecord[]>([]);
  const [sponsors, setSponsors] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedSponsor, setSelectedSponsor] = useState("all");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const [benefitResult, taskResult, sponsorResult] = await Promise.all([
        fetchStoredBenefits(eventId), fetchStoredTasks(eventId), fetchSponsorRecordsForEvent(eventId),
      ]);
      if (!active) return;
      if (benefitResult.error || taskResult.error || sponsorResult.error) setError(true);
      else {
        setBenefits(benefitResult.data ?? []);
        setTasks((taskResult.data ?? []).filter((task) => task.source === "Leistung" && task.benefit_id));
        setSponsors((sponsorResult.data ?? []).map((record) => ({ id: record.sponsor.id, name: record.sponsor.name })));
      }
      setReady(true);
    };
    void load();
    window.addEventListener("sponso:event-timeline-updated", load);
    window.addEventListener("sponsorproof:event-sponsors-updated", load);
    return () => {
      active = false;
      window.removeEventListener("sponso:event-timeline-updated", load);
      window.removeEventListener("sponsorproof:event-sponsors-updated", load);
    };
  }, [eventId]);

  const sponsorGroups = useMemo<SponsorBenefits[]>(() => sponsors.map((sponsor) => ({
    ...sponsor,
    benefits: benefits.filter((benefit) => benefit.sponsorId === sponsor.id),
  })).filter((group) => group.benefits.length), [benefits, sponsors]);
  const tasksByBenefit = useMemo(() => {
    const benefitById = new Map(benefits.map((benefit) => [benefit.id, benefit]));
    const grouped = new Map<string, StoredTaskRecord[]>();
    for (const task of tasks) {
      const benefit = benefitById.get(task.benefit_id ?? "");
      if (!task.benefit_id || (benefit && task.workflow_instance > benefitWorkflowCount(benefit.quantity, benefit.tasksPerUnit))) continue;
      const group = grouped.get(task.benefit_id) ?? [];
      group.push(task);
      grouped.set(task.benefit_id, group);
    }
    return grouped;
  }, [benefits, tasks]);
  const visibleSponsorGroups = selectedSponsor === "all" ? sponsorGroups : sponsorGroups.filter((group) => group.id === selectedSponsor);

  if (!ready) return <section className="panel event-benefits-overview" aria-busy="true"><p className="subtitle">Leistungen werden geladen …</p></section>;
  if (error) return <EmptyState title="Leistungen konnten nicht geladen werden" description="Bitte lade die Ansicht erneut." />;
  if (!sponsorGroups.length) return <section className="panel event-benefits-overview"><EmptyState title="Noch keine Leistungen" description="Vereinbarte Leistungen erscheinen hier nach Sponsor gruppiert." /></section>;

  return <section className="panel event-benefits-overview">
    <div className="table-head"><div><h2>Leistungen nach Sponsor</h2><p className="subtitle">Fortschritt und Aufgabenstand der vereinbarten Leistungen.</p></div><label className="event-benefit-sponsor-filter"><span>Sponsor</span><select aria-label="Leistungen nach Sponsor filtern" value={selectedSponsor} onChange={(event) => setSelectedSponsor(event.target.value)}><option value="all">Alle Sponsoren</option>{sponsorGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label></div>
    <div className="event-benefit-sponsor-groups">{visibleSponsorGroups.map((group) => {
      const tracked = group.benefits.filter((benefit) => benefit.completionRequired !== false);
      const completed = tracked.filter((benefit) => getBenefitStatus(benefit, tasksByBenefit.get(benefit.id) ?? []) === "Erledigt").length;
      const progress = tracked.length ? Math.round(completed / tracked.length * 100) : 0;
      return <SponsorGroup key={group.id} name={group.name} itemCount={group.benefits.length} itemLabel="Leistung" itemLabelPlural="Leistungen" contentClassName="event-benefit-table-content" headerAside={<div className="event-benefit-sponsor-progress"><span>{tracked.length ? `${completed} von ${tracked.length} aufgabenrelevanten Leistungen erledigt` : "Keine aufgabenrelevanten Leistungen"}</span>{tracked.length > 0 && <Progress value={progress}/>}</div>}>
        <div className="adaptive-table-wrap event-benefits-table-wrap"><table className="table adaptive-data-table event-benefits-data-table"><thead><tr><th>Leistung</th><th>Nächster Schritt</th><th>Fortschritt</th><th>Status</th></tr></thead><tbody>{group.benefits.map((benefit) => <EventBenefitRow key={benefit.id} benefit={benefit} tasks={tasksByBenefit.get(benefit.id) ?? []}/>)}</tbody></table></div>
      </SponsorGroup>;
    })}</div>
  </section>;
}
