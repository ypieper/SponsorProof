/** Rules shared by event lists, tasks, reports and the sponsor portal. */
export function isCompletedBenefitStatus(status: string) {
  return status === "Erfüllt" || status === "Erledigt" || status === "Abgeschlossen";
}

export function benefitWorkflowCount(quantity: number, tasksPerUnit: boolean = true) {
  return tasksPerUnit && Number.isFinite(quantity) ? Math.max(1, Math.floor(quantity)) : 1;
}

export function hasBenefitEvidence(evidence: string | null | undefined) {
  return Boolean(evidence && evidence !== "Noch kein Nachweis");
}

export function normalizeBenefitTitle(title: string) {
  return title.trim().replace(/\s+/g, " ").toLocaleLowerCase("de-DE");
}

export function sortWorkflowTasks<T extends { workflow_instance: number; workflow_order: number | null }>(tasks: readonly T[]) {
  return [...tasks].sort((a, b) => a.workflow_instance - b.workflow_instance || (a.workflow_order ?? 0) - (b.workflow_order ?? 0));
}

export function getBenefitStatus(
  benefit: { completionRequired?: boolean; status: string; evidence?: string | null },
  tasks: readonly { status: string; assigned_to_sponsor: boolean; completion_type: string; workflow_instance: number; workflow_order: number | null }[],
) {
  if (benefit.completionRequired === false) return "Keine Aufgaben vorgesehen";
  if (!tasks.length) return isCompletedBenefitStatus(benefit.status) || hasBenefitEvidence(benefit.evidence) ? "Erledigt" : "Offen";
  if (tasks.every((task) => task.status === "Erledigt")) return "Erledigt";
  const nextTask = sortWorkflowTasks(tasks).find((task) => task.status !== "Erledigt");
  if (nextTask && (nextTask.assigned_to_sponsor || nextTask.completion_type === "sponsor_upload" || nextTask.completion_type === "sponsor_approval")) return "Wartet auf Sponsor";
  return tasks.some((task) => task.status === "Erledigt") ? "In Bearbeitung" : "Offen";
}
