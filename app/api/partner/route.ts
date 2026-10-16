import { NextResponse } from "next/server";
import { createAdminClient, getAuthorizedSalesPartner } from "@/lib/supabase/admin";
export const dynamic = "force-dynamic";
export async function GET() {
  const auth = await getAuthorizedSalesPartner();
  if (auth.responseStatus) return NextResponse.json({ error: "Kein Zugriff auf den Vertriebspartnerbereich." }, { status: auth.responseStatus });
  const admin = createAdminClient();
  const [{ data: referrals }, { data: commissions }, { data: payouts }] = await Promise.all([
    admin.from("partner_referrals").select("id,organization_id,organization_name_snapshot,sponso_id_snapshot,registered_at,organization_created_at").eq("partner_id", auth.partner!.id).order("registered_at", { ascending: false }),
    admin.from("partner_commissions").select("id,organization_name_snapshot,sponso_id_snapshot,product_code,basis_amount_cents,commission_amount_cents,status,created_at,paid_at").eq("partner_id", auth.partner!.id).order("created_at", { ascending: false }),
    admin.from("partner_payouts").select("id,amount_cents,paid_at,payout_reference").eq("partner_id", auth.partner!.id).order("paid_at", { ascending: false })
  ]);
  const organizationIds = (referrals ?? []).map((item) => item.organization_id).filter((id): id is string => Boolean(id));
  const { data: receipts } = organizationIds.length ? await admin.from("partner_payment_receipts").select("organization_id,product_code,paid_at").in("organization_id", organizationIds).order("paid_at", { ascending: false }) : { data: [] };
  const receiptMap = new Map<string, { product_code: string; paid_at: string }[]>();
  for (const receipt of receipts ?? []) if (receipt.organization_id) receiptMap.set(receipt.organization_id, [...(receiptMap.get(receipt.organization_id) ?? []), receipt]);
  return NextResponse.json({ partner: { id: auth.partner!.id, referral_code: auth.partner!.referral_code }, referrals: (referrals ?? []).map((item) => ({ ...item, payments: item.organization_id ? receiptMap.get(item.organization_id) ?? [] : [] })), commissions: commissions ?? [], payouts: payouts ?? [] }, { headers: { "Cache-Control": "no-store" } });
}
