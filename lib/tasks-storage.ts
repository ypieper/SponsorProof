import { createClient } from "@/lib/supabase/client";

export type CompletionType = "file_required" | "organizer_approval" | "sponsor_approval" | "sponsor_upload";
export type StoredTaskRecord = { id: string; organization_id: string; event_id: string | null; sponsor_id: string | null; sponsor_name: string; benefit_id: string | null; assigned_to: string | null; assigned_to_sponsor: boolean; template_task_id: string | null; workflow_order: number | null; workflow_instance: number; completion_type: CompletionType; requires_sponsor_approval: boolean; sponsor_approval_status: string; sponsor_approved_at: string | null; publish_ready: boolean; title: string; description: string; due_at: string | null; status: string; source: string; created_at: string };
export type TaskInput = { title: string; eventId?: string; sponsorId?: string; sponsorName?: string; dueAt?: string; source?: "Manuell" | "Leistung"; benefitId?: string; assignedTo?: string; assignedToSponsor?: boolean; templateTaskId?: string; workflowOrder?: number; workflowInstance?: number; completionType?: CompletionType };
const taskSelect = "id, organization_id, event_id, sponsor_id, sponsor_name, benefit_id, assigned_to, assigned_to_sponsor, template_task_id, workflow_order, workflow_instance, completion_type, requires_sponsor_approval, sponsor_approval_status, sponsor_approved_at, publish_ready, title, description, due_at, status, source, created_at";

export async function fetchStoredTasks(eventId?: string) {
  const supabase = createClient();
  let query = supabase.from("tasks").select(taskSelect).order("due_at", { ascending: true, nullsFirst: false });
  if (eventId) query = query.eq("event_id", eventId);
  const { data, error } = await query;
  if (!error) return { data: (data ?? []) as StoredTaskRecord[], error: null };

  let legacyQuery = supabase.from("tasks")
    .select("id, organization_id, event_id, sponsor_id, sponsor_name, benefit_id, assigned_to, template_task_id, workflow_order, requires_sponsor_approval, sponsor_approval_status, sponsor_approved_at, publish_ready, title, description, due_at, status, source, created_at")
    .order("due_at", { ascending: true, nullsFirst: false });
  if (eventId) legacyQuery = legacyQuery.eq("event_id", eventId);
  const legacy = await legacyQuery;
  if (legacy.error) return { data: [] as StoredTaskRecord[], error: legacy.error };
  const normalized = (legacy.data ?? []).map((task) => ({
    ...task,
    assigned_to_sponsor: false,
    workflow_instance: 1,
    completion_type: task.requires_sponsor_approval ? "sponsor_approval" : "file_required",
  })) as StoredTaskRecord[];
  return { data: normalized, error: null };
}

export async function createStoredTask(input: TaskInput) {
  const supabase = createClient();
  const { data: organizationId, error: organizationError } = await supabase.rpc("current_organization_id");
  if (organizationError || typeof organizationId !== "string") return { data: null, error: organizationError ?? new Error("Veranstalterbereich nicht gefunden.") };
  const { data, error } = await supabase.from("tasks").insert({
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
    source: input.source ?? "Manuell",
  }).select(taskSelect).single();
  return { data: data as StoredTaskRecord | null, error };
}

export async function createStoredTasks(inputs: TaskInput[]) {
  if (!inputs.length) return { data: [] as StoredTaskRecord[], error: null };
  const supabase = createClient();
  const { data: organizationId, error: organizationError } = await supabase.rpc("current_organization_id");
  if (organizationError || typeof organizationId !== "string") return { data: [] as StoredTaskRecord[], error: organizationError ?? new Error("Veranstalterbereich nicht gefunden.") };
  const { data, error } = await supabase.from("tasks").insert(inputs.map((input) => ({
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
    source: input.source ?? "Leistung",
  }))).select(taskSelect);
  return { data: (data ?? []) as StoredTaskRecord[], error };
}

export async function updateStoredTask(id: string, changes: { title?: string; sponsorId?: string | null; sponsorName?: string; dueAt?: string | null; status?: string; sponsorApprovalStatus?: string; eventId?: string | null; assignedTo?: string | null; assignedToSponsor?: boolean }) {
  const update: Record<string, unknown> = {};
  if (changes.title !== undefined) update.title = changes.title;
  if (changes.sponsorId !== undefined) update.sponsor_id = changes.sponsorId;
  if (changes.sponsorName !== undefined) update.sponsor_name = changes.sponsorName;
  if (changes.dueAt !== undefined) update.due_at = changes.dueAt;
  if (changes.status !== undefined) update.status = changes.status;
  if (changes.sponsorApprovalStatus !== undefined) update.sponsor_approval_status = changes.sponsorApprovalStatus;
  if (changes.assignedTo !== undefined) update.assigned_to = changes.assignedTo;
  if (changes.assignedToSponsor !== undefined) update.assigned_to_sponsor = changes.assignedToSponsor;
  if (changes.eventId !== undefined) {
    update.event_id = changes.eventId;
    update.sponsor_id = null;
  }
  const { error } = await createClient().from("tasks").update(update).eq("id", id);
  return { error };
}

export async function deleteStoredTask(id: string) {
  return createClient().from("tasks").delete().eq("id", id);
}
