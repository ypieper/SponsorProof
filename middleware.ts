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
  const isLoginPage = request.nextUrl.pathname === "/login";
  const isAuthCallback = request.nextUrl.pathname === "/auth/confirm";
  const publicPages = new Set(["/agb", "/impressum", "/datenschutz", "/kontakt"]);
  const isPublicPage = publicPages.has(request.nextUrl.pathname);
  const isPublicContactApi = request.nextUrl.pathname === "/api/contact";

  if (!user && !isLoginPage && !isAuthCallback && !isPublicPage && !isPublicContactApi) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    if (request.nextUrl.pathname === "/team/join") {
      const token = request.nextUrl.searchParams.get("token") ?? "";
      url.search = new URLSearchParams({ mode: "signup", next: `/team/join?token=${token}` }).toString();
    }
    return NextResponse.redirect(url);
  }

  if (user && isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
