import { createClient } from "@/lib/supabase/client";
import { formatSponsoId } from "@/lib/sponso-id";

export type OrganizerSettings = {
  organization: string; street: string; streetNumber: string; postalCode: string; city: string;
  iban: string; bic: string; bank: string;
};

const columns = "organization_name, street, street_number, postal_code, city, iban, bic, bank";

function fromRow(row: Record<string, string>): OrganizerSettings {
  return {
    organization: row.organization_name ?? "", street: row.street ?? "", streetNumber: row.street_number ?? "",
    postalCode: row.postal_code ?? "", city: row.city ?? "", iban: row.iban ?? "", bic: row.bic ?? "", bank: row.bank ?? "",
  };
}

export async function fetchOrganizerSettings() {
  const supabase = createClient();
  const { data: organizationId, error: organizationError } = await supabase.rpc("current_organization_id");
  if (organizationError || typeof organizationId !== "string") return { data: null, sponsoId: null, error: organizationError ?? new Error("Veranstalterbereich nicht gefunden.") };
  const [{ data, error }, { data: organization, error: organizationLookupError }] = await Promise.all([
    supabase.from("organization_settings").select(columns).eq("organization_id", organizationId).maybeSingle(),
    supabase.from("organizations").select("sponso_id").eq("id", organizationId).maybeSingle(),
  ]);
  if (error || organizationLookupError) return { data: null, sponsoId: null, error: error ?? organizationLookupError };
  return { data: data ? fromRow(data as Record<string, string>) : null, sponsoId: organization?.sponso_id ? formatSponsoId(organization.sponso_id) : null, error: null };
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
    updated_at: new Date().toISOString(),
  });
  if (settingsError) return { error: settingsError };
  const { error: organizationUpdateError } = await supabase.from("organizations").update({ name: settings.organization }).eq("id", organizationId);
  return { error: organizationUpdateError };
}
