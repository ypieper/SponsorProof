import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const errors: Record<string, string> = {
  SPONSOR_CODE_INVALID: "Der Einladungscode ist ungültig.",
  SPONSOR_CODE_INVALID_OR_EXPIRED: "Der Einladungscode ist ungültig oder gehört zu einem anderen Sponsor-Konto.",
  SPONSOR_ASSIGNMENT_ALREADY_CLAIMED: "Dieses Event wurde bereits mit einem anderen Sponsor-Konto verknüpft.",
  SPONSOR_ACCOUNT_ACCESS_DENIED: "Dein Sponsor-Konto konnte nicht gefunden werden.",
};

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Bitte melde dich erneut an." }, { status: 401 });
    const body = await request.json().catch(() => null) as { code?: unknown } | null;
    const code = typeof body?.code === "string" ? body.code.replace(/\s+/g, "").toLowerCase() : "";
    if (!/^[0-9a-f]{64}$/.test(code)) return NextResponse.json({ error: "Bitte gib den vollständigen, 64-stelligen Einladungscode ein." }, { status: 400 });
    const { data: memberships, error: membershipError } = await supabase.from("sponsor_account_members").select("account_id").eq("user_id", user.id).order("joined_at", { ascending: true });
    if (membershipError) return NextResponse.json({ error: "Dein Sponsor-Konto konnte nicht geladen werden." }, { status: 500 });
    const accountId = memberships?.[0]?.account_id;
    if (!accountId) return NextResponse.json({ error: "Zu deinem Login gehört noch kein Sponsor-Konto. Bitte registriere dich erneut oder wende dich an den Support." }, { status: 409 });
    const { error } = await supabase.rpc("redeem_sponsor_event_code", { invitation_code: code, target_account_id: accountId });
    if (error) {
      console.error("[sponsor/redeem-code] Redemption RPC failed", {
        code: error.code,
        message: error.message,
      });
      if (error.code === "PGRST202" || error.code === "42883") {
        return NextResponse.json({ error: "Die Code-Einlösung ist in der Datenbank noch nicht eingerichtet. Bitte die ausstehenden Supabase-Migrationen ausführen." }, { status: 503 });
      }
      const key = Object.keys(errors).find((candidate) => error.message.includes(candidate));
      if (key) return NextResponse.json({ error: errors[key] }, { status: 400 });
      const detail = error.code === "P0001"
        ? `Die Datenbank hat die Einlösung abgelehnt: ${error.message}`
        : `Der Einlösedienst meldet einen technischen Fehler (${error.code || "unbekannt"}).`;
      return NextResponse.json({ error: detail }, { status: 400 });
    }
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[sponsor/redeem-code] Unexpected redemption failure", error);
    return NextResponse.json({ error: "Der Einlösedienst ist gerade nicht erreichbar. Bitte lade die Seite neu und versuche es erneut." }, { status: 503 });
  }
}
