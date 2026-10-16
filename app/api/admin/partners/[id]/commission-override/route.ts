import { NextResponse } from "next/server";
import { createAdminClient, getAuthorizedPlatformAdmin } from "@/lib/supabase/admin";
const products = new Set(["all_events", "contracts_5", "contracts_7", "contracts_10", "contracts_15", "enterprise"]);
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getAuthorizedPlatformAdmin();
  if (auth.responseStatus) return NextResponse.json({ error: "Kein Zugriff." }, { status: auth.responseStatus });
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as { productCode?: unknown; model?: unknown; value?: unknown } | null;
  const value = Number(body?.value);
  if (!products.has(String(body?.productCode)) || !["percentage", "fixed"].includes(String(body?.model)) || !Number.isFinite(value) || value <= 0 || (body?.model === "percentage" && value > 100)) return NextResponse.json({ error: "Bitte prüfe Produkt, Modell und individuellen Provisionssatz." }, { status: 400 });
  const admin = createAdminClient();
  const { data: before } = await admin.from("partner_commission_overrides").select("*").eq("partner_id", id).eq("product_code", body!.productCode as string).maybeSingle();
  const { data, error } = await admin.from("partner_commission_overrides").upsert({ partner_id: id, product_code: body!.productCode, commission_model: body!.model, commission_value: value, is_active: true, created_by: auth.user!.id, updated_at: new Date().toISOString() }, { onConflict: "partner_id,product_code" }).select().single();
  if (error) return NextResponse.json({ error: "Abweichender Satz konnte nicht gespeichert werden." }, { status: 500 });
  await admin.from("partner_commission_audit").insert({ actor_user_id: auth.user!.id, entity_type: "partner_override", entity_id: data.id, action: before ? "updated" : "created", before_data: before, after_data: data });
  return NextResponse.json({ override: data });
}
