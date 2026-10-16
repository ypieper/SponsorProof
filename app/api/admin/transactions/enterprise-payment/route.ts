import { NextResponse } from "next/server";
import { createAdminClient, getAuthorizedPlatformAdmin } from "@/lib/supabase/admin";
export async function POST(request: Request) {
  const auth = await getAuthorizedPlatformAdmin();
  if (auth.responseStatus) return NextResponse.json({ error: "Kein Zugriff." }, { status: auth.responseStatus });
  const body = await request.json().catch(() => null) as { organizationId?: unknown; grossAmountCents?: unknown; netAmountCents?: unknown; invoiceReference?: unknown; paymentReference?: unknown; paidAt?: unknown } | null;
  if (typeof body?.organizationId !== "string" || typeof body.invoiceReference !== "string" || !body.invoiceReference.trim() || typeof body.paymentReference !== "string" || !body.paymentReference.trim()) return NextResponse.json({ error: "Veranstalterbereich, Rechnungs- und Zahlungsreferenz sind erforderlich." }, { status: 400 });
  const gross = Number(body.grossAmountCents); const net = Number(body.netAmountCents);
  if (!Number.isSafeInteger(gross) || !Number.isSafeInteger(net) || gross <= 0 || net <= 0 || net > gross) return NextResponse.json({ error: "Bitte gib gültige Brutto- und Nettobeträge in Cent ein." }, { status: 400 });
  const paidAt = typeof body.paidAt === "string" ? new Date(body.paidAt) : new Date();
  if (!Number.isFinite(paidAt.getTime())) return NextResponse.json({ error: "Das Zahlungsdatum ist ungültig." }, { status: 400 });
  const admin = createAdminClient();
  const { data: organization } = await admin.from("organizations").select("id").eq("id", body.organizationId).maybeSingle();
  if (!organization) return NextResponse.json({ error: "Veranstalterbereich wurde nicht gefunden." }, { status: 404 });
  const { data: entitlement } = await admin.from("organization_entitlements").select("organization_id").eq("organization_id", organization.id).maybeSingle();
  if (!entitlement) return NextResponse.json({ error: "Für diesen Bereich ist keine Enterprise-Freischaltung hinterlegt. Eine Zahlung kann ihr nicht zugeordnet werden." }, { status: 409 });
  const invoiceRef = body.invoiceReference.trim().slice(0, 120);
  const { data, error } = await admin.from("partner_payment_receipts").insert({ organization_id: organization.id, product_code: "enterprise", source_type: "enterprise_invoice", source_reference: `${organization.id}:${invoiceRef}`, provider: "manual_invoice", payment_reference: body.paymentReference.trim().slice(0, 160), gross_amount_cents: gross, net_amount_cents: net, paid_at: paidAt.toISOString(), recorded_by: auth.user!.id }).select("id").single();
  if (error) return NextResponse.json({ error: error.code === "23505" ? "Diese Rechnung oder Zahlung wurde bereits dokumentiert." : "Zahlungseingang konnte nicht gespeichert werden." }, { status: error.code === "23505" ? 409 : 500 });
  await admin.from("partner_commission_audit").insert({ actor_user_id: auth.user!.id, entity_type: "payment_receipt", entity_id: data.id, action: "enterprise_payment_recorded", after_data: { organization_id: organization.id, gross_amount_cents: gross, net_amount_cents: net, invoice_reference: invoiceRef, payment_reference: body.paymentReference.trim(), paid_at: paidAt.toISOString() } });
  return NextResponse.json({ ok: true, receiptId: data.id }, { status: 201 });
}
