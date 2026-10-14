import { NextResponse } from "next/server";
import { createAdminClient, getAuthorizedPlatformAdmin } from "@/lib/supabase/admin";

type Context = { params: Promise<{ id: string }> };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(request: Request, context: Context) {
  const auth = await getAuthorizedPlatformAdmin();
  if (auth.responseStatus) return NextResponse.json({ error: "Kein Zugriff auf die Codeverwaltung." }, { status: auth.responseStatus });
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as { isActive?: unknown } | null;
  if (!body || body.isActive !== false || !uuidPattern.test(id)) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  const { error } = await createAdminClient().from("activation_codes").update({ is_active: false, deactivated_at: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ error: "Der Freischaltcode konnte nicht deaktiviert werden." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
