"use client";

import { useEffect, useMemo, useState } from "react";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/client";

export type EventMetricValues = {
  sponsorship: number; signedSponsorship: number; sponsors: number; benefits: number; trackedBenefits: number; completed: number; contracts: number;
  contractsCreated: number; contractsSigned: number; reportsCreated: number; reportsSent: number; evidenceTasks: number; completedEvidenceTasks: number;
};
type Assignment = { event_id: string; sponsor_id: string };
type Contract = { id: string; event_id: string; sponsor_id: string; value_cents: number; signature_status?: string; signed_at?: string | null };
type Benefit = { id: string; event_id: string; sponsor_id: string | null; contract_id: string | null; title: string; status: string; evidence_summary: string | null; completion_required?: boolean | null; quantity: number; tasks_per_unit?: boolean | null };

function emptyMetrics(): EventMetricValues {
  return { sponsorship: 0, signedSponsorship: 0, sponsors: 0, benefits: 0, trackedBenefits: 0, completed: 0, contracts: 0, contractsCreated: 0, contractsSigned: 0, reportsCreated: 0, reportsSent: 0, evidenceTasks: 0, completedEvidenceTasks: 0 };
}

export async function fetchEventMetrics(eventIds: string[]) {
  const ids = [...new Set(eventIds.filter(Boolean))];
  const result: Record<string, EventMetricValues> = Object.fromEntries(ids.map((id) => [id, emptyMetrics()]));
  if (!ids.length) return result;
  if (!isSupabaseConfigured) throw new Error("Supabase ist nicht eingerichtet.");
  const supabase = createClient();
  const [assignmentResult, contractResult, benefitResult, taskResult, evidenceResult] = await Promise.all([
    supabase.from("event_sponsors").select("event_id, sponsor_id").in("event_id", ids),
    supabase.from("contracts").select("id, event_id, sponsor_id, value_cents, signature_status, signed_at").in("event_id", ids),
    supabase.from("benefits").select("id, event_id, sponsor_id, contract_id, title, status, evidence_summary, completion_required, quantity, tasks_per_unit").in("event_id", ids),
    supabase.from("tasks").select("id, event_id, benefit_id, status, workflow_instance").in("event_id", ids),
    supabase.from("evidence_files").select("event_id, benefit_id, task_id").in("event_id", ids),
  ]);
  for (const query of [assignmentResult, contractResult, benefitResult, taskResult, evidenceResult]) if (query.error) throw query.error;
  const assignments = (assignmentResult.data ?? []) as Assignment[];
  const contracts = (contractResult.data ?? []) as Contract[];
  const benefits = (benefitResult.data ?? []) as Benefit[];
  const assignmentKeys = new Set(assignments.map((row) => `${row.event_id}:${row.sponsor_id}`));
  const sponsorCounts = new Map<string, Set<string>>();
  assignments.forEach(({ event_id, sponsor_id }) => {
    const set = sponsorCounts.get(event_id) ?? new Set<string>(); set.add(sponsor_id); sponsorCounts.set(event_id, set);
  });
  Object.entries(result).forEach(([id, metrics]) => { metrics.sponsors = sponsorCounts.get(id)?.size ?? 0; });

  const contractIds = contracts.map((contract) => contract.id);
  const [documentResult, reportResult] = contractIds.length
    ? await Promise.all([
      supabase.from("contract_documents").select("contract_id, kind").in("contract_id", contractIds),
      supabase.from("contract_reports").select("contract_id, generated_at, sent_at").in("contract_id", contractIds),
    ])
    : [{ data: [], error: null }, { data: [], error: null }];
  if (documentResult.error) throw documentResult.error;
  if (reportResult.error) throw reportResult.error;
  const generatedIds = new Set((documentResult.data ?? []).filter((item) => item.kind === "generated_pdf" || item.kind === "generated_docx" || item.kind === "uploaded_pdf").map((item) => item.contract_id));
  const signedIds = new Set((documentResult.data ?? []).filter((item) => item.kind === "signed").map((item) => item.contract_id));
  const reports = new Map((reportResult.data ?? []).map((item) => [item.contract_id, item]));
  contracts.forEach((contract) => {
    if (!assignmentKeys.has(`${contract.event_id}:${contract.sponsor_id}`)) return;
    const metrics = result[contract.event_id];
    metrics.sponsorship += Number(contract.value_cents ?? 0) / 100;
    metrics.contracts += 1;
    if (generatedIds.has(contract.id)) metrics.contractsCreated += 1;
    const isSigned = contract.signature_status === "signed" || Boolean(contract.signed_at) || signedIds.has(contract.id);
    if (isSigned) {
      metrics.contractsSigned += 1;
      metrics.signedSponsorship += Number(contract.value_cents ?? 0) / 100;
    }
    if (reports.get(contract.id)?.generated_at) metrics.reportsCreated += 1;
    if (reports.get(contract.id)?.sent_at) metrics.reportsSent += 1;
  });

  const evidenceKeys = new Set((evidenceResult.data ?? []).flatMap((item) => [item.task_id, item.benefit_id ? `benefit-${item.benefit_id}` : null]).filter(Boolean));
  const taskRows = taskResult.data ?? [];
  const tasksByBenefit = new Map<string, typeof taskRows>();
  for (const task of taskRows) {
    if (!task.benefit_id) continue;
    tasksByBenefit.set(task.benefit_id, [...(tasksByBenefit.get(task.benefit_id) ?? []), task]);
  }
  const contractById = new Map(contracts.map((contract) => [contract.id, contract]));
  const counted = new Set<string>();
  benefits.forEach((benefit) => {
    const sponsorId = benefit.sponsor_id ?? (benefit.contract_id ? contractById.get(benefit.contract_id)?.sponsor_id : undefined);
    if (!sponsorId || !assignmentKeys.has(`${benefit.event_id}:${sponsorId}`)) return;
    const key = `${benefit.event_id}:${sponsorId}:${benefit.title.trim().replace(/\s+/g, " ").toLocaleLowerCase("de-DE")}`;
    if (counted.has(key)) return;
    counted.add(key);
    const metrics = result[benefit.event_id];
    metrics.benefits += 1;
    if (benefit.completion_required === false) return;
    metrics.trackedBenefits += 1;
    const workflowCount = benefit.tasks_per_unit === false ? 1 : benefit.quantity;
    const subtasks = (tasksByBenefit.get(benefit.id) ?? []).filter((task) => task.workflow_instance <= workflowCount);
    if (subtasks.length) {
      if (subtasks.every((task) => task.status === "Erledigt" || evidenceKeys.has(task.id))) metrics.completed += 1;
      return;
    }
    metrics.evidenceTasks += 1;
    const complete = benefit.status === "Erfüllt" || benefit.status === "Erledigt" || Boolean(benefit.evidence_summary && benefit.evidence_summary !== "Noch kein Nachweis") || evidenceKeys.has(`benefit-${benefit.id}`);
    if (complete) { metrics.completed += 1; metrics.completedEvidenceTasks += 1; }
  });
  const noCompletionBenefitIds = new Set(benefits.filter((benefit) => benefit.completion_required === false).map((benefit) => benefit.id));
  (taskResult.data ?? []).forEach((task) => {
    if (!task.event_id || !result[task.event_id] || (task.benefit_id && noCompletionBenefitIds.has(task.benefit_id))) return;
    const benefit = task.benefit_id ? benefits.find((item) => item.id === task.benefit_id) : undefined;
    if (benefit && task.workflow_instance > (benefit.tasks_per_unit === false ? 1 : benefit.quantity)) return;
    result[task.event_id].evidenceTasks += 1;
    if (task.status === "Erledigt" || evidenceKeys.has(task.id)) result[task.event_id].completedEvidenceTasks += 1;
  });
  return result;
}

