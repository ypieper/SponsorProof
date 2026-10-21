import type { Task } from "./types";

export function applyWorkflowDependencies(tasks: Task[]): Task[] {
  const blockers = new Map<string, string>();
  const currentSteps = new Set<string>();
  const workflows = new Map<string, Task[]>();
  for (const task of tasks) {
    if (task.storedTask && task.benefitId && task.workflowOrder != null) {
      const groupKey = `${task.benefitId}:${task.workflowInstance ?? 1}`;
      const group = workflows.get(groupKey) ?? [];
      group.push(task);
      workflows.set(groupKey, group);
    }
  }
  for (const workflow of workflows.values()) {
    workflow.sort((a, b) => (a.workflowOrder ?? 0) - (b.workflowOrder ?? 0));
    const firstIncomplete = workflow.find((task) => task.status !== "Erledigt");
    if (firstIncomplete) currentSteps.add(firstIncomplete.id);
    for (let index = 1; index < workflow.length; index += 1) {
      const incomplete = workflow.slice(0, index).find((previous) => previous.status !== "Erledigt");
      if (incomplete) blockers.set(workflow[index].id, incomplete.title);
    }
  }
  return tasks.map((task) => ({ ...task, blockedBy: blockers.get(task.id), currentWorkflowStep: currentSteps.has(task.id) }));
}

export function isSponsorApprovalTask(task: Task) {
  return task.completionType === "sponsor_approval" || task.requiresSponsorApproval;
}

export function workflowStatus(tasks: Task[]) {
  if (!tasks.length) return "Offen";
  if (tasks.every((task) => task.status === "Erledigt")) return "Abgeschlossen";
  if (tasks.some((task) => (task.assignedToSponsor || task.completionType === "sponsor_upload") && task.status !== "Erledigt" && !task.blockedBy)) return "Warte auf Sponsor";
  if (tasks.some((task) => isSponsorApprovalTask(task) && task.sponsorApprovalStatus !== "approved" && !task.blockedBy)) return "Warte auf Sponsor";
  if (tasks.some((task) => task.completionType === "organizer_approval" && task.status !== "Erledigt" && !task.blockedBy)) return "Bestätigung erforderlich";
  if (tasks.some((task) => task.completionType === "file_required" && task.status !== "Erledigt" && !task.blockedBy)) return "Datei hochladen";
  return tasks.some((task) => task.status === "Erledigt") ? "In Bearbeitung" : "Offen";
}

export function taskStatus(task: Task, hasEvidence = false) {
  if (task.status === "Erledigt") return "Abgeschlossen";
  if (task.sponsorApprovalStatus === "changes_requested" && !task.blockedBy) return "Warte auf Sponsor";
  if (task.sponsorApprovalStatus === "changes_requested" && task.blockedBy) return "Änderung angefragt";
  if (task.blockedBy) return "Wartet auf Abschluss";
  if (task.assignedToSponsor || task.completionType === "sponsor_upload") return "Warte auf Sponsor";
  if (isSponsorApprovalTask(task)) return task.source === "Manuell" && !hasEvidence ? "Nachweis fehlt" : "Warte auf Sponsor";
  if (task.completionType === "organizer_approval") return "Bestätigung erforderlich";
  if (task.completionType === "file_required" && !hasEvidence) return "Datei hochladen";
  return task.status;
}
