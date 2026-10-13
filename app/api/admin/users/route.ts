import { NextResponse } from "next/server";
import { getAuthorizedPlatformAdmin } from "@/lib/supabase/admin";

export async function GET() {
  const auth = await getAuthorizedPlatformAdmin();
  if (auth.responseStatus) {
    return NextResponse.json({ error: auth.responseStatus === 503 ? "Die Admin-Verwaltung ist noch nicht eingerichtet." : "Kein Zugriff." }, { status: auth.responseStatus });
  }

  const admin = auth.admin!;
  let users: Awaited<ReturnType<typeof loadAllUsers>>;
  try {
    users = await loadAllUsers(admin);
  } catch {
    return NextResponse.json({ error: "Die Benutzer konnten nicht geladen werden." }, { status: 500 });
  }
  const [{ data: members, error: memberError }, { data: organizations, error: organizationError }, { data: admins, error: adminsError }] = await Promise.all([
    admin.from("organization_members").select("user_id, organization_id, role"),
    admin.from("organizations").select("id, name"),
    admin.from("platform_admins").select("user_id"),
  ]);

  if (memberError || organizationError || adminsError) {
    return NextResponse.json({ error: "Die Benutzer konnten nicht geladen werden." }, { status: 500 });
  }

  const organizationNames = new Map((organizations ?? []).map((organization) => [organization.id, organization.name]));
  const memberByUser = new Map((members ?? []).map((member) => [member.user_id, member]));
  const platformAdminIds = new Set((admins ?? []).map((entry) => entry.user_id));

  return NextResponse.json({ users: users.map((user) => {
    const member = memberByUser.get(user.id);
    return {
      id: user.id,
      email: user.email ?? "",
      firstName: String(user.user_metadata?.first_name ?? ""),
      lastName: String(user.user_metadata?.last_name ?? ""),
      organizationId: member?.organization_id ?? null,
      organizationName: member ? organizationNames.get(member.organization_id) ?? "Veranstalterbereich" : "Kein Veranstalterbereich",
      workspaceRole: member?.role ?? null,
      platformAdmin: platformAdminIds.has(user.id),
      suspended: Boolean(user.banned_until && new Date(user.banned_until).getTime() > Date.now()),
      lastSignInAt: user.last_sign_in_at,
    };
  }), currentUserId: auth.user!.id });
}

async function loadAllUsers(admin: NonNullable<Awaited<ReturnType<typeof getAuthorizedPlatformAdmin>>["admin"]>) {
  const users = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) return users;
  }
}