export function sumEventMetrics(metrics: EventMetricValues[]): EventMetricValues {
  return metrics.reduce((sum, item) => ({
    sponsorship: sum.sponsorship + item.sponsorship, signedSponsorship: sum.signedSponsorship + item.signedSponsorship, sponsors: sum.sponsors + item.sponsors,
    benefits: sum.benefits + item.benefits, trackedBenefits: sum.trackedBenefits + item.trackedBenefits, completed: sum.completed + item.completed,
    contracts: sum.contracts + item.contracts, contractsCreated: sum.contractsCreated + item.contractsCreated,
    contractsSigned: sum.contractsSigned + item.contractsSigned, reportsCreated: sum.reportsCreated + item.reportsCreated,
    reportsSent: sum.reportsSent + item.reportsSent,
    evidenceTasks: sum.evidenceTasks + item.evidenceTasks, completedEvidenceTasks: sum.completedEvidenceTasks + item.completedEvidenceTasks,
  }), emptyMetrics());
}

export type EventLifecycleStage = {
  label: "Event angelegt" | "Alle Verträge erstellt" | "Alle Verträge unterschrieben" | "Alle Nachweise erbracht" | "Abgeschlossen";
  color: "yellow" | "blue" | "green";
};

export function eventLifecycleStage(metrics: EventMetricValues): EventLifecycleStage {
  if (metrics.contracts > 0 && metrics.contracts === metrics.sponsors && metrics.reportsCreated === metrics.contracts && metrics.reportsSent === metrics.contracts) return { label: "Abgeschlossen", color: "green" };
  if (metrics.evidenceTasks > 0 && metrics.completedEvidenceTasks === metrics.evidenceTasks) return { label: "Alle Nachweise erbracht", color: "blue" };
  if (metrics.sponsors > 0 && metrics.contracts === metrics.sponsors && metrics.contractsSigned === metrics.sponsors) return { label: "Alle Verträge unterschrieben", color: "blue" };
  if (metrics.sponsors > 0 && metrics.contracts === metrics.sponsors && metrics.contractsCreated === metrics.contracts) return { label: "Alle Verträge erstellt", color: "blue" };
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
    return () => { window.removeEventListener("sponsorproof:event-sponsors-updated", refresh); window.removeEventListener("sponso:event-timeline-updated", refresh); };
  }, []);
  useEffect(() => {
    let cancelled = false;
    const ids = idsKey ? idsKey.split("\u0000") : [];
    setLoading(true); setError(false);
    fetchEventMetrics(ids).then((metrics) => { if (!cancelled) setByEvent(metrics); }).catch(() => { if (!cancelled) { setByEvent({}); setError(true); } }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [idsKey, revision]);
  return { byEvent, aggregate: sumEventMetrics(Object.values(byEvent)), loading, error };
}
