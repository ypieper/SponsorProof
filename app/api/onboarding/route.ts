import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type OnboardingBody = {
  firstName?: unknown;
  lastName?: unknown;
  organization?: unknown;
  street?: unknown;
  streetNumber?: unknown;
  postalCode?: unknown;
  city?: unknown;
};

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return NextResponse.json({ error: "Bitte melde dich erneut an." }, { status: 401 });
  if (user.user_metadata?.onboarding_completed !== false || user.user_metadata?.account_type === "sponsor") {
    return NextResponse.json({ error: "Für dieses Konto ist keine Ersteinrichtung erforderlich." }, { status: 404 });
  }

  const { data: membership, error: membershipError } = await supabase.from("organization_members")
    .select("organization_id, role").eq("user_id", user.id).maybeSingle();
  if (membershipError) return NextResponse.json({ error: "Dein Veranstalterbereich konnte nicht geladen werden." }, { status: 500 });

  let organization = { organization: "", street: "", streetNumber: "", postalCode: "", city: "" };
  if (membership) {
    const [{ data: settings, error: settingsError }, { data: organizationRow, error: organizationError }] = await Promise.all([
      supabase.from("organization_settings").select("organization_name, street, street_number, postal_code, city").eq("organization_id", membership.organization_id).maybeSingle(),
      supabase.from("organizations").select("name").eq("id", membership.organization_id).maybeSingle(),
    ]);
    if (settingsError || organizationError) return NextResponse.json({ error: "Die Unternehmensdaten konnten nicht geladen werden." }, { status: 500 });
    organization = {
      organization: settings?.organization_name || organizationRow?.name || "",
      street: settings?.street ?? "",
      streetNumber: settings?.street_number ?? "",
      postalCode: settings?.postal_code ?? "",
      city: settings?.city ?? "",
    };
  }

  return NextResponse.json({
    firstName: String(user.user_metadata?.first_name ?? ""),
    lastName: String(user.user_metadata?.last_name ?? ""),
    requiresOrganizationDetails: !membership || membership.role === "owner",
    organization,
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return NextResponse.json({ error: "Bitte melde dich erneut an." }, { status: 401 });
  if (user.user_metadata?.onboarding_completed !== false || user.user_metadata?.account_type === "sponsor") {
    return NextResponse.json({ error: "Für dieses Konto ist keine Ersteinrichtung erforderlich." }, { status: 404 });
  }

  const body = await request.json().catch(() => null) as OnboardingBody | null;
  if (!body || typeof body.firstName !== "string" || typeof body.lastName !== "string") {
    return NextResponse.json({ error: "Bitte gib deinen Vor- und Nachnamen ein." }, { status: 400 });
  }
  const firstName = body.firstName.trim().slice(0, 80);
  const lastName = body.lastName.trim().slice(0, 80);
  if (!firstName || !lastName) return NextResponse.json({ error: "Vor- und Nachname sind erforderlich." }, { status: 400 });

  const { data: membership, error: membershipError } = await supabase.from("organization_members")
    .select("organization_id, role").eq("user_id", user.id).maybeSingle();
  if (membershipError) return NextResponse.json({ error: "Dein Veranstalterbereich konnte nicht geprüft werden." }, { status: 500 });

  let organizationId = membership?.organization_id ?? null;
  if (!membership || membership.role === "owner") {
    const organization = typeof body.organization === "string" ? body.organization.trim().slice(0, 180) : "";
    const street = typeof body.street === "string" ? body.street.trim().slice(0, 160) : "";
    const streetNumber = typeof body.streetNumber === "string" ? body.streetNumber.trim().slice(0, 30) : "";
    const postalCode = typeof body.postalCode === "string" ? body.postalCode.trim() : "";
    const city = typeof body.city === "string" ? body.city.trim().slice(0, 100) : "";
    if (!organization || !street || !streetNumber || !/^\d{5}$/.test(postalCode) || !city) {
      return NextResponse.json({ error: "Bitte ergänze Bezeichnung und vollständige Anschrift deines Unternehmens." }, { status: 400 });
    }
    if (!organizationId) {
      const { data, error } = await supabase.rpc("current_organization_id");
      if (error || typeof data !== "string") return NextResponse.json({ error: "Dein Veranstalterbereich konnte nicht eingerichtet werden." }, { status: 500 });
      organizationId = data;
    }
    const { error: settingsError } = await supabase.from("organization_settings").upsert({
      organization_id: organizationId,
      organization_name: organization,
      street,
      street_number: streetNumber,
      postal_code: postalCode,
      city,
      updated_at: new Date().toISOString(),
    });
    if (settingsError) return NextResponse.json({ error: "Die Unternehmensdaten konnten nicht gespeichert werden." }, { status: 500 });
    const { error: organizationError } = await supabase.from("organizations").update({ name: organization }).eq("id", organizationId);
    if (organizationError) return NextResponse.json({ error: "Die Bezeichnung des Veranstalterbereichs konnte nicht gespeichert werden." }, { status: 500 });
  }

  const { error: profileError } = await supabase.auth.updateUser({
    data: { ...user.user_metadata, first_name: firstName, last_name: lastName, onboarding_completed: true, organization_join_code: null },
  });
  if (profileError) return NextResponse.json({ error: "Dein Benutzerprofil konnte nicht gespeichert werden." }, { status: 500 });

  return NextResponse.json({ ok: true });
}
