"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Sponsor, SponsorContract } from "@/lib/demo-data";
import { contractDateForInput, eventContractDatesKey } from "@/lib/event-contract-dates";
import { Icon, Progress, Status } from "@/components/ui";
import { eventContractValuesKey, formatContractValue, parseContractValue, type EventContractValues } from "@/lib/event-contract-values";

type Benefit = { id?: string; title: string; sponsorId: string; eventId: string; evidence?: string };
type ManualTask = { id: string; title: string; sponsor: string; sponsorId?: string; eventId?: string };
type TaskEvidence = { taskId: string };
type ContractSummary = { status: "Offen" | "In Arbeit" | "Erledigt"; progress: number };

const evidenceDatabase = "sponsorproof-evidence";
const evidenceStore = "proofs";
const additionalBenefitsKey = "sponsorproof.additional-benefits.v1";
const manualTasksKey = "sponsorproof.manual-tasks.v1";

function readEvidence(): Promise<TaskEvidence[]> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(evidenceDatabase, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(evidenceStore, { keyPath: "taskId" });
    request.onsuccess = () => {
      const database = request.result;
      const read = database.transaction(evidenceStore, "readonly").objectStore(evidenceStore).getAll();
      read.onsuccess = () => { resolve(read.result as TaskEvidence[]); database.close(); };
      read.onerror = () => { reject(read.error); database.close(); };
    };
    request.onerror = () => reject(request.error);
  });
}

function benefitTaskId(eventId: string, benefit: Benefit) {
  return benefit.id ? `benefit-${benefit.id}` : `benefit-${eventId}-${benefit.title.toLocaleLowerCase("de-DE").replace(/[^a-z0-9]+/g, "-")}`;
}

export function EventSponsorsOverview({ eventId, sponsors, contracts, benefits }: {
  eventId: string;
  sponsors: Sponsor[];
  contracts: SponsorContract[];
  benefits: Benefit[];
}) {
  const [summaries, setSummaries] = useState<Record<string, ContractSummary>>({});
  const [contractAmounts, setContractAmounts] = useState<EventContractValues>({});

  useEffect(() => {
    let cancelled = false;
    async function loadSummaries() {
      try {
        const evidence = new Set((await readEvidence()).map((item) => item.taskId));
        const extraBenefits = JSON.parse(localStorage.getItem(additionalBenefitsKey) ?? "[]") as Benefit[];
        const manualTasks = JSON.parse(localStorage.getItem(manualTasksKey) ?? "[]") as ManualTask[];
        const savedDates = JSON.parse(localStorage.getItem(eventContractDatesKey) ?? "{}") as Record<string, string>;
        const savedAmounts = JSON.parse(localStorage.getItem(eventContractValuesKey) ?? "{}") as EventContractValues;
        const next: Record<string, ContractSummary> = {};
        for (const contract of contracts) {
          const signedOn = savedDates[contract.id] !== undefined ? savedDates[contract.id] : contractDateForInput(contract.signedAt);
          if (!signedOn) {
            next[contract.id] = { status: "Offen", progress: 0 };
            continue;
          }
          const contractBenefits = [...benefits, ...extraBenefits].filter((benefit) => benefit.eventId === eventId && benefit.sponsorId === contract.sponsorId);
          const sponsor = sponsors.find((item) => item.id === contract.sponsorId);
          const contractTasks = manualTasks.filter((task) => task.eventId === eventId && (task.sponsorId === contract.sponsorId || (!task.sponsorId && task.sponsor === sponsor?.name)));
          const taskIds = [
            ...contractBenefits.map((benefit) => benefitTaskId(eventId, benefit)),
            ...contractTasks.map((task) => task.id),
          ];
          const completed = taskIds.filter((id) => evidence.has(id) || contractBenefits.some((benefit) => benefitTaskId(eventId, benefit) === id && Boolean(benefit.evidence && benefit.evidence !== "Noch kein Nachweis"))).length;
          const progress = taskIds.length ? Math.round(completed / taskIds.length * 100) : 0;
          next[contract.id] = { status: taskIds.length > 0 && completed === taskIds.length ? "Erledigt" : "In Arbeit", progress };
        }
        if (!cancelled) {
          setSummaries(next);
          setContractAmounts(savedAmounts);
        }
      } catch {
        if (!cancelled) {
          setSummaries(Object.fromEntries(contracts.map((contract) => {
            const signedOn = contractDateForInput(contract.signedAt);
            const status = !signedOn ? "Offen" : contract.progress >= 100 ? "Erledigt" : "In Arbeit";
            return [contract.id, { status, progress: status === "Offen" ? 0 : contract.progress }];
          })) as Record<string, ContractSummary>);
        }
      }
    }
    void loadSummaries();
    return () => { cancelled = true; };
  }, [eventId, sponsors, contracts, benefits]);

  return <section className="panel table-panel event-sponsors-panel"><div className="table-head"><div><h2>Sponsoren im Überblick</h2><p className="subtitle" style={{ fontSize: 11, marginTop: 4 }}>Wähle einen Sponsor, um Vertrag und vereinbarte Einzelleistungen dieses Events zu sehen.</p></div><button className="btn btn-primary" type="button"><Icon name="plus" size={14}/> Sponsor hinzufügen</button></div><table className="table"><thead><tr><th>SPONSOR</th><th>WERT</th><th>ERFÜLLUNG</th><th>STATUS</th></tr></thead><tbody>{contracts.map((contract) => {
    const sponsor = sponsors.find((item) => item.id === contract.sponsorId);
    if (!sponsor) return null;
    const initialSignedOn = contractDateForInput(contract.signedAt);
    const summary = summaries[contract.id] ?? { status: !initialSignedOn ? "Offen" as const : "In Arbeit" as const, progress: initialSignedOn ? contract.progress : 0 };
    const contractAmount = contractAmounts[contract.id] ?? parseContractValue(contract.value);
    return <tr key={contract.id}><td><Link href={`/events/${eventId}?tab=sponsoren&sponsor=${sponsor.id}`} className="sponsor-name"><span className="sponsor-mark" style={{ background: sponsor.color, color: "white" }}>{sponsor.initials}</span>{sponsor.name}</Link></td><td>{formatContractValue(contractAmount)}</td><td><Progress value={summary.progress}/></td><td><Status value={summary.status}/></td></tr>;
  })}</tbody></table></section>;
}
