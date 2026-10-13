"use client";

import { useEffect, useMemo, useState } from "react";
import { eventContractValuesKey } from "@/lib/event-contract-values";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/client";

export type EventMetricValues = {
  sponsorship: number;
  sponsors: number;
  benefits: number;
  completed: number;
  contracts: number;
  contractsCreated: number;
  contractsSigned: number;
  reportsCreated: number;
  evidenceTasks: number;
  completedEvidenceTasks: number;
};
type Assignment = { event_id: string; sponsor_id: string };
type Contract = { id: string; event_id: string; sponsor_id: string; value_cents: number };
type Benefit = { id: string; event_id: string; sponsor_id: string | null; contract_id: string | null; status: string; evidence_summary: string | null };
type LocalBenefit = { id?: string; eventId: string; sponsorId: string; status?: string; evidence?: string };
type ManualTask = { id: string; eventId?: string };
type ContractFileRecord = { contractId: string };

const localBenefitsKey = "sponsorproof.additional-benefits.v1";
const manualTasksKey = "sponsorproof.manual-tasks.v1";
const createdReportsKey = "sponsorproof.created-reports.v1";
const sentReportsKey = "sponsorproof.sent-reports.v1";
const evidenceDatabase = "sponsorproof-evidence";
const contractDatabase = "sponsorproof-contract-files";

function readLocalValue<T>(key: string, fallback: T): T {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
    return parsed == null ? fallback : parsed as T;
  } catch {
    return fallback;
  }
}

function readEvidenceIds() {
  return new Promise<Set<string>>((resolve) => {
    const request = indexedDB.open(evidenceDatabase, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("proofs")) request.result.createObjectStore("proofs", { keyPath: "taskId" });
    };
    request.onsuccess = () => {
      const database = request.result;
      const read = database.transaction("proofs", "readonly").objectStore("proofs").getAllKeys();
      read.onsuccess = () => { resolve(new Set(read.result.map(String))); database.close(); };
      read.onerror = () => { resolve(new Set()); database.close(); };
    };
    request.onerror = () => resolve(new Set());
  });
}

function readContractFileIds() {
  return new Promise<{ generated: Set<string>; signed: Set<string> }>((resolve) => {
    const request = indexedDB.open(contractDatabase, 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("signed-contracts")) request.result.createObjectStore("signed-contracts", { keyPath: "contractId" });
      if (!request.result.objectStoreNames.contains("generated-contracts")) request.result.createObjectStore("generated-contracts", { keyPath: "contractId" });
    };
    request.onsuccess = () => {
      const database = request.result;
      const names = ["generated-contracts", "signed-contracts"].filter((name) => database.objectStoreNames.contains(name));
      if (!names.length) { database.close(); resolve({ generated: new Set(), signed: new Set() }); return; }
      const transaction = database.transaction(names, "readonly");
      const generatedRead = database.objectStoreNames.contains("generated-contracts") ? transaction.objectStore("generated-contracts").getAll() : null;
      const signedRead = database.objectStoreNames.contains("signed-contracts") ? transaction.objectStore("signed-contracts").getAll() : null;
      transaction.oncomplete = () => {
        const generated = ((generatedRead?.result ?? []) as ContractFileRecord[]).map((item) => item.contractId);
        const signed = ((signedRead?.result ?? []) as ContractFileRecord[]).map((item) => item.contractId);
        resolve({ generated: new Set(generated), signed: new Set(signed) });
        database.close();
      };
      transaction.onerror = () => { resolve({ generated: new Set(), signed: new Set() }); database.close(); };
      transaction.onabort = () => { resolve({ generated: new Set(), signed: new Set() }); database.close(); };
    };
    request.onerror = () => resolve({ generated: new Set(), signed: new Set() });
  });
}

function emptyMetrics(): EventMetricValues {
  return { sponsorship: 0, sponsors: 0, benefits: 0, completed: 0, contracts: 0, contractsCreated: 0, contractsSigned: 0, reportsCreated: 0, evidenceTasks: 0, completedEvidenceTasks: 0 };
}

