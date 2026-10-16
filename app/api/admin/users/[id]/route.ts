import { NextResponse } from "next/server";
import { detachUserAuditReferences } from "@/lib/admin-organization-deletion";
import { getAuthorizedPlatformAdmin } from "@/lib/supabase/admin";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const auth = await getAuthorizedPlatformAdmin();
  if (auth.responseStatus) {
    return NextResponse.json({ error: auth.responseStatus === 503 ? "Die Admin-Verwaltung ist noch nicht eingerichtet." : "Kein Zugriff." }, { status: auth.responseStatus });
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => null) as {
    firstName?: unknown;
    lastName?: unknown;
    organizationId?: unknown;
    workspaceRole?: unknown;
    platformAdmin?: unknown;
    suspended?: unknown;
  } | null;
  if (!body || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id)) {
    return NextResponse.json({ error: "Die Angaben sind ungültig." }, { status: 400 });
  }
  if (id === auth.user!.id && (body.platformAdmin === false || body.suspended === true)) {
    return NextResponse.json({ error: "Dein eigenes Admin-Konto kannst du hier weder herabstufen noch sperren." }, { status: 400 });
  }

  const admin = auth.admin!;
  const { data: existing, error: userError } = await admin.auth.admin.getUserById(id);
  if (userError || !existing.user) return NextResponse.json({ error: "Benutzer nicht gefunden." }, { status: 404 });

  const metadata = { ...existing.user.user_metadata };
  if (body.firstName !== undefined || body.lastName !== undefined) {
    if (typeof body.firstName !== "string" || typeof body.lastName !== "string") {
      return NextResponse.json({ error: "Vor- und Nachname müssen angegeben werden." }, { status: 400 });
    }
    metadata.first_name = body.firstName.trim().slice(0, 80);
    metadata.last_name = body.lastName.trim().slice(0, 80);
    const { error } = await admin.auth.admin.updateUserById(id, { user_metadata: metadata });
    if (error) return NextResponse.json({ error: "Das Profil konnte nicht gespeichert werden." }, { status: 500 });
  }

  if (body.organizationId !== undefined || body.workspaceRole !== undefined) {
    if (typeof body.organizationId !== "string" || !["owner", "member"].includes(String(body.workspaceRole))) {
      return NextResponse.json({ error: "Bitte Veranstalterbereich und Rolle korrekt auswählen." }, { status: 400 });
    }
    const { error } = await admin.from("organization_members").update({ role: body.workspaceRole }).eq("user_id", id).eq("organization_id", body.organizationId);
    if (error) return NextResponse.json({ error: "Die Rolle konnte nicht geändert werden." }, { status: 500 });
  }

  if (typeof body.platformAdmin === "boolean") {
    if (body.platformAdmin) {
      const { error } = await admin.from("platform_admins").upsert({ user_id: id, created_by: auth.user!.id });
      if (error) return NextResponse.json({ error: "Die Admin-Rolle konnte nicht vergeben werden." }, { status: 500 });
    } else {
      const { error } = await admin.from("platform_admins").delete().eq("user_id", id);
      if (error) return NextResponse.json({ error: "Die Admin-Rolle konnte nicht entfernt werden." }, { status: 500 });
    }
  }

  if (typeof body.suspended === "boolean") {
    const { error } = await admin.auth.admin.updateUserById(id, { ban_duration: body.suspended ? "876000h" : "none" });
    if (error) return NextResponse.json({ error: "Der Zugang konnte nicht geändert werden." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, context: Context) {
  const auth = await getAuthorizedPlatformAdmin();
  if (auth.responseStatus) {
    return NextResponse.json({ error: auth.responseStatus === 503 ? "Die Admin-Verwaltung ist noch nicht eingerichtet." : "Kein Zugriff." }, { status: auth.responseStatus });
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => null) as { confirmationPhrase?: unknown; confirmed?: unknown } | null;
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id) || !body || body.confirmationPhrase !== "BENUTZERKONTO LÖSCHEN" || body.confirmed !== true) {
    return NextResponse.json({ error: "Bitte bestätige die Löschung durch Eingabe und Checkbox." }, { status: 400 });
  }
  if (id === auth.user!.id) return NextResponse.json({ error: "Dein eigenes Admin-Konto kannst du hier nicht löschen." }, { status: 400 });

  const admin = auth.admin!;
  const { data: existing, error: userError } = await admin.auth.admin.getUserById(id);
  if (userError || !existing.user) return NextResponse.json({ error: "Benutzer nicht gefunden." }, { status: 404 });

  const [{ data: platformAdmin, error: platformAdminError }, { count: adminCount, error: adminCountError }] = await Promise.all([
    admin.from("platform_admins").select("user_id").eq("user_id", id).maybeSingle(),
    admin.from("platform_admins").select("user_id", { count: "exact", head: true }),
  ]);
  if (platformAdminError || adminCountError) return NextResponse.json({ error: "Die Admin-Rolle konnte nicht geprüft werden." }, { status: 500 });
  if (platformAdmin && (adminCount ?? 0) <= 1) return NextResponse.json({ error: "Das letzte Plattform-Admin-Konto kann nicht gelöscht werden." }, { status: 409 });

  const pendingCleanup = await drainUserStorageQueue(admin, id);
  if (pendingCleanup) return NextResponse.json({ error: "Dateien des Kontos konnten nicht bereinigt werden. Bitte versuche es erneut." }, { status: 503 });

  const { data: prepared, error: prepareError } = await admin.rpc("prepare_account_deletion", { target_user_id: id });
  if (prepareError) {
    const error = prepareError.message.includes("LAST_WORKSPACE_OWNER")
      ? "Das Konto ist die letzte Inhaberin oder der letzte Inhaber dieses Veranstalterbereichs und kann nicht gelöscht werden."
      : prepareError.message.includes("NO_WORKSPACE_OWNER")
        ? "Im Veranstalterbereich muss mindestens ein Inhaber bestehen, bevor dieses Konto gelöscht werden kann."
        : "Die Löschung kann gerade nicht vorbereitet werden. Bitte versuche es erneut.";
    return NextResponse.json({ error }, { status: 409 });
  }

  const previousRole = (prepared as { previous_role?: unknown } | null)?.previous_role;
  const organizationId = (prepared as { organization_id?: unknown } | null)?.organization_id;
  const auditError = await detachUserAuditReferences(admin, id);
  if (auditError) {
    if (previousRole === "owner" && typeof organizationId === "string") {
      await admin.from("organization_members").update({ role: "owner" }).eq("organization_id", organizationId).eq("user_id", id);
    }
    return NextResponse.json({ error: `Benutzerverweise konnten nicht bereinigt werden: ${auditError.message}` }, { status: 500 });
  }
  const { error: deleteError } = await admin.auth.admin.deleteUser(id);
  if (deleteError) {
    if (previousRole === "owner" && typeof organizationId === "string") {
      await admin.from("organization_members").update({ role: "owner" }).eq("organization_id", organizationId).eq("user_id", id);
    }
    return NextResponse.json({ error: "Das Benutzerkonto konnte nicht gelöscht werden. Bitte versuche es erneut." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

async function drainUserStorageQueue(admin: NonNullable<Awaited<ReturnType<typeof getAuthorizedPlatformAdmin>>["admin"]>, userId: string) {
  const { data, error } = await admin.from("account_deletion_storage_queue").select("id, organization_id, bucket_id, object_name").eq("requested_by", userId);
  if (error) return error;
  for (let index = 0; index < (data ?? []).length; index += 100) {
    const batch = data!.slice(index, index + 100);
    const byBucket = new Map<string, typeof batch>();
    for (const item of batch) byBucket.set(item.bucket_id, [...(byBucket.get(item.bucket_id) ?? []), item]);
    for (const [bucket, items] of byBucket) {
      const { error: removeError } = await admin.storage.from(bucket).remove(items.map((item) => item.object_name));
      if (removeError) return removeError;
      const { error: queueError } = await admin.from("account_deletion_storage_queue").delete().in("id", items.map((item) => item.id));
      if (queueError) return queueError;
    }
  }
  return null;
}
