import { NextResponse } from "next/server";
import { createAdminClient, getAuthorizedPlatformAdmin } from "@/lib/supabase/admin";

export async function GET() {
  const auth = await getAuthorizedPlatformAdmin();
  if (auth.responseStatus) return NextResponse.json({ error: "Kein Zugriff auf die Enterprise-Verwaltung." }, { status: auth.responseStatus });

  const admin = createAdminClient();
  const [{ data: organizations, error: organizationError }, { data: entitlements, error: entitlementError }] = await Promise.all([
    admin.from("organizations").select("id, name").order("name"),
    admin.from("organization_entitlements").select("organization_id, is_active, activated_at, expires_at, annual_fee_cents, invoice_reference, internal_note, created_at, updated_at, activated_by").order("updated_at", { ascending: false }),
  ]);
  if (organizationError || entitlementError) return NextResponse.json({ error: "Enterprise-Freischaltungen konnten nicht geladen werden. Prüfe die Datenbankmigration." }, { status: 500 });

  const names = new Map((organizations ?? []).map((item) => [item.id, item.name]));
  return NextResponse.json({
    organizations: organizations ?? [],
    entitlements: (entitlements ?? []).map((item) => ({ ...item, organization_name: names.get(item.organization_id) ?? "Nicht gefunden" })),
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const auth = await getAuthorizedPlatformAdmin();
  if (auth.responseStatus) return NextResponse.json({ error: "Kein Zugriff auf die Enterprise-Verwaltung." }, { status: auth.responseStatus });

  const body = await request.json().catch(() => null) as {
    organizationId?: unknown; annualFeeCents?: unknown; expiresAt?: unknown; invoiceReference?: unknown; internalNote?: unknown;
  } | null;
  if (!body || typeof body.organizationId !== "string" || !body.organizationId) return NextResponse.json({ error: "Bitte wähle einen Veranstalterbereich aus." }, { status: 400 });
  const annualFeeCents = Number(body.annualFeeCents);
  if (!Number.isSafeInteger(annualFeeCents) || annualFeeCents < 1) return NextResponse.json({ error: "Bitte gib eine gültige Jahresgebühr ein." }, { status: 400 });
  const expiresAt = typeof body.expiresAt === "string" ? new Date(body.expiresAt) : null;
  if (!expiresAt || !Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) return NextResponse.json({ error: "Bitte gib ein gültiges Ablaufdatum in der Zukunft ein." }, { status: 400 });

  const admin = createAdminClient();
  const { data: organization, error: lookupError } = await admin.from("organizations").select("id").eq("id", body.organizationId).maybeSingle();
  if (lookupError || !organization) return NextResponse.json({ error: "Der Veranstalterbereich wurde nicht gefunden." }, { status: 400 });

  const { error } = await admin.from("organization_entitlements").upsert({
    organization_id: organization.id,
    is_active: true,
    activated_at: new Date().toISOString(),
    expires_at: expiresAt.toISOString(),
    annual_fee_cents: annualFeeCents,
    invoice_reference: typeof body.invoiceReference === "string" ? body.invoiceReference.trim().slice(0, 120) || null : null,
    internal_note: typeof body.internalNote === "string" ? body.internalNote.trim().slice(0, 500) : "",
    activated_by: auth.user!.id,
    updated_at: new Date().toISOString(),
  }, { onConflict: "organization_id" });
  if (error) return NextResponse.json({ error: "Die Enterprise-Freischaltung konnte nicht gespeichert werden." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request) {
  const auth = await getAuthorizedPlatformAdmin();
  if (auth.responseStatus) return NextResponse.json({ error: "Kein Zugriff auf die Enterprise-Verwaltung." }, { status: auth.responseStatus });

  const body = await request.json().catch(() => null) as { organizationId?: unknown; isActive?: unknown } | null;
  if (!body || typeof body.organizationId !== "string" || body.isActive !== false) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  const admin = createAdminClient();
  const { error } = await admin.from("organization_entitlements").update({ is_active: false, updated_at: new Date().toISOString() }).eq("organization_id", body.organizationId);
  if (error) return NextResponse.json({ error: "Die Enterprise-Freischaltung konnte nicht deaktiviert werden." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
