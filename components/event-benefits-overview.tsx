"use client";

import { useEffect, useMemo, useState } from "react";
import { EmptyState, Progress, Status } from "@/components/ui";
import { fetchStoredBenefits, type StoredBenefit } from "@/lib/benefits-storage";
import { fetchStoredTasks, type StoredTaskRecord } from "@/lib/tasks-storage";
import { fetchSponsorRecordsForEvent } from "@/lib/sponsors-storage";
import { SponsorGroup } from "@/components/sponsor-group";

type SponsorBenefits = { id: string; name: string; benefits: StoredBenefit[] };

function benefitStatus(benefit: StoredBenefit, tasks: StoredTaskRecord[]) {
  if (benefit.completionRequired === false) return "Keine Aufgaben vorgesehen";
  if (!tasks.length) return benefit.status === "Erfüllt" || benefit.status === "Erledigt" || (benefit.evidence && benefit.evidence !== "Noch kein Nachweis") ? "Erledigt" : "Offen";
  if (tasks.every((task) => task.status === "Erledigt")) return "Erledigt";
  const nextTask = orderedTasks(tasks).find((task) => task.status !== "Erledigt");
  if (nextTask && (nextTask.assigned_to_sponsor || nextTask.completion_type === "sponsor_upload" || nextTask.completion_type === "sponsor_approval")) return "Wartet auf Sponsor";
  return tasks.some((task) => task.status === "Erledigt") ? "In Bearbeitung" : "Offen";
}

function orderedTasks(tasks: StoredTaskRecord[]) {
  return [...tasks].sort((a, b) => a.workflow_instance - b.workflow_instance || (a.workflow_order ?? 0) - (b.workflow_order ?? 0));
}

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
  const quantityBoundTasks = useMemo(() => tasks.filter((task) => {
    const benefit = benefits.find((item) => item.id === task.benefit_id);
    return !benefit || task.workflow_instance <= (benefit.tasksPerUnit ? benefit.quantity : 1);
  }), [benefits, tasks]);
  const visibleSponsorGroups = selectedSponsor === "all" ? sponsorGroups : sponsorGroups.filter((group) => group.id === selectedSponsor);

  if (!ready) return <section className="panel event-benefits-overview" aria-busy="true"><p className="subtitle">Leistungen werden geladen …</p></section>;
  if (error) return <EmptyState title="Leistungen konnten nicht geladen werden" description="Bitte lade die Ansicht erneut." />;
  if (!sponsorGroups.length) return <section className="panel event-benefits-overview"><EmptyState title="Noch keine Leistungen" description="Vereinbarte Leistungen erscheinen hier nach Sponsor gruppiert." /></section>;

  return <section className="panel event-benefits-overview">
    <div className="table-head"><div><h2>Leistungen nach Sponsor</h2><p className="subtitle">Fortschritt und Aufgabenstand der vereinbarten Leistungen.</p></div><label className="event-benefit-sponsor-filter"><span>Sponsor</span><select aria-label="Leistungen nach Sponsor filtern" value={selectedSponsor} onChange={(event) => setSelectedSponsor(event.target.value)}><option value="all">Alle Sponsoren</option>{sponsorGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label></div>
    <div className="event-benefit-sponsor-groups">{visibleSponsorGroups.map((group) => {
      const tracked = group.benefits.filter((benefit) => benefit.completionRequired !== false);
      const completed = tracked.filter((benefit) => benefitStatus(benefit, quantityBoundTasks.filter((task) => task.benefit_id === benefit.id)) === "Erledigt").length;
      const progress = tracked.length ? Math.round(completed / tracked.length * 100) : 0;
      return <SponsorGroup key={group.id} name={group.name} itemCount={group.benefits.length} itemLabel="Leistung" itemLabelPlural="Leistungen" headerAside={<div className="event-benefit-sponsor-progress"><span>{tracked.length ? `${completed} von ${tracked.length} aufgabenrelevanten Leistungen erledigt` : "Keine aufgabenrelevanten Leistungen"}</span>{tracked.length > 0 && <Progress value={progress}/>}</div>}>
        <div className="adaptive-table-wrap event-benefits-table-wrap"><table className="table adaptive-data-table event-benefits-data-table"><thead><tr><th>Leistung</th><th>Nächster Schritt</th><th>Fortschritt</th><th>Status</th></tr></thead><tbody>{group.benefits.map((benefit) => {
          const benefitTasks = orderedTasks(quantityBoundTasks.filter((task) => task.benefit_id === benefit.id));
          const status = benefitStatus(benefit, benefitTasks);
          const done = status === "Erledigt";
          const progressValue = benefit.completionRequired === false ? null : benefitTasks.length ? Math.round(benefitTasks.filter((task) => task.status === "Erledigt").length / benefitTasks.length * 100) : done ? 100 : 0;
          const nextTask = benefitTasks.find((task) => task.status !== "Erledigt");
          const nextOwner = nextTask ? nextTask.assigned_to_sponsor || nextTask.completion_type === "sponsor_upload" || nextTask.completion_type === "sponsor_approval" ? "Sponsor" : "Veranstalter" : null;
          const completedTasks = benefitTasks.filter((task) => task.status === "Erledigt").length;
          const progressLabel = benefitTasks.length ? `${completedTasks} von ${benefitTasks.length} Aufgaben` : done ? "Erfüllt" : "Noch keine Aufgaben";
          return <tr key={benefit.id}><td data-label="Leistung"><div className="event-benefit-name"><b>{benefit.title}</b><span className="event-benefit-kind">{benefit.benefitType === "in_kind" ? "Sachleistung" : "Geldleistung"}</span></div>{benefit.description && <small className="event-benefit-description">{benefit.description}</small>}</td><td data-label="Nächster Schritt">{benefit.completionRequired === false ? <span className="event-benefit-muted">Keine Aufgaben vorgesehen</span> : nextTask ? <div className="event-benefit-next-step"><span>{nextOwner}</span><b>{nextTask.title}</b></div> : <span className="event-benefit-muted">Alle Aufgaben erledigt</span>}</td><td data-label="Fortschritt">{progressValue !== null ? <div className="event-benefit-table-progress"><Progress value={progressValue}/><small>{progressLabel}</small></div> : <span className="event-benefit-muted">—</span>}</td><td data-label="Status"><Status value={status}/></td></tr>;
        })}</tbody></table></div>
      </SponsorGroup>;
    })}</div>
  </section>;
}
