import { NextResponse } from "next/server";
import { createAdminClient, isPlatformAdminConfigured } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type DeletionMode = "account" | "organization";
const BUCKET = "sponsorproof-files";

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return NextResponse.json({ error: "Bitte melde dich erneut an." }, { status: 401 });
  if (!isPlatformAdminConfigured()) return NextResponse.json({ error: "Die Kontolöschung ist derzeit nicht verfügbar." }, { status: 503 });

  const admin = createAdminClient();
  const { data: membership, error: membershipError } = await admin.from("organization_members")
    .select("organization_id, role").eq("user_id", user.id).maybeSingle();
  if (membershipError) return NextResponse.json({ error: "Deine Veranstalterzugehörigkeit konnte nicht geprüft werden." }, { status: 500 });

  let ownerCount = 0;
  if (membership?.organization_id) {
    const { count, error } = await admin.from("organization_members").select("user_id", { count: "exact", head: true })
      .eq("organization_id", membership.organization_id).eq("role", "owner");
    if (error) return NextResponse.json({ error: "Die Inhaber des Veranstalterbereichs konnten nicht geprüft werden." }, { status: 500 });
    ownerCount = count ?? 0;
  }

  const canDeleteAccount = !membership || (ownerCount > 0 && (membership.role !== "owner" || ownerCount > 1));
  return NextResponse.json({
    email: user.email ?? "",
    role: membership?.role ?? null,
    ownerCount,
    canDeleteAccount,
    canDeleteOrganization: membership?.role === "owner",
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return NextResponse.json({ error: "Bitte melde dich erneut an." }, { status: 401 });
  if (!isPlatformAdminConfigured()) return NextResponse.json({ error: "Die Kontolöschung ist derzeit nicht verfügbar." }, { status: 503 });

  const body = await request.json().catch(() => null) as {
    mode?: unknown;
    confirmationPhrase?: unknown;
    confirmed?: unknown;
  } | null;
  if (!body || (body.mode !== "account" && body.mode !== "organization") || body.confirmed !== true) {
    return NextResponse.json({ error: "Bitte bestätige die Löschung durch Eingabe und Checkbox." }, { status: 400 });
  }
  const mode = body.mode as DeletionMode;
  const expectedPhrase = mode === "account" ? "KONTO LÖSCHEN" : "VERANSTALTERBEREICH LÖSCHEN";
  if (body.confirmationPhrase !== expectedPhrase) {
    return NextResponse.json({ error: `Bitte gib exakt „${expectedPhrase}“ ein.` }, { status: 400 });
  }

  const admin = createAdminClient();
  if (mode === "account") {
    const { error: pendingCleanupError } = await drainUserStorageQueue(admin, user.id);
    if (pendingCleanupError) {
      return NextResponse.json({ error: "Eine zuvor angeforderte Dateilöschung ist noch nicht abgeschlossen. Bitte versuche es erneut." }, { status: 503 });
    }
    const { data: prepared, error: prepareError } = await admin.rpc("prepare_account_deletion", { target_user_id: user.id });
    if (prepareError) {
      const text = prepareError.message.includes("LAST_WORKSPACE_OWNER")
        ? "Du bist die letzte Inhaberin oder der letzte Inhaber. Übertrage zuerst die Inhaberschaft oder lösche stattdessen den gesamten Veranstalterbereich."
        : prepareError.message.includes("NO_WORKSPACE_OWNER")
          ? "Im Veranstalterbereich muss mindestens ein Inhaber bleiben. Bitte lass zuerst eine Person zur Inhaberin oder zum Inhaber ernennen."
          : "Die Löschung kann gerade nicht vorbereitet werden. Bitte versuche es erneut.";
      return NextResponse.json({ error: text }, { status: 409 });
    }

    const previousRole = (prepared as { previous_role?: unknown } | null)?.previous_role;
    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) {
      if (previousRole === "owner") {
        const organizationId = (prepared as { organization_id?: unknown } | null)?.organization_id;
        if (typeof organizationId === "string") {
          await admin.from("organization_members").update({ role: "owner" })
            .eq("organization_id", organizationId).eq("user_id", user.id);
        }
      }
      return NextResponse.json({ error: "Dein Konto konnte nicht gelöscht werden. Deine Mitgliedschaft wurde wiederhergestellt. Bitte versuche es erneut." }, { status: 500 });
    }
    return NextResponse.json({ ok: true, mode });
  }

  const { data: organizationId, error: organizationDeleteError } = await admin.rpc("delete_organization_for_owner", {
    target_user_id: user.id,
    confirmation_phrase: expectedPhrase,
  });
  if (organizationDeleteError || typeof organizationId !== "string") {
    const message = organizationDeleteError?.message ?? "Veranstalterbereich konnte nicht gelöscht werden.";
    const text = message.includes("OWNER_REQUIRED")
      ? "Nur eine Inhaberin oder ein Inhaber kann den gesamten Veranstalterbereich löschen."
      : message.includes("WORKSPACE_NOT_FOUND")
        ? "Der Veranstalterbereich wurde bereits gelöscht oder ist nicht verfügbar."
        : "Der Veranstalterbereich konnte nicht gelöscht werden. Bitte versuche es erneut.";
    return NextResponse.json({ error: text }, { status: 409 });
  }

  const { error: cleanupError } = await drainOrganizationStorageQueue(admin, organizationId);
  if (cleanupError) {
    return NextResponse.json({ error: "Der Veranstalterbereich wurde gelöscht, aber einige Dateien konnten noch nicht entfernt werden. Bitte versuche es erneut oder wende dich an den Support." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, mode });
}

async function drainOrganizationStorageQueue(admin: ReturnType<typeof createAdminClient>, organizationId: string) {
  const { data: files, error: listError } = await admin.from("account_deletion_storage_queue")
    .select("id, bucket_id, object_name").eq("organization_id", organizationId).order("id");
  if (listError) return { error: listError };

  for (let index = 0; index < (files ?? []).length; index += 100) {
    const batch = files!.slice(index, index + 100);
    const byBucket = new Map<string, typeof batch>();
    for (const item of batch) byBucket.set(item.bucket_id, [...(byBucket.get(item.bucket_id) ?? []), item]);
    for (const [bucket, items] of byBucket) {
      const { error: removeError } = await admin.storage.from(bucket).remove(items.map((item) => item.object_name));
      if (removeError) return { error: removeError };
      const { error: queueError } = await admin.from("account_deletion_storage_queue").delete().in("id", items.map((item) => item.id));
      if (queueError) return { error: queueError };
    }
  }
  return { error: null };
}

async function drainUserStorageQueue(admin: ReturnType<typeof createAdminClient>, userId: string) {
  const { data, error } = await admin.from("account_deletion_storage_queue")
    .select("organization_id").eq("requested_by", userId);
  if (error) return { error };
  const organizationIds = [...new Set((data ?? []).map((item) => item.organization_id))];
  for (const organizationId of organizationIds) {
    const result = await drainOrganizationStorageQueue(admin, organizationId);
    if (result.error) return result;
  }
  return { error: null };
}
