import { NextResponse } from "next/server";
import { createAdminClient, getAuthorizedPlatformAdmin } from "@/lib/supabase/admin";
export const dynamic = "force-dynamic";
export async function GET() {
  const auth = await getAuthorizedPlatformAdmin();
  if (auth.responseStatus) return NextResponse.json({ error: "Kein Zugriff." }, { status: auth.responseStatus });
  const admin = createAdminClient();
  const [{ data: commissions, error }, { data: partners }, { data: referrals }, { data: audit }, { data: receipts }] = await Promise.all([
    admin.from("partner_commissions").select("*").order("created_at", { ascending: false }),
    admin.from("sales_partners").select("id,referral_code,user_id"),
    admin.from("partner_referrals").select("id,partner_id,organization_id"),
    admin.from("partner_commission_audit").select("id,actor_user_id,entity_type,entity_id,action,before_data,after_data,created_at").order("created_at", { ascending: false }).limit(300),
    admin.from("partner_payment_receipts").select("id,source_reference,payment_reference,provider,paid_at,net_amount_cents")
  ]);
  if (error) return NextResponse.json({ error: "Provisionen konnten nicht geladen werden." }, { status: 500 });
  const users = new Map<string, { email: string; name: string }>();
  for (let page = 1; ; page += 1) {
    const { data: authUsers, error: usersError } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (usersError) return NextResponse.json({ error: "Benutzerdaten für Provisionen konnten nicht geladen werden." }, { status: 500 });
    for (const user of authUsers.users) users.set(user.id, { email: user.email ?? "", name: [user.user_metadata?.first_name, user.user_metadata?.last_name].filter(Boolean).join(" ") || user.email || "" });
    if (authUsers.users.length < 1000) break;
  }
  const partnerMap = new Map((partners ?? []).map((p) => [p.id, { ...p, ...(p.user_id ? users.get(p.user_id) : null) ?? { email: "", name: "" } } ]));
  const receiptMap = new Map((receipts ?? []).map((receipt) => [receipt.id, receipt]));
  return NextResponse.json({ commissions: (commissions ?? []).map((row) => ({
    ...row,
    partner: (row.partner_id ? partnerMap.get(row.partner_id) : null) ?? {
      id: row.partner_id,
      name: row.partner_name_snapshot ?? "Gelöschter Vertriebspartner",
      email: row.partner_email_snapshot ?? "",
      referral_code: row.partner_referral_code_snapshot ?? "",
    },
    payment: receiptMap.get(row.payment_receipt_id),
  })), partners: [...partnerMap.values()], referrals: referrals ?? [], audit: audit ?? [] });
}
export async function PATCH(request: Request) {
  const auth = await getAuthorizedPlatformAdmin();
  if (auth.responseStatus) return NextResponse.json({ error: "Kein Zugriff." }, { status: auth.responseStatus });
  const body = await request.json().catch(() => null) as { id?: unknown; status?: unknown; reason?: unknown } | null;
  if (typeof body?.id !== "string" || !["approved", "held", "void"].includes(String(body.status))) return NextResponse.json({ error: "Ungültige Aktion." }, { status: 400 });
  if (body.status === "void" && (typeof body.reason !== "string" || !body.reason.trim())) return NextResponse.json({ error: "Bitte gib einen Stornogrund ein." }, { status: 400 });
  const admin = createAdminClient();
  const status = String(body.status);
  const { error } = await admin.rpc("admin_update_partner_commission", { target_commission_id: body.id, target_status: status, target_void_reason: typeof body.reason === "string" ? body.reason.trim().slice(0,500) : "", actor: auth.user!.id });
  if (error) return NextResponse.json({ error: error.message.includes("COMMISSION_NOT_CHANGEABLE") ? "Diese Provision kann nicht mehr geändert werden." : "Provision konnte nicht geändert werden." }, { status: error.message.includes("COMMISSION_NOT_CHANGEABLE") ? 409 : 500 });
  const { data: after } = await admin.from("partner_commissions").select("*").eq("id", body.id).single();
  return NextResponse.json({ commission: after });
}
export async function POST(request: Request) {
  const auth = await getAuthorizedPlatformAdmin();
  if (auth.responseStatus) return NextResponse.json({ error: "Kein Zugriff." }, { status: auth.responseStatus });
  const body = await request.json().catch(() => null) as { partnerId?: unknown; commissionIds?: unknown; reference?: unknown; paidAt?: unknown } | null;
  if (typeof body?.partnerId !== "string" || !Array.isArray(body.commissionIds) || !body.commissionIds.every((id) => typeof id === "string") || typeof body.reference !== "string" || !body.reference.trim()) return NextResponse.json({ error: "Partner, freigegebene Provisionen und Zahlungsreferenz werden benötigt." }, { status: 400 });
  const paidAt = typeof body.paidAt === "string" ? new Date(body.paidAt) : new Date();
  if (!Number.isFinite(paidAt.getTime())) return NextResponse.json({ error: "Auszahlungsdatum ungültig." }, { status: 400 });
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("record_partner_payout", { target_partner_id: body.partnerId, target_commission_ids: body.commissionIds, target_reference: body.reference.trim().slice(0, 160), target_paid_at: paidAt.toISOString(), actor: auth.user!.id });
  if (error) return NextResponse.json({ error: error.message.includes("PAYOUT_COMMISSIONS_INVALID") ? "Mindestens eine Provision ist nicht mehr freigegeben. Bitte aktualisiere die Seite." : "Auszahlung konnte nicht dokumentiert werden." }, { status: 409 });
  return NextResponse.json({ payoutId: data }, { status: 201 });
}
