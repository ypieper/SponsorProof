import { NextResponse } from "next/server";
import { createAdminClient, getAuthorizedPlatformAdmin } from "@/lib/supabase/admin";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getAuthorizedPlatformAdmin();
  if (auth.responseStatus) return NextResponse.json({ error: "Kein Zugriff." }, { status: auth.responseStatus });
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as { isActive?: unknown } | null;
  if (typeof body?.isActive !== "boolean") return NextResponse.json({ error: "Ungültiger Status." }, { status: 400 });
  const admin = createAdminClient();
  const { data: before } = await admin.from("sales_partners").select("is_active").eq("id", id).maybeSingle();
  if (!before) return NextResponse.json({ error: "Vertriebspartner nicht gefunden." }, { status: 404 });
  const { error } = await admin.from("sales_partners").update({ is_active: body.isActive, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ error: "Status konnte nicht geändert werden." }, { status: 500 });
  await admin.from("partner_commission_audit").insert({ actor_user_id: auth.user!.id, entity_type: "partner", entity_id: id, action: body.isActive ? "activated" : "deactivated", before_data: before, after_data: { is_active: body.isActive } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getAuthorizedPlatformAdmin();
  if (auth.responseStatus) return NextResponse.json({ error: "Kein Zugriff." }, { status: auth.responseStatus });
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Ungültiger Vertriebspartner." }, { status: 400 });

  const admin = createAdminClient();
  const { data: partner, error: lookupError } = await admin.from("sales_partners")
    .select("id,user_id,referral_code")
    .eq("id", id)
    .maybeSingle();
  if (lookupError) return NextResponse.json({ error: "Vertriebspartner konnte nicht geladen werden." }, { status: 500 });
  if (!partner) return NextResponse.json({ error: "Vertriebspartner nicht gefunden." }, { status: 404 });

  let email = "";
  let name = "";
  if (partner.user_id) {
    const { data: userData } = await admin.auth.admin.getUserById(partner.user_id);
    const user = userData.user;
    email = user?.email ?? "";
    name = [user?.user_metadata?.first_name, user?.user_metadata?.last_name].filter((part) => typeof part === "string" && part.trim()).join(" ");
  }

  const { error } = await admin.rpc("admin_delete_sales_partner", {
    target_partner_id: id,
    target_actor: auth.user!.id,
    target_partner_name: name || email,
    target_partner_email: email,
  });
  if (error) {
    if (error.message.includes("PARTNER_NOT_FOUND")) return NextResponse.json({ error: "Vertriebspartner nicht gefunden." }, { status: 404 });
    if (error.message.includes("PARTNER_HAS_OPEN_COMMISSIONS")) return NextResponse.json({ error: "Offene Provisionen müssen vor dem Löschen freigegeben und ausgezahlt oder storniert werden." }, { status: 409 });
    return NextResponse.json({ error: "Vertriebspartner konnte nicht gelöscht werden." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
