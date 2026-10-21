import type { TaskInput } from "./types";

/** Single and bulk creation must store the same workflow configuration. */
export function taskInsertValues(input: TaskInput, organizationId: string, defaultSource: "Manuell" | "Leistung") {
  return {
    organization_id: organizationId,
    event_id: input.eventId || null,
    sponsor_id: input.sponsorId || null,
    sponsor_name: input.sponsorName || "",
    benefit_id: input.benefitId || null,
    assigned_to: input.assignedTo || null,
    assigned_to_sponsor: input.assignedToSponsor ?? false,
    template_task_id: input.templateTaskId || null,
    workflow_order: input.workflowOrder ?? null,
    workflow_instance: input.workflowInstance ?? 1,
    completion_type: input.completionType ?? "file_required",
    requires_sponsor_approval: input.completionType === "sponsor_approval",
    sponsor_approval_status: input.completionType === "sponsor_approval" ? "pending" : "not_required",
    title: input.title,
    due_at: input.dueAt || null,
    status: "Offen",
    source: input.source ?? defaultSource,
  };
}
