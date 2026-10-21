import { benefitWorkflowCount, hasBenefitEvidence, isCompletedBenefitStatus, normalizeBenefitTitle } from "./benefit-workflow";

export type EventMetricValues = {
  sponsorship: number; signedSponsorship: number; sponsors: number; benefits: number; trackedBenefits: number; completed: number; contracts: number;
  contractsCreated: number; contractsSigned: number; reportsCreated: number; reportsSent: number; evidenceTasks: number; completedEvidenceTasks: number;
};

export type Assignment = { event_id: string; sponsor_id: string };

export type Contract = { id: string; event_id: string; sponsor_id: string; value_cents: number; signature_status?: string; signed_at?: string | null };

export type Benefit = { id: string; event_id: string; sponsor_id: string | null; contract_id: string | null; title: string; status: string; evidence_summary: string | null; completion_required?: boolean | null; quantity: number; tasks_per_unit?: boolean | null };

export type MetricTask = { id: string; event_id: string | null; benefit_id: string | null; status: string; workflow_instance: number };
export type MetricEvidence = { event_id: string; benefit_id: string | null; task_id: string | null };
export type EventMetricsInput = { assignments: Assignment[]; contracts: Contract[]; benefits: Benefit[]; tasks: MetricTask[]; evidence: MetricEvidence[]; documents: { contract_id: string; kind: string }[]; reports: { contract_id: string; generated_at: string | null; sent_at: string | null }[] };

export function emptyMetrics(): EventMetricValues {
  return { sponsorship: 0, signedSponsorship: 0, sponsors: 0, benefits: 0, trackedBenefits: 0, completed: 0, contracts: 0, contractsCreated: 0, contractsSigned: 0, reportsCreated: 0, reportsSent: 0, evidenceTasks: 0, completedEvidenceTasks: 0 };
}

export function calculateEventMetrics(eventIds: string[], { assignments, contracts, benefits, tasks, evidence, documents, reports: reportRows }: EventMetricsInput) {
  const ids = [...new Set(eventIds.filter(Boolean))];
  const result: Record<string, EventMetricValues> = Object.fromEntries(ids.map((id) => [id, emptyMetrics()]));
  if (!ids.length) return result;
  const assignmentKeys = new Set(assignments.map((row) => `${row.event_id}:${row.sponsor_id}`));
  const sponsorCounts = new Map<string, Set<string>>();
  assignments.forEach(({ event_id, sponsor_id }) => {
    const set = sponsorCounts.get(event_id) ?? new Set<string>(); set.add(sponsor_id); sponsorCounts.set(event_id, set);
  });
  Object.entries(result).forEach(([id, metrics]) => { metrics.sponsors = sponsorCounts.get(id)?.size ?? 0; });

  const generatedIds = new Set(documents.filter((item) => item.kind === "generated_pdf" || item.kind === "generated_docx" || item.kind === "uploaded_pdf").map((item) => item.contract_id));
  const signedIds = new Set(documents.filter((item) => item.kind === "signed").map((item) => item.contract_id));
  const reports = new Map(reportRows.map((item) => [item.contract_id, item]));
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

  const evidenceKeys = new Set(evidence.flatMap((item) => [item.task_id, item.benefit_id ? `benefit-${item.benefit_id}` : null]).filter(Boolean));
  const taskRows = tasks;
  const benefitById = new Map(benefits.map((benefit) => [benefit.id, benefit]));
  const tasksByBenefit = new Map<string, typeof taskRows>();
  for (const task of taskRows) {
    if (!task.benefit_id) continue;
    const group = tasksByBenefit.get(task.benefit_id) ?? [];
    group.push(task);
    tasksByBenefit.set(task.benefit_id, group);
  }
  const contractById = new Map(contracts.map((contract) => [contract.id, contract]));
  const counted = new Set<string>();
  benefits.forEach((benefit) => {
    const sponsorId = benefit.sponsor_id ?? (benefit.contract_id ? contractById.get(benefit.contract_id)?.sponsor_id : undefined);
    if (!sponsorId || !assignmentKeys.has(`${benefit.event_id}:${sponsorId}`)) return;
    const key = `${benefit.event_id}:${sponsorId}:${normalizeBenefitTitle(benefit.title)}`;
    if (counted.has(key)) return;
    counted.add(key);
    const metrics = result[benefit.event_id];
    metrics.benefits += 1;
    if (benefit.completion_required === false) return;
    metrics.trackedBenefits += 1;
    const workflowCount = benefitWorkflowCount(benefit.quantity, benefit.tasks_per_unit !== false);
    const subtasks = (tasksByBenefit.get(benefit.id) ?? []).filter((task) => task.workflow_instance <= workflowCount);
    if (subtasks.length) {
      if (subtasks.every((task) => task.status === "Erledigt" || evidenceKeys.has(task.id))) metrics.completed += 1;
      return;
    }
    metrics.evidenceTasks += 1;
    const complete = isCompletedBenefitStatus(benefit.status) || hasBenefitEvidence(benefit.evidence_summary) || evidenceKeys.has(`benefit-${benefit.id}`);
    if (complete) { metrics.completed += 1; metrics.completedEvidenceTasks += 1; }
  });
  const noCompletionBenefitIds = new Set(benefits.filter((benefit) => benefit.completion_required === false).map((benefit) => benefit.id));
  tasks.forEach((task) => {
    if (!task.event_id || !result[task.event_id] || (task.benefit_id && noCompletionBenefitIds.has(task.benefit_id))) return;
    const benefit = task.benefit_id ? benefitById.get(task.benefit_id) : undefined;
    if (benefit && task.workflow_instance > (benefitWorkflowCount(benefit.quantity, benefit.tasks_per_unit !== false))) return;
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
