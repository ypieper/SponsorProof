import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return NextResponse.json({ error: "Bitte melde dich erneut an." }, { status: 401 });

  const { data: organizationId, error: organizationError } = await supabase.rpc("current_organization_id");
  if (organizationError || typeof organizationId !== "string") {
    return NextResponse.json({ error: "Der Veranstalterbereich konnte nicht geladen werden." }, { status: 500 });
  }

  const { data: rows, error: membersError } = await supabase.from("organization_members")
    .select("user_id, email, role, joined_at")
    .eq("organization_id", organizationId)
    .order("joined_at");
  if (membersError) return NextResponse.json({ error: "Die Mitglieder konnten nicht geladen werden." }, { status: 500 });

  try {
    const admin = createAdminClient();
    const members = await Promise.all((rows ?? []).map(async (member) => {
      const { data } = await admin.auth.admin.getUserById(member.user_id);
      const metadata = data.user?.user_metadata ?? {};
      const firstName = String(metadata.first_name ?? "").trim();
      const lastName = String(metadata.last_name ?? "").trim();
      const fullName = [firstName, lastName].filter(Boolean).join(" ");
      return { ...member, email: data.user?.email ?? member.email, first_name: firstName, last_name: lastName, full_name: fullName };
    }));
    return NextResponse.json({ members, currentUserId: user.id }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Die Mitgliedsprofile konnten nicht geladen werden." }, { status: 503 });
  }
}
