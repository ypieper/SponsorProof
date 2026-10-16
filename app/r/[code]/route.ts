import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request, context: { params: Promise<{ code: string }> }) {
  const { code } = await context.params;
  const origin = new URL(request.url).origin;
  try {
    const admin = createAdminClient();
    const { data: partner } = await admin.from("sales_partners").select("id").eq("referral_code", code.toUpperCase()).eq("is_active", true).maybeSingle();
    if (!partner) return NextResponse.redirect(new URL("/login/veranstalter?referral=invalid", origin));
    const { data: click, error } = await admin.from("partner_referral_clicks").insert({ partner_id: partner.id }).select("id").single();
    if (error || !click) return NextResponse.redirect(new URL("/login/veranstalter?referral=invalid", origin));
    return NextResponse.redirect(new URL(`/login/veranstalter?mode=signup&referral_click=${encodeURIComponent(click.id)}`, origin));
  } catch {
    return NextResponse.redirect(new URL("/login/veranstalter?referral=invalid", origin));
  }
}