export async function fetchEventMetrics(eventIds: string[]) {
  const ids = [...new Set(eventIds.filter(Boolean))];
  const result: Record<string, EventMetricValues> = Object.fromEntries(ids.map((id) => [id, emptyMetrics()]));
  if (!ids.length) return result;

  const assignments: Assignment[] = [];
  const contracts: Contract[] = [];
  const databaseBenefits: Benefit[] = [];
  if (isSupabaseConfigured) {
    const supabase = createClient();
    const [assignmentResult, contractResult, benefitResult] = await Promise.all([
      supabase.from("event_sponsors").select("event_id, sponsor_id").in("event_id", ids),
      supabase.from("contracts").select("id, event_id, sponsor_id, value_cents").in("event_id", ids),
      supabase.from("benefits").select("id, event_id, sponsor_id, contract_id, status, evidence_summary").in("event_id", ids),
    ]);
    if (assignmentResult.error) throw assignmentResult.error;
    if (contractResult.error) throw contractResult.error;
    if (benefitResult.error) throw benefitResult.error;
    assignments.push(...(assignmentResult.data ?? []) as Assignment[]);
    contracts.push(...(contractResult.data ?? []) as Contract[]);
    databaseBenefits.push(...(benefitResult.data ?? []) as Benefit[]);
  }

  const assignmentKeys = new Set(assignments.map((row) => `${row.event_id}:${row.sponsor_id}`));
  const assignmentCounts = new Map<string, Set<string>>();
  assignments.forEach(({ event_id, sponsor_id }) => {
    const sponsors = assignmentCounts.get(event_id) ?? new Set<string>();
    sponsors.add(sponsor_id);
    assignmentCounts.set(event_id, sponsors);
  });
  const values = readLocalValue<Record<string, number>>(eventContractValuesKey, {});
  const [contractFiles, evidenceIds] = await Promise.all([
    readContractFileIds().catch(() => ({ generated: new Set<string>(), signed: new Set<string>() })),
    readEvidenceIds().catch(() => new Set<string>()),
  ]);
  const createdReports = readLocalValue<Record<string, string>>(createdReportsKey, {});
  const sentReports = new Set(readLocalValue<string[]>(sentReportsKey, []));
  const contractsById = new Map(contracts.map((contract) => [contract.id, contract]));
  contracts.forEach((contract) => {
    if (!assignmentKeys.has(`${contract.event_id}:${contract.sponsor_id}`)) return;
    const metrics = result[contract.event_id];
    metrics.sponsorship += values[contract.id] ?? Number(contract.value_cents ?? 0) / 100;
    metrics.contracts += 1;
    if (contractFiles.generated.has(contract.id)) metrics.contractsCreated += 1;
    if (contractFiles.signed.has(contract.id)) metrics.contractsSigned += 1;
    if (createdReports[contract.id] || sentReports.has(contract.id)) metrics.reportsCreated += 1;
  });
  Object.entries(result).forEach(([eventId, metrics]) => {
    metrics.sponsors = assignmentCounts.get(eventId)?.size ?? 0;
  });

  const localBenefits = readLocalValue<LocalBenefit[]>(localBenefitsKey, []);
  const manualTasks = readLocalValue<ManualTask[]>(manualTasksKey, []);
  const counted = new Set<string>();
  const addBenefit = (eventId: string, sponsorId: string, id: string, complete: boolean) => {
    if (!result[eventId] || !assignmentKeys.has(`${eventId}:${sponsorId}`)) return;
    const key = `${eventId}:${sponsorId}:${id}`;
    if (counted.has(key)) return;
    counted.add(key);
    result[eventId].benefits += 1;
    if (complete) result[eventId].completed += 1;
    result[eventId].evidenceTasks += 1;
    if (complete) result[eventId].completedEvidenceTasks += 1;
  };

  databaseBenefits.forEach((benefit) => {
    const contract = benefit.contract_id ? contractsById.get(benefit.contract_id) : undefined;
    const sponsorId = benefit.sponsor_id ?? contract?.sponsor_id;
    if (!sponsorId) return;
    const completed = benefit.status === "Erfüllt" || benefit.status === "Erledigt"
      || Boolean(benefit.evidence_summary && benefit.evidence_summary !== "Noch kein Nachweis")
      || evidenceIds.has(`benefit-${benefit.id}`);
    addBenefit(benefit.event_id, sponsorId, benefit.id, completed);
  });

  localBenefits.forEach((benefit, index) => {
    const id = benefit.id ?? `${benefit.eventId}-${benefit.sponsorId}-${index}`;
    const completed = benefit.status === "Erfüllt" || benefit.status === "Erledigt"
      || Boolean(benefit.evidence && benefit.evidence !== "Noch kein Nachweis")
      || evidenceIds.has(`benefit-${id}`);
    addBenefit(benefit.eventId, benefit.sponsorId, id, completed);
  });
  manualTasks.forEach((task) => {
    if (!task.eventId || !result[task.eventId]) return;
    result[task.eventId].evidenceTasks += 1;
    if (evidenceIds.has(task.id)) result[task.eventId].completedEvidenceTasks += 1;
  });
  return result;
}

