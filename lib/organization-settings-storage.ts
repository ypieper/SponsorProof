import { createClient } from "@/lib/supabase/client";

export type OrganizerSettings = {
  organization: string; street: string; streetNumber: string; postalCode: string; city: string;
  iban: string; bic: string; bank: string; firstName: string; lastName: string; email: string; phone: string;
};

const columns = "organization_name, street, street_number, postal_code, city, iban, bic, bank, contact_first_name, contact_last_name, contact_email, contact_phone";

function fromRow(row: Record<string, string>): OrganizerSettings {
  return {
    organization: row.organization_name ?? "", street: row.street ?? "", streetNumber: row.street_number ?? "",
    postalCode: row.postal_code ?? "", city: row.city ?? "", iban: row.iban ?? "", bic: row.bic ?? "", bank: row.bank ?? "",
    firstName: row.contact_first_name ?? "", lastName: row.contact_last_name ?? "", email: row.contact_email ?? "", phone: row.contact_phone ?? "",
  };
}

export async function fetchOrganizerSettings() {
  const supabase = createClient();
  const { data: organizationId, error: organizationError } = await supabase.rpc("current_organization_id");
  if (organizationError || typeof organizationId !== "string") return { data: null, error: organizationError ?? new Error("Veranstalterbereich nicht gefunden.") };
  const { data, error } = await supabase.from("organization_settings").select(columns).eq("organization_id", organizationId).maybeSingle();
  return { data: data ? fromRow(data as Record<string, string>) : null, error };
}

export async function saveOrganizerSettings(settings: OrganizerSettings) {
  const supabase = createClient();
  const { data: organizationId, error: organizationError } = await supabase.rpc("current_organization_id");
  if (organizationError || typeof organizationId !== "string") return { error: organizationError ?? new Error("Veranstalterbereich nicht gefunden.") };
  const { error: settingsError } = await supabase.from("organization_settings").upsert({
    organization_id: organizationId,
    organization_name: settings.organization,
    street: settings.street,
    street_number: settings.streetNumber,
    postal_code: settings.postalCode,
    city: settings.city,
    iban: settings.iban,
    bic: settings.bic,
    bank: settings.bank,
    contact_first_name: settings.firstName,
    contact_last_name: settings.lastName,
    contact_email: settings.email,
    contact_phone: settings.phone,
    updated_at: new Date().toISOString(),
  });
  if (settingsError) return { error: settingsError };
  const { error: organizationUpdateError } = await supabase.from("organizations").update({ name: settings.organization }).eq("id", organizationId);
  return { error: organizationUpdateError };
}
