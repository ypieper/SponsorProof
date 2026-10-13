"use client";

import { useEffect, useMemo, useState } from "react";
import type { StoredEvent } from "@/lib/events-storage";
import type { SponsorRecord } from "@/lib/sponsors-storage";
import { Icon } from "@/components/ui";

type TimelineStep = { title: string; detail: string; complete: boolean };
type ExtraBenefit = { id?: string; title: string; eventId: string; sponsorId?: string; evidence?: string };
type ManualTask = { id: string; eventId?: string };
type StoredGeneratedContract = { contractId: string; pdf?: { generatedAt?: string }; docx?: { generatedAt?: string } };
type StoredSignedContract = { contractId: string };
type StoredContractFiles = { generated: StoredGeneratedContract[]; signedContractIds: string[] };
type StoredReportDates = Record<string, string>;

const evidenceDatabase = "sponsorproof-evidence";
const generatedContractsDatabase = "sponsorproof-contract-files";
const additionalBenefitsKey = "sponsorproof.additional-benefits.v1";
const manualTasksKey = "sponsorproof.manual-tasks.v1";
const createdReportsKey = "sponsorproof.created-reports.v1";
const sentReportsKey = "sponsorproof.sent-reports.v1";

function readJson<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") as T ?? fallback;
  } catch {
    return fallback;
  }
}

function readEvidenceIds() {
  return new Promise<string[]>((resolve, reject) => {
    const request = indexedDB.open(evidenceDatabase, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("proofs")) request.result.createObjectStore("proofs", { keyPath: "taskId" });
    };
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction("proofs", "readonly");
      const read = transaction.objectStore("proofs").getAllKeys();
      read.onsuccess = () => { resolve(read.result.map(String)); database.close(); };
      read.onerror = () => { reject(read.error); database.close(); };
    };
    request.onerror = () => reject(request.error);
  });
}

function readContractFiles() {
  return new Promise<StoredContractFiles>((resolve, reject) => {
    const request = indexedDB.open(generatedContractsDatabase, 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("signed-contracts")) request.result.createObjectStore("signed-contracts", { keyPath: "contractId" });
      if (!request.result.objectStoreNames.contains("generated-contracts")) request.result.createObjectStore("generated-contracts", { keyPath: "contractId" });
    };
    request.onsuccess = () => {
      const database = request.result;
      const storeNames = ["generated-contracts", "signed-contracts"].filter((name) => database.objectStoreNames.contains(name));
      if (!storeNames.length) { database.close(); resolve({ generated: [], signedContractIds: [] }); return; }
      const transaction = database.transaction(storeNames, "readonly");
      const generatedRequest = database.objectStoreNames.contains("generated-contracts") ? transaction.objectStore("generated-contracts").getAll() : null;
      const signedRequest = database.objectStoreNames.contains("signed-contracts") ? transaction.objectStore("signed-contracts").getAll() : null;
      transaction.oncomplete = () => {
        resolve({
          generated: (generatedRequest?.result ?? []) as StoredGeneratedContract[],
          signedContractIds: ((signedRequest?.result ?? []) as StoredSignedContract[]).map((item) => item.contractId),
        });
        database.close();
      };
      transaction.onerror = () => { reject(transaction.error); database.close(); };
      transaction.onabort = () => { reject(transaction.error); database.close(); };
    };
    request.onerror = () => reject(request.error);
  });
}

