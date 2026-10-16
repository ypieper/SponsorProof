import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";

export type OrganizationDeletionFailure = { stage: string; message: string };
export type OrganizationDeletionResult = { softDeletedUserCount: number };

function failure(stage: string, error: { message?: string } | null | undefined): OrganizationDeletionFailure {
  return { stage, message: error?.message?.slice(0, 400) || "Unbekannter Fehler." };
}

export async function detachUserAuditReferences(admin: ReturnType<typeof createAdminClient>, userId: string) {
  const [{ error: sponsorFeedbackError }, { error: workflowFeedbackError }, { error: redemptionError }] = await Promise.all([
    admin.from("sponsor_task_feedback").update({ created_by: null }).eq("created_by", userId),
    admin.from("task_workflow_feedback").update({ created_by: null }).eq("created_by", userId),
    admin.from("activation_code_redemptions").update({ user_id: null }).eq("user_id", userId),
  ]);
  return sponsorFeedbackError ?? workflowFeedbackError ?? redemptionError ?? null;
}

async function deleteAuthUser(admin: ReturnType<typeof createAdminClient>, userId: string) {
  const { error: hardDeleteError } = await admin.auth.admin.deleteUser(userId);
  if (!hardDeleteError) return { error: null, softDeleted: false };

  // A hard delete can be blocked by Auth-side references that are not managed
  // by this app. Supabase's soft delete disables the identity and anonymizes
  // its login address while keeping the auth row for those references.
  const { error: softDeleteError } = await admin.auth.admin.deleteUser(userId, true);
  if (!softDeleteError) return { error: null, softDeleted: true };
  return {
    error: { message: `${hardDeleteError.message}; Soft Delete fehlgeschlagen: ${softDeleteError.message}` },
    softDeleted: false,
  };
}

export async function finishOrganizationDeletion(admin: ReturnType<typeof createAdminClient>, jobId: string): Promise<OrganizationDeletionFailure | OrganizationDeletionResult> {
  const { data: job, error: jobError } = await admin.from("admin_organization_deletion_jobs")
    .select("id, organization_id, member_user_ids")
    .eq("id", jobId)
    .maybeSingle();
  if (jobError || !job) return failure("Löschauftrag laden", jobError ?? { message: "Löschauftrag nicht gefunden." });

  const { data: files, error: filesError } = await admin.from("account_deletion_storage_queue")
    .select("id, bucket_id, object_name")
    .eq("organization_id", job.organization_id)
    .order("id");
  if (filesError) return failure("Dateiliste laden", filesError);
  for (let index = 0; index < (files ?? []).length; index += 100) {
    const batch = files!.slice(index, index + 100);
    const byBucket = new Map<string, typeof batch>();
    for (const file of batch) byBucket.set(file.bucket_id, [...(byBucket.get(file.bucket_id) ?? []), file]);
    for (const [bucket, bucketFiles] of byBucket) {
      const { error: storageError } = await admin.storage.from(bucket).remove(bucketFiles.map((file) => file.object_name));
      if (storageError) return failure("Dateien löschen", storageError);
      const { error: queueError } = await admin.from("account_deletion_storage_queue").delete().in("id", bucketFiles.map((file) => file.id));
      if (queueError) return failure("Dateiliste aktualisieren", queueError);
    }
  }

  const memberIds = (job.member_user_ids ?? []) as string[];
  const { data: platformAdmins, error: adminsError } = memberIds.length
    ? await admin.from("platform_admins").select("user_id").in("user_id", memberIds)
    : { data: [], error: null };
  if (adminsError) return failure("Plattform-Admins prüfen", adminsError);
  const preservedAdminIds = new Set((platformAdmins ?? []).map((item) => item.user_id));
  let softDeletedUserCount = 0;
  for (const userId of memberIds) {
    if (preservedAdminIds.has(userId)) continue;
    const { data: userData, error: lookupError } = await admin.auth.admin.getUserById(userId);
    if (lookupError && (lookupError as { status?: number }).status === 404) continue;
    if (lookupError) return failure("Benutzerkonten prüfen", lookupError);
    if (!userData.user) continue;
    const auditError = await detachUserAuditReferences(admin, userId);
    if (auditError) return failure("Benutzerverweise bereinigen", auditError);
    const deletion = await deleteAuthUser(admin, userId);
    if (deletion.error) return failure("Benutzerkonto löschen", deletion.error);
    if (deletion.softDeleted) softDeletedUserCount += 1;
  }

  const { error: jobDeleteError } = await admin.from("admin_organization_deletion_jobs").delete().eq("id", jobId);
  return jobDeleteError ? failure("Löschauftrag abschließen", jobDeleteError) : { softDeletedUserCount };
}
