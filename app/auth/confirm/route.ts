import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = request.nextUrl.searchParams.get("next");
  const destination = next?.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      if (destination === "/login/sponsor?setup=1") {
        const { data: { user } } = await supabase.auth.getUser();
        const companyName = typeof user?.user_metadata?.sponsor_company_name === "string"
          ? user.user_metadata.sponsor_company_name.trim()
          : "";
        const isSponsorRegistration = user?.user_metadata?.account_type === "sponsor" && companyName.length > 0;
        if (!isSponsorRegistration) {
          return NextResponse.redirect(new URL("/login/sponsor?registration=setup-failed", request.url));
        }
        const { error: accountError } = await supabase.rpc("create_sponsor_account", { account_name: companyName });
        if (accountError) return NextResponse.redirect(new URL("/login/sponsor?registration=setup-failed", request.url));
        return NextResponse.redirect(new URL("/sponsor", request.url));
      }
      return NextResponse.redirect(new URL(destination, request.url));
    }
  }

  const failurePath = destination === "/login/sponsor?setup=1"
    ? "/login/sponsor?registration=confirmation-failed"
    : "/login/veranstalter?confirmation=failed";
  return NextResponse.redirect(new URL(failurePath, request.url));
}