function benefitTaskId(benefit: ExtraBenefit) {
  return benefit.id ? `benefit-${benefit.id}` : `benefit-${benefit.eventId}-${benefit.title.toLocaleLowerCase("de-DE").replace(/[^a-z0-9]+/g, "-")}`;
}

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
    { title: "Verträge erstellt", detail: "Wird geladen …", complete: false },
    { title: "Verträge unterschrieben", detail: "Wird geladen …", complete: false },
    { title: "Alle Nachweise erbracht", detail: "Wird geladen …", complete: false },
    { title: "Abschlussreport erstellt", detail: "Wird geladen …", complete: false },
  ]);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const [evidenceIds, contractFiles] = await Promise.all([readEvidenceIds(), readContractFiles()]);
        const evidence = new Set(evidenceIds);
        const contractIds = contracts.map((contract) => contract.id);
        const generatedByContract = new Map(contractFiles.generated.map((item) => [item.contractId, item]));
        const generatedCount = contractIds.filter((id) => {
          const item = generatedByContract.get(id);
          return Boolean(item?.pdf || item?.docx);
        }).length;

        const signedContractIds = new Set(contractFiles.signedContractIds);
        const signedCount = eventSponsors.filter((record) => record.contracts.some((contract) => contract.eventId === event.id && signedContractIds.has(contract.id))).length;
        const extraBenefits = readJson<ExtraBenefit[]>(additionalBenefitsKey, []).filter((benefit) => benefit.eventId === event.id);
        const manualTasks = readJson<ManualTask[]>(manualTasksKey, []).filter((task) => task.eventId === event.id);
        const benefitTasks = extraBenefits.map((benefit) => ({ id: benefitTaskId(benefit), evidence: benefit.evidence }));
        const tasks = [...benefitTasks, ...manualTasks.map((task) => ({ id: task.id, evidence: "" }))];
        const completedTasks = tasks.filter((task) => evidence.has(task.id) || Boolean(task.evidence && task.evidence !== "Noch kein Nachweis")).length;

        const createdReportDates = readJson<StoredReportDates>(createdReportsKey, {});
        const sentReports = new Set(readJson<string[]>(sentReportsKey, []));
        const createdReports = contractIds.filter((id) => Boolean(createdReportDates[id] || sentReports.has(id))).length;
        const contractTotal = contracts.length;
        const stepsNext: TimelineStep[] = [
          { title: "Event angelegt", detail: formatDate(event.createdAt) || "Erfasst", complete: true },
          { title: "Verträge erstellt", detail: `${generatedCount} von ${contractTotal} Verträgen`, complete: contractTotal > 0 && generatedCount === contractTotal },
          { title: "Verträge unterschrieben", detail: `${signedCount} von ${eventSponsors.length} gezeichnete Vereinbarungen hochgeladen`, complete: eventSponsors.length > 0 && signedCount === eventSponsors.length },
          { title: "Alle Nachweise erbracht", detail: tasks.length ? `${completedTasks} von ${tasks.length} Nachweisen` : "Noch keine Aufgaben oder Leistungen", complete: tasks.length > 0 && completedTasks === tasks.length },
          { title: "Abschlussreport erstellt", detail: `${createdReports} von ${contractTotal} Reports`, complete: contractTotal > 0 && createdReports === contractTotal },
        ];
        if (!cancelled) setSteps(stepsNext);
      } catch {
        if (!cancelled) setSteps((current) => current.map((step, index) => index === 0 ? step : { ...step, detail: "Status nicht verfügbar" }));
      }
    }
    void refresh();
    const refreshOnChange = () => { void refresh(); };
    window.addEventListener("sponso:event-timeline-updated", refreshOnChange);
    window.addEventListener("sponsorproof:event-sponsors-updated", refreshOnChange);
    window.addEventListener("storage", refreshOnChange);
    return () => {
      cancelled = true;
      window.removeEventListener("sponso:event-timeline-updated", refreshOnChange);
      window.removeEventListener("sponsorproof:event-sponsors-updated", refreshOnChange);
      window.removeEventListener("storage", refreshOnChange);
    };
  }, [contracts, event.createdAt, event.id, eventSponsors]);

  const activeIndex = steps.findIndex((step) => !step.complete);
  return <section className="event-timeline" aria-label="Event-Meilensteine">
    <div className="event-timeline-scroll"><ol className="event-timeline-steps">{steps.map((step, index) => {
      const active = index === activeIndex;
      return <li className={`event-timeline-step ${step.complete ? "complete" : active ? "active" : "upcoming"}`} key={step.title}>
        <span className="event-timeline-node">{step.complete ? <Icon name="check" size={13}/> : <span/>}</span>
        <b>{step.title}</b><small>{step.detail}</small>
      </li>;
    })}</ol></div>
  </section>;
}
