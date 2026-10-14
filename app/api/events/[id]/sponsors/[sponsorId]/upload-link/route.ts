import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { authorizeEventSponsor, decryptSponsorUploadToken, encryptSponsorUploadToken, hashSponsorUploadToken, isUuid } from "@/lib/sponsor-upload-server";
import { createAdminClient } from "@/lib/supabase/admin";

type Context = { params: Promise<{ id: string; sponsorId: string }> };

function errorResponse(reason: "server" | "auth" | "access" | "database") {
  if (reason === "server") return NextResponse.json({ error: "Der Upload-Link ist derzeit nicht verfügbar. Bitte prüfe die Serverkonfiguration." }, { status: 503 });
  if (reason === "auth") return NextResponse.json({ error: "Bitte melde dich erneut an." }, { status: 401 });
  if (reason === "access") return NextResponse.json({ error: "Du hast keinen Zugriff auf diesen Sponsor in diesem Event." }, { status: 403 });
  return NextResponse.json({ error: "Die Berechtigung für diesen Sponsor konnte nicht geprüft werden." }, { status: 500 });
}

export async function GET(_request: Request, context: Context) {
  const { id: eventId, sponsorId } = await context.params;
  if (!isUuid(eventId) || !isUuid(sponsorId)) return NextResponse.json({ error: "Ungültiges Event oder Sponsor." }, { status: 400 });
  const auth = await authorizeEventSponsor(eventId, sponsorId);
  if (auth.error) return errorResponse(auth.error);
  const admin = createAdminClient();
  const { data, error } = await admin.from("sponsor_upload_links")
    .select("id, created_at, expires_at, last_used_at, encrypted_token")
    .eq("event_id", eventId).eq("sponsor_id", sponsorId).eq("is_active", true)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Der Upload-Link-Status konnte nicht geladen werden. Prüfe die Datenbankmigration." }, { status: 500 });
  let token: string | null = null;
  if (data?.encrypted_token) {
    try {
      token = decryptSponsorUploadToken(data.encrypted_token);
    } catch {
      return NextResponse.json({ error: "Der gespeicherte Upload-Link kann nicht entschlüsselt werden. Bitte erzeuge einen neuen Link." }, { status: 500 });
    }
  }
  const activeLink = data ? { id: data.id, created_at: data.created_at, expires_at: data.expires_at, last_used_at: data.last_used_at } : null;
  return NextResponse.json({ activeLink, token }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(_request: Request, context: Context) {
  const { id: eventId, sponsorId } = await context.params;
  if (!isUuid(eventId) || !isUuid(sponsorId)) return NextResponse.json({ error: "Ungültiges Event oder Sponsor." }, { status: 400 });
  const auth = await authorizeEventSponsor(eventId, sponsorId);
  if (auth.error) return errorResponse(auth.error);
  const token = randomBytes(32).toString("base64url");
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("rotate_sponsor_upload_link", {
    target_event_id: eventId,
    target_sponsor_id: sponsorId,
    target_token_hash: hashSponsorUploadToken(token),
    target_encrypted_token: encryptSponsorUploadToken(token),
    target_created_by: auth.user!.id,
  });
  if (error || !data?.length) return NextResponse.json({ error: "Der Upload-Link konnte nicht erstellt werden. Prüfe die Datenbankmigration." }, { status: 500 });
  return NextResponse.json({ token, createdAt: data[0].created_at, expiresAt: data[0].expires_at }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(_request: Request, context: Context) {
  const { id: eventId, sponsorId } = await context.params;
  if (!isUuid(eventId) || !isUuid(sponsorId)) return NextResponse.json({ error: "Ungültiges Event oder Sponsor." }, { status: 400 });
  const auth = await authorizeEventSponsor(eventId, sponsorId);
  if (auth.error) return errorResponse(auth.error);
  const { error } = await createAdminClient().from("sponsor_upload_links")
    .update({ is_active: false })
    .eq("event_id", eventId).eq("sponsor_id", sponsorId).eq("is_active", true);
  if (error) return NextResponse.json({ error: "Der Upload-Link konnte nicht deaktiviert werden." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
