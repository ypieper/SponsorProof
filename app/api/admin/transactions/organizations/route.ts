import { NextResponse } from "next/server";
import { createAdminClient, getAuthorizedPlatformAdmin } from "@/lib/supabase/admin";
import { formatSponsoId } from "@/lib/sponso-id";

export async function GET(request: Request) {
  const auth = await getAuthorizedPlatformAdmin();
  if (auth.responseStatus) return NextResponse.json({ error: "Kein Zugriff auf Veranstalterbereiche." }, { status: auth.responseStatus });

  const searchParams = new URL(request.url).searchParams;
  const query = (searchParams.get("q") ?? "").trim().slice(0, 80).replace(/[^\p{L}\p{N}\s@._/-]/gu, "");
  const admin = createAdminClient();
  let requestQuery = admin.from("organizations").select("id, name, sponso_id").order("name").limit(25);
  if (query) {
    const pattern = query.replace(/[\\%_]/g, "\\$&");
    requestQuery = requestQuery.or(`name.ilike.%${pattern}%,sponso_id.ilike.%${pattern}%`);
  }
  const { data, error } = await requestQuery;
  if (error) return NextResponse.json({ error: "Veranstalterbereiche konnten nicht gesucht werden." }, { status: 500 });
  return NextResponse.json({ organizations: (data ?? []).map((organization) => ({ id: organization.id, name: organization.name, sponsoId: formatSponsoId(organization.sponso_id) })) }, { headers: { "Cache-Control": "no-store" } });
}
