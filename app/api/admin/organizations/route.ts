import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createAdminClient, getAuthorizedPlatformAdmin } from "@/lib/supabase/admin";
import { formatSponsoId } from "@/lib/sponso-id";
import { finishOrganizationDeletion } from "@/lib/admin-organization-deletion";

export async function GET() {
  const auth = await getAuthorizedPlatformAdmin();
  if (auth.responseStatus) return NextResponse.json({ error: "Kein Zugriff auf die Veranstalterbereiche." }, { status: auth.responseStatus });

  const admin = auth.admin!;
  let users: Awaited<ReturnType<typeof loadUsers>>;
  try {
    users = await loadUsers(auth.admin!);
  } catch {
    return NextResponse.json({ error: "Benutzerdaten der Inhaber konnten nicht geladen werden." }, { status: 500 });
  }
  const [
    { data: organizations, error: organizationError },
    { data: members, error: memberError },
    { data: referrals, error: referralsError },
    { data: partners, error: partnersError },
    { data: jobs, error: jobsError },
  ] = await Promise.all([
    admin.from("organizations").select("id, name, sponso_id, created_at").order("name"),
    admin.from("organization_members").select("organization_id, user_id, role"),
    admin.from("partner_referrals").select("organization_id, partner_id").not("organization_id", "is", null),
    admin.from("sales_partners").select("id, user_id, referral_code"),
    admin.from("admin_organization_deletion_jobs").select("id, organization_id, organization_name, sponso_id, created_at").order("created_at", { ascending: false }),
  ]);
  if (organizationError || memberError || referralsError || partnersError || jobsError) {
    return NextResponse.json({ error: "Veranstalterbereiche konnten nicht geladen werden." }, { status: 500 });
  }

  const userById = new Map(users.map((user) => [user.id, user]));
  const partnerById = new Map((partners ?? []).map((partner) => [partner.id, partner]));
  const referralByOrganization = new Map((referrals ?? []).map((referral) => [referral.organization_id, referral]));
  const membersByOrganization = new Map<string, typeof members>();
  for (const member of members ?? []) {
    membersByOrganization.set(member.organization_id, [...(membersByOrganization.get(member.organization_id) ?? []), member]);
  }

  return NextResponse.json({
    organizations: (organizations ?? []).map((organization) => {
      const organizationMembers = membersByOrganization.get(organization.id) ?? [];
      const referral = referralByOrganization.get(organization.id);
      const partner = referral ? partnerById.get(referral.partner_id) : null;
      const partnerUser = partner ? userById.get(partner.user_id) : null;
      const owners = organizationMembers
        .filter((member) => member.role === "owner")
        .map((member) => {
          const user = userById.get(member.user_id);
          return {
            name: [user?.user_metadata?.first_name, user?.user_metadata?.last_name].filter((part) => typeof part === "string" && part.trim()).join(" ") || "Name nicht hinterlegt",
            email: user?.email ?? "",
          };
        });
      return {
        id: organization.id,
        name: organization.name,
        sponsoId: formatSponsoId(organization.sponso_id),
        createdAt: organization.created_at,
        memberCount: organizationMembers.length,
        owners,
        salesPartner: partner ? {
          name: [partnerUser?.user_metadata?.first_name, partnerUser?.user_metadata?.last_name].filter((part) => typeof part === "string" && part.trim()).join(" ") || partnerUser?.email || "Vertriebspartner",
          email: partnerUser?.email ?? "",
          referralCode: partner.referral_code,
        } : null,
      };
    }),
    pendingDeletions: jobs ?? [],
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: Request) {
  const auth = await getAuthorizedPlatformAdmin();
  if (auth.responseStatus) return NextResponse.json({ error: "Kein Zugriff auf die Veranstalterbereiche." }, { status: auth.responseStatus });
  const body = await request.json().catch(() => null) as {
    organizationId?: unknown;
    confirmationPhrase?: unknown;
  } | null;
  if (!body || typeof body.organizationId !== "string" || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(body.organizationId)) {
    return NextResponse.json({ error: "Der Veranstalterbereich ist ungültig." }, { status: 400 });
  }
  if (body.confirmationPhrase !== "VERANSTALTERBEREICH LÖSCHEN") {
    return NextResponse.json({ error: "Bitte gib zur Bestätigung exakt „VERANSTALTERBEREICH LÖSCHEN“ ein." }, { status: 400 });
  }

  const admin = auth.admin!;
  const { data: jobId, error } = await admin.rpc("delete_organization_for_platform_admin", {
    target_organization_id: body.organizationId,
    requesting_admin_id: auth.user!.id,
    confirmation_phrase: body.confirmationPhrase,
  });
  if (error || typeof jobId !== "string") {
    const message = error?.message ?? "";
    const userMessage = message.includes("ORGANIZATION_NOT_FOUND")
      ? "Der Veranstalterbereich wurde bereits gelöscht oder ist nicht verfügbar."
      : message.includes("CONFIRMATION_REQUIRED")
        ? "Die Bestätigung stimmt nicht."
        : message.includes("PLATFORM_ADMIN_REQUIRED")
          ? "Nur Plattform-Admins dürfen Veranstalterbereiche löschen."
          : "Der Veranstalterbereich konnte nicht gelöscht werden.";
    return NextResponse.json({ error: userMessage }, { status: message.includes("ORGANIZATION_NOT_FOUND") ? 404 : 409 });
  }

  const completionError = await finishOrganizationDeletion(admin, jobId);
  if ("stage" in completionError) {
    return NextResponse.json({
      error: `Bereinigung angehalten bei „${completionError.stage}“: ${completionError.message}`,
      jobId,
    }, { status: 503 });
  }
  return NextResponse.json({ ok: true, softDeletedUserCount: completionError.softDeletedUserCount });
}

async function loadUsers(admin: ReturnType<typeof createAdminClient>) {
  const users: User[] = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) return users;
  }
}
