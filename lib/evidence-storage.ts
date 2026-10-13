import { createClient } from "@/lib/supabase/client";

export type StoredEvidence = { id: string; taskId: string; benefitId?: string; name: string; type: string; storagePath: string; eventId?: string };
type EvidenceRow = { id: string; event_id: string | null; benefit_id: string | null; task_id: string | null; storage_path: string; file_name: string; content_type: string };

function taskKey(row: EvidenceRow) {
  return row.benefit_id ? `benefit-${row.benefit_id}` : row.task_id ?? "";
}

function fromRow(row: EvidenceRow): StoredEvidence {
  return { id: row.id, taskId: taskKey(row), benefitId: row.benefit_id ?? undefined, name: row.file_name, type: row.content_type, storagePath: row.storage_path, eventId: row.event_id ?? undefined };
}

export async function fetchStoredEvidence() {
  const { data, error } = await createClient().from("evidence_files").select("id, event_id, benefit_id, task_id, storage_path, file_name, content_type").order("created_at", { ascending: true });
  return { data: (data ?? []).map((row) => fromRow(row as EvidenceRow)), error };
}

export async function uploadStoredEvidence(input: { file: File; eventId?: string; taskId: string; benefitId?: string }) {
  const supabase = createClient();
  const { data: organizationId, error: organizationError } = await supabase.rpc("current_organization_id");
  if (organizationError || typeof organizationId !== "string") return { data: null, error: organizationError ?? new Error("Veranstalterbereich nicht gefunden.") };
  const safeName = input.file.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
  const storagePath = `${organizationId}/evidence/${crypto.randomUUID()}-${safeName}`;
  const { error: uploadError } = await supabase.storage.from("sponsorproof-files").upload(storagePath, input.file, { contentType: input.file.type || "application/octet-stream", upsert: false });
  if (uploadError) return { data: null, error: uploadError };
  const benefitId = input.benefitId || (input.taskId.startsWith("benefit-") ? input.taskId.slice("benefit-".length) : undefined);
  const { data, error } = await supabase.from("evidence_files").insert({
    organization_id: organizationId,
    event_id: input.eventId || null,
    benefit_id: benefitId || null,
    task_id: benefitId ? null : input.taskId,
    storage_path: storagePath,
    file_name: input.file.name,
    content_type: input.file.type || "application/octet-stream",
  }).select("id, event_id, benefit_id, task_id, storage_path, file_name, content_type").single();
  if (error || !data) {
    await supabase.storage.from("sponsorproof-files").remove([storagePath]);
    return { data: null, error: error ?? new Error("Nachweis-Metadaten konnten nicht gespeichert werden.") };
  }
  return { data: fromRow(data as EvidenceRow), error: null };
}

export async function downloadStoredEvidence(evidence: StoredEvidence) {
  const { data, error } = await createClient().storage.from("sponsorproof-files").download(evidence.storagePath);
  return { data, error };
}

export async function deleteStoredEvidenceRecord(evidence: StoredEvidence) {
  const supabase = createClient();
  const { error } = await supabase.from("evidence_files").delete().eq("id", evidence.id);
  if (error) return { error };
  const { error: storageError } = await supabase.storage.from("sponsorproof-files").remove([evidence.storagePath]);
  return { error: storageError };
}
