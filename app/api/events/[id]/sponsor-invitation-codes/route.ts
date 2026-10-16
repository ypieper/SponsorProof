import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type Context = { params: Promise<{ id: string }> };
const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export async function GET(_request: Request, context: Context) {
  const { id: eventId } = await context.params;
  if (!isUuid(eventId)) return NextResponse.json({ error: "Ungültiges Event." }, { status: 400 });
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Bitte melde dich erneut an." }, { status: 401 });
  const { data: ownsEvent, error: accessError } = await supabase.rpc("owns_event", { target_event_id: eventId });
  if (accessError) return NextResponse.json({ error: "Der Zugriff auf das Event konnte nicht geprüft werden." }, { status: 500 });
  if (!ownsEvent) return NextResponse.json({ error: "Du hast keinen Zugriff auf dieses Event." }, { status: 403 });

  const admin = createAdminClient();
  const { data, error } = await admin.from("sponsor_event_codes")
    .select("sponsor_id, code_value, redeemed_at, created_at")
    .eq("event_id", eventId)
    .not("code_value", "is", null)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Einladungscodes konnten nicht geladen werden." }, { status: 500 });
  const seenSponsors = new Set<string>();
  const codes = (data ?? []).flatMap((item) => {
    if (!item.code_value || seenSponsors.has(item.sponsor_id)) return [];
    seenSponsors.add(item.sponsor_id);
    return [{ sponsorId: item.sponsor_id, code: item.code_value, redeemedAt: item.redeemed_at }];
  });
  return NextResponse.json({ codes }, { headers: { "Cache-Control": "no-store" } });
}
