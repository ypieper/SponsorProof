"use client";

import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { useEffect, useMemo, useState } from "react";
import { calculateEventMetrics, sumEventMetrics, type EventMetricValues } from "./event-metric-values";
export { eventLifecycleStage, sumEventMetrics } from "./event-metric-values";
export type { EventLifecycleStage, EventMetricValues } from "./event-metric-values";

export async function fetchEventMetrics(eventIds: string[]) {
  const ids = [...new Set(eventIds.filter(Boolean))];
  if (!ids.length) return {};
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
  const contractIds = (contractResult.data ?? []).map((contract) => contract.id);
  const [documentResult, reportResult] = contractIds.length
    ? await Promise.all([
      supabase.from("contract_documents").select("contract_id, kind").in("contract_id", contractIds),
      supabase.from("contract_reports").select("contract_id, generated_at, sent_at").in("contract_id", contractIds),
    ])
    : [{ data: [], error: null }, { data: [], error: null }];
  if (documentResult.error) throw documentResult.error;
  if (reportResult.error) throw reportResult.error;
  return calculateEventMetrics(ids, {
    assignments: assignmentResult.data ?? [], contracts: contractResult.data ?? [], benefits: benefitResult.data ?? [],
    tasks: taskResult.data ?? [], evidence: evidenceResult.data ?? [], documents: documentResult.data ?? [], reports: reportResult.data ?? [],
  });
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
