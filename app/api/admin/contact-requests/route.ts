import { NextResponse } from "next/server";
import { createAdminClient, getAuthorizedPlatformAdmin } from "@/lib/supabase/admin";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET() {
  const auth = await getAuthorizedPlatformAdmin();
  if (auth.responseStatus) return NextResponse.json({ error: "Kein Zugriff auf Kontaktanfragen." }, { status: auth.responseStatus });
  const admin = createAdminClient();
  const { data, error } = await admin.from("contact_requests").select("id, user_id, organization_id, name, email, organization_name, subject, message, status, created_at, handled_at").order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Kontaktanfragen konnten nicht geladen werden. Prüfe die Datenbankmigration." }, { status: 500 });
  return NextResponse.json({ requests: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request) {
  const auth = await getAuthorizedPlatformAdmin();
  if (auth.responseStatus) return NextResponse.json({ error: "Kein Zugriff auf Kontaktanfragen." }, { status: auth.responseStatus });
  const body = await request.json().catch(() => null) as { id?: unknown; status?: unknown } | null;
  if (!body || typeof body.id !== "string" || !uuidPattern.test(body.id) || (body.status !== "new" && body.status !== "handled")) {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }
  const admin = createAdminClient();
  const { error } = await admin.from("contact_requests").update({
    status: body.status,
    handled_at: body.status === "handled" ? new Date().toISOString() : null,
    handled_by: body.status === "handled" ? auth.user!.id : null,
  }).eq("id", body.id);
  if (error) return NextResponse.json({ error: "Der Status konnte nicht gespeichert werden." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
