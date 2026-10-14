import { createClient } from "@/lib/supabase/client";

export type StoredTaskRecord = { id: string; organization_id: string; event_id: string | null; sponsor_id: string | null; sponsor_name: string; benefit_id: string | null; title: string; description: string; due_at: string | null; status: string; source: string; created_at: string };
export type TaskInput = { title: string; eventId?: string; sponsorId?: string; sponsorName?: string; dueAt?: string; source?: "Manuell" | "Leistung"; benefitId?: string };

export async function fetchStoredTasks(eventId?: string) {
  let query = createClient().from("tasks").select("id, organization_id, event_id, sponsor_id, sponsor_name, benefit_id, title, description, due_at, status, source, created_at").order("due_at", { ascending: true, nullsFirst: false });
  if (eventId) query = query.eq("event_id", eventId);
  const { data, error } = await query;
  return { data: (data ?? []) as StoredTaskRecord[], error };
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
    title: input.title,
    due_at: input.dueAt || null,
    status: "Offen",
    source: input.source ?? "Manuell",
  }).select("id, organization_id, event_id, sponsor_id, sponsor_name, benefit_id, title, description, due_at, status, source, created_at").single();
  return { data: data as StoredTaskRecord | null, error };
}

export async function updateStoredTask(id: string, changes: { title?: string; dueAt?: string | null; status?: string; eventId?: string | null }) {
  const update: Record<string, unknown> = {};
  if (changes.title !== undefined) update.title = changes.title;
  if (changes.dueAt !== undefined) update.due_at = changes.dueAt;
  if (changes.status !== undefined) update.status = changes.status;
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
