import { NextResponse } from "next/server";
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
