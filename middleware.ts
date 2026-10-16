import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured, supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";

export async function middleware(request: NextRequest) {
  if (!isSupabaseConfigured) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();
  const isSponsorLoginPage = request.nextUrl.pathname === "/login/sponsor";
  const isAdminLoginPage = request.nextUrl.pathname === "/admin/login";
  const isLoginPage = request.nextUrl.pathname === "/login" || request.nextUrl.pathname.startsWith("/login/") || isAdminLoginPage;
  const isAdminPage = request.nextUrl.pathname === "/admin" || request.nextUrl.pathname.startsWith("/admin/");
  const isAuthCallback = request.nextUrl.pathname === "/auth/confirm";
  const publicPages = new Set(["/", "/landing", "/agb", "/impressum", "/datenschutz", "/kontakt"]);
  const isPublicPage = publicPages.has(request.nextUrl.pathname);
  const isPublicContactApi = request.nextUrl.pathname === "/api/contact";
  const isPublicReferralRoute = request.nextUrl.pathname.startsWith("/r/");

  if (!user && !isLoginPage && !isAuthCallback && !isPublicPage && !isPublicContactApi && !isPublicReferralRoute) {
    const url = request.nextUrl.clone();
    url.pathname = isAdminPage ? "/admin/login" : "/login";
    if (request.nextUrl.pathname === "/team/join") {
      const token = request.nextUrl.searchParams.get("token") ?? "";
      url.search = new URLSearchParams({ mode: "signup", next: `/team/join?token=${token}` }).toString();
    }
    return NextResponse.redirect(url);
  }

  const isOnboardingEndpoint = request.nextUrl.pathname === "/onboarding" || request.nextUrl.pathname === "/api/onboarding" || request.nextUrl.pathname === "/api/postal-code";
  const isInvitationAcceptance = request.nextUrl.pathname === "/team/join";
  const needsOrganizerOnboarding = user?.user_metadata?.onboarding_completed === false && user.user_metadata?.account_type !== "sponsor";
  if (needsOrganizerOnboarding && !isOnboardingEndpoint && !isInvitationAcceptance && !isAuthCallback) {
    const url = request.nextUrl.clone();
    url.pathname = "/onboarding";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (user && isLoginPage && !isSponsorLoginPage && !isAdminLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
