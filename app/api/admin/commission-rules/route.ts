import { NextResponse } from "next/server";
import { createAdminClient, getAuthorizedPlatformAdmin } from "@/lib/supabase/admin";
const products = new Set(["all_events", "contracts_5", "contracts_7", "contracts_10", "contracts_15", "enterprise"]);
export async function GET() {
  const auth = await getAuthorizedPlatformAdmin();
  if (auth.responseStatus) return NextResponse.json({ error: "Kein Zugriff." }, { status: auth.responseStatus });
  const admin = createAdminClient();
  const [{ data: rules, error }, { data: settings }] = await Promise.all([admin.from("partner_commission_rules").select("*").order("valid_from", { ascending: false }), admin.from("partner_attribution_settings").select("attribution_window_days").eq("singleton", true).single()]);
  if (error) return NextResponse.json({ error: "Provisionsregeln konnten nicht geladen werden." }, { status: 500 });
  return NextResponse.json({ rules, settings });
}
export async function POST(request: Request) {
  const auth = await getAuthorizedPlatformAdmin();
  if (auth.responseStatus) return NextResponse.json({ error: "Kein Zugriff." }, { status: auth.responseStatus });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (body?.kind === "settings") {
    const days = Number(body.attributionWindowDays);
    if (!Number.isInteger(days) || days < 1 || days > 365) return NextResponse.json({ error: "Das Attributionsfenster muss zwischen 1 und 365 Tagen liegen." }, { status: 400 });
    const admin = createAdminClient();
    const { error } = await admin.from("partner_attribution_settings").update({ attribution_window_days: days, updated_at: new Date().toISOString(), updated_by: auth.user!.id }).eq("singleton", true);
    if (error) return NextResponse.json({ error: "Einstellung konnte nicht gespeichert werden." }, { status: 500 });
    await admin.from("partner_commission_audit").insert({ actor_user_id: auth.user!.id, entity_type: "settings", entity_id: "00000000-0000-0000-0000-000000000000", action: "attribution_window_updated", after_data: { days } });
    return NextResponse.json({ ok: true });
  }
  if (!body || typeof body.name !== "string" || !products.has(String(body.productCode)) || !["percentage", "fixed"].includes(String(body.model))) return NextResponse.json({ error: "Bitte prüfe Produkt, Name und Provisionsmodell." }, { status: 400 });
  const value = Number(body.value);
  if (!Number.isFinite(value) || value <= 0 || (body.model === "percentage" && value > 100)) return NextResponse.json({ error: "Der Satz muss größer als 0 sein; prozentual höchstens 100." }, { status: 400 });
  const validFrom = typeof body.validFrom === "string" ? new Date(body.validFrom) : new Date();
  const validUntil = typeof body.validUntil === "string" && body.validUntil ? new Date(body.validUntil) : null;
  if (!Number.isFinite(validFrom.getTime()) || (validUntil && (!Number.isFinite(validUntil.getTime()) || validUntil <= validFrom))) return NextResponse.json({ error: "Der Gültigkeitszeitraum ist ungültig." }, { status: 400 });
  const admin = createAdminClient();
  const { data, error } = await admin.from("partner_commission_rules").insert({ name: body.name.trim().slice(0, 120), product_code: body.productCode, commission_model: body.model, commission_value: value, calculation_basis: "confirmed_net_amount", valid_from: validFrom.toISOString(), valid_until: validUntil?.toISOString() ?? null, applies_to_enterprise: body.productCode === "enterprise" || body.productCode === "all_events", is_active: true, created_by: auth.user!.id }).select().single();
  if (error) return NextResponse.json({ error: "Provisionsregel konnte nicht gespeichert werden." }, { status: 500 });
  await admin.from("partner_commission_audit").insert({ actor_user_id: auth.user!.id, entity_type: "rule", entity_id: data.id, action: "created", after_data: data });
  return NextResponse.json({ rule: data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await getAuthorizedPlatformAdmin();
  if (auth.responseStatus) return NextResponse.json({ error: "Kein Zugriff." }, { status: auth.responseStatus });
  const body = await request.json().catch(() => null) as { id?: unknown; isActive?: unknown; name?: unknown; model?: unknown; value?: unknown; validFrom?: unknown; validUntil?: unknown } | null;
  if (typeof body?.id !== "string" || (body.isActive !== undefined && typeof body.isActive !== "boolean")) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  const admin = createAdminClient();
  const { data: before } = await admin.from("partner_commission_rules").select("*").eq("id", body.id).maybeSingle();
  if (!before) return NextResponse.json({ error: "Regel nicht gefunden." }, { status: 404 });
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.isActive === "boolean") update.is_active = body.isActive;
  if (body.name !== undefined) { if (typeof body.name !== "string" || !body.name.trim()) return NextResponse.json({ error: "Bitte gib eine Bezeichnung ein." }, { status: 400 }); update.name = body.name.trim().slice(0, 120); }
  if (body.model !== undefined || body.value !== undefined) {
    if (!["percentage", "fixed"].includes(String(body.model))) return NextResponse.json({ error: "Provisionsmodell ungültig." }, { status: 400 });
    const value = Number(body.value);
    if (!Number.isFinite(value) || value <= 0 || (body.model === "percentage" && value > 100)) return NextResponse.json({ error: "Provisionssatz ungültig." }, { status: 400 });
    update.commission_model = body.model; update.commission_value = value;
  }
  if (body.validFrom !== undefined || body.validUntil !== undefined) {
    const validFrom = body.validFrom === undefined ? new Date(before.valid_from) : new Date(String(body.validFrom));
    const validUntil = body.validUntil === undefined || body.validUntil === "" ? null : new Date(String(body.validUntil));
    if (!Number.isFinite(validFrom.getTime()) || (validUntil && (!Number.isFinite(validUntil.getTime()) || validUntil <= validFrom))) return NextResponse.json({ error: "Gültigkeitszeitraum ungültig." }, { status: 400 });
    update.valid_from = validFrom.toISOString(); update.valid_until = validUntil?.toISOString() ?? null;
  }
  const { data: after, error } = await admin.from("partner_commission_rules").update(update).eq("id", body.id).select().single();
  if (error) return NextResponse.json({ error: "Regel konnte nicht geändert werden." }, { status: 500 });
  await admin.from("partner_commission_audit").insert({ actor_user_id: auth.user!.id, entity_type: "rule", entity_id: before.id, action: typeof body.isActive === "boolean" ? (body.isActive ? "activated" : "deactivated") : "updated", before_data: before, after_data: after });
  return NextResponse.json({ rule: after });
}

export async function DELETE(request: Request) {
  const auth = await getAuthorizedPlatformAdmin();
  if (auth.responseStatus) return NextResponse.json({ error: "Kein Zugriff." }, { status: auth.responseStatus });
  const body = await request.json().catch(() => null) as { id?: unknown } | null;
  if (typeof body?.id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.id)) {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: before, error: lookupError } = await admin
    .from("partner_commission_rules")
    .select("*")
    .eq("id", body.id)
    .maybeSingle();
  if (lookupError) return NextResponse.json({ error: "Provisionsregel konnte nicht geladen werden." }, { status: 500 });
  if (!before) return NextResponse.json({ error: "Regel nicht gefunden." }, { status: 404 });

  const { error: deleteError } = await admin
    .from("partner_commission_rules")
    .delete()
    .eq("id", body.id);
  if (deleteError) return NextResponse.json({ error: "Provisionsregel konnte nicht gelöscht werden." }, { status: 500 });

  const { error: auditError } = await admin.from("partner_commission_audit").insert({
    actor_user_id: auth.user!.id,
    entity_type: "rule",
    entity_id: before.id,
    action: "deleted",
    before_data: before,
  });
  return NextResponse.json({ ok: true, auditWarning: Boolean(auditError) });
}