export function sumEventMetrics(metrics: EventMetricValues[]): EventMetricValues {
  return metrics.reduce((sum, item) => ({
    sponsorship: sum.sponsorship + item.sponsorship,
    sponsors: sum.sponsors + item.sponsors,
    benefits: sum.benefits + item.benefits,
    completed: sum.completed + item.completed,
    contracts: sum.contracts + item.contracts,
    contractsCreated: sum.contractsCreated + item.contractsCreated,
    contractsSigned: sum.contractsSigned + item.contractsSigned,
    reportsCreated: sum.reportsCreated + item.reportsCreated,
    evidenceTasks: sum.evidenceTasks + item.evidenceTasks,
    completedEvidenceTasks: sum.completedEvidenceTasks + item.completedEvidenceTasks,
  }), emptyMetrics());
}

export type EventLifecycleStage = {
  label: "Event angelegt" | "Alle Verträge erstellt" | "Alle Verträge unterschrieben" | "Alle Nachweise erbracht" | "Abgeschlossen";
  color: "yellow" | "blue" | "green";
};

export function eventLifecycleStage(metrics: EventMetricValues): EventLifecycleStage {
  if (metrics.contracts > 0 && metrics.contracts === metrics.sponsors && metrics.reportsCreated === metrics.contracts) {
    return { label: "Abgeschlossen", color: "green" };
  }
  if (metrics.evidenceTasks > 0 && metrics.completedEvidenceTasks === metrics.evidenceTasks) {
    return { label: "Alle Nachweise erbracht", color: "blue" };
  }
  if (metrics.sponsors > 0 && metrics.contracts === metrics.sponsors && metrics.contractsSigned === metrics.sponsors) {
    return { label: "Alle Verträge unterschrieben", color: "blue" };
  }
  if (metrics.sponsors > 0 && metrics.contracts === metrics.sponsors && metrics.contractsCreated === metrics.contracts) {
    return { label: "Alle Verträge erstellt", color: "blue" };
  }
  return { label: "Event angelegt", color: "yellow" };
}

export function useEventMetrics(eventIds: string[]) {
  const idsKey = useMemo(() => [...new Set(eventIds.filter(Boolean))].sort().join("\u0000"), [eventIds]);
  const [byEvent, setByEvent] = useState<Record<string, EventMetricValues>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener("sponsorproof:event-sponsors-updated", refresh);
    window.addEventListener("sponso:event-timeline-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("sponsorproof:event-sponsors-updated", refresh);
      window.removeEventListener("sponso:event-timeline-updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const ids = idsKey ? idsKey.split("\u0000") : [];
    setLoading(true);
    setError(false);
    fetchEventMetrics(ids).then((metrics) => {
      if (!cancelled) setByEvent(metrics);
    }).catch(() => {
      if (!cancelled) { setByEvent({}); setError(true); }
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [idsKey, revision]);

  return { byEvent, aggregate: sumEventMetrics(Object.values(byEvent)), loading, error };
}
