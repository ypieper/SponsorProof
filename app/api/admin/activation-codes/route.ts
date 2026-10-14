import { NextResponse } from "next/server";
import { activationCodeHint, createActivationCode, decryptActivationCode, encryptActivationCode, hashActivationCode } from "@/lib/activation-codes";
import { createAdminClient, getAuthorizedPlatformAdmin } from "@/lib/supabase/admin";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET() {
  const auth = await getAuthorizedPlatformAdmin();
  if (auth.responseStatus) return NextResponse.json({ error: "Kein Zugriff auf die Codeverwaltung." }, { status: auth.responseStatus });

  const admin = createAdminClient();
  const [{ data: codes, error: codeError }, { data: organizations }, { data: events }, { data: plans }] = await Promise.all([
    admin.from("activation_codes").select("id, code_hint, code_encrypted, plan_code, is_active, expires_at, max_uses, use_count, organization_id, event_id, internal_note, created_at, created_by, deactivated_at").order("created_at", { ascending: false }),
    admin.from("organizations").select("id, name"),
    admin.from("events").select("id, title, organization_id"),
    admin.from("event_plans").select("code, name, price_cents, max_sponsors, features").in("code", ["event", "event_pro"]).order("price_cents"),
  ]);
  if (codeError) return NextResponse.json({ error: "Freischaltcodes konnten nicht geladen werden." }, { status: 500 });

  const organizationNames = new Map((organizations ?? []).map((item) => [item.id, item.name]));
  const eventNames = new Map((events ?? []).map((item) => [item.id, item.title]));
  return NextResponse.json({ organizations: organizations ?? [], events: events ?? [], plans: plans ?? [], codes: (codes ?? []).map((item) => {
    let code: string | null = null;
    if (item.code_encrypted) {
      try { code = decryptActivationCode(item.code_encrypted); } catch { /* Legacy encryption keys may no longer be available. */ }
    }
    const { code_encrypted: _encrypted, ...record } = item;
    return {
      ...record,
      code,
      organization_name: item.organization_id ? organizationNames.get(item.organization_id) ?? "Nicht gefunden" : null,
      event_name: item.event_id ? eventNames.get(item.event_id) ?? "Nicht gefunden" : null,
    };
  }) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const auth = await getAuthorizedPlatformAdmin();
  if (auth.responseStatus) return NextResponse.json({ error: "Kein Zugriff auf die Codeverwaltung." }, { status: auth.responseStatus });

  const body = await request.json().catch(() => null) as {
    plan?: unknown; maxUses?: unknown; expiresAt?: unknown; organizationId?: unknown; eventId?: unknown; internalNote?: unknown;
  } | null;
  if (!body || (body.plan !== "event" && body.plan !== "event_pro")) return NextResponse.json({ error: "Bitte wähle einen gültigen Tarif aus." }, { status: 400 });
  const maxUses = body.maxUses === null || body.maxUses === "" || body.maxUses === undefined ? null : Number(body.maxUses);
  if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 100000)) return NextResponse.json({ error: "Die maximale Nutzung muss zwischen 1 und 100.000 liegen." }, { status: 400 });
  const expiresAt = typeof body.expiresAt === "string" && body.expiresAt ? new Date(body.expiresAt) : null;
  if (expiresAt && !Number.isFinite(expiresAt.getTime())) return NextResponse.json({ error: "Das Ablaufdatum ist ungültig." }, { status: 400 });
  if (expiresAt && expiresAt.getTime() <= Date.now()) return NextResponse.json({ error: "Das Ablaufdatum muss in der Zukunft liegen." }, { status: 400 });
  const organizationId = typeof body.organizationId === "string" && body.organizationId ? body.organizationId : null;
  const eventId = typeof body.eventId === "string" && body.eventId ? body.eventId : null;
  if ((organizationId && !uuidPattern.test(organizationId)) || (eventId && !uuidPattern.test(eventId))) return NextResponse.json({ error: "Organisation oder Event ist ungültig." }, { status: 400 });

  const admin = createAdminClient();
  let boundOrganizationId = organizationId;
  if (eventId) {
    const { data: event, error } = await admin.from("events").select("id, organization_id").eq("id", eventId).maybeSingle();
    if (error || !event) return NextResponse.json({ error: "Das ausgewählte Event wurde nicht gefunden." }, { status: 400 });
    if (boundOrganizationId && boundOrganizationId !== event.organization_id) return NextResponse.json({ error: "Event und Veranstalterbereich passen nicht zusammen." }, { status: 400 });
    boundOrganizationId = event.organization_id;
  } else if (boundOrganizationId) {
    const { data, error } = await admin.from("organizations").select("id").eq("id", boundOrganizationId).maybeSingle();
    if (error || !data) return NextResponse.json({ error: "Der Veranstalterbereich wurde nicht gefunden." }, { status: 400 });
  }

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = createActivationCode();
    const { data, error } = await admin.from("activation_codes").insert({
      code_hash: hashActivationCode(code),
      code_hint: activationCodeHint(code),
      code_encrypted: encryptActivationCode(code),
      plan_code: body.plan,
      is_active: true,
      max_uses: maxUses,
      expires_at: expiresAt?.toISOString() ?? null,
      organization_id: boundOrganizationId,
      event_id: eventId,
      internal_note: typeof body.internalNote === "string" ? body.internalNote.trim().slice(0, 500) : "",
      created_by: auth.user!.id,
    }).select("id, code_hint, plan_code, is_active, expires_at, max_uses, use_count, organization_id, event_id, internal_note, created_at, deactivated_at").single();

    if (!error && data) return NextResponse.json({ code, record: data }, { status: 201, headers: { "Cache-Control": "no-store" } });
    // The database unique constraint is the final safeguard against concurrent collisions.
    if (error?.code === "23505") continue;
    return NextResponse.json({ error: "Der Freischaltcode konnte nicht erstellt werden." }, { status: 500 });
  }

  return NextResponse.json({ error: "Es konnte kein eindeutiger Freischaltcode erzeugt werden. Bitte versuche es erneut." }, { status: 503 });
}
