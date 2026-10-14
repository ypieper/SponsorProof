
export type StoredEvent = {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  location: string;
  responsible: string;
  createdAt: string;
  planCode: "free" | "event" | "event_pro" | "enterprise";
  bookedPlanCode: "free" | "event" | "event_pro";
  entitlementStatus: "active" | "revoked";
  hasPaidEventLicense: boolean;
};


type EventRow = {
  id: string;
  title: string;
  start_date: string | null;
  end_date: string | null;
  location: string;
  responsible: string;
  created_at: string;
  organization_id?: string;
  plan_code?: "free" | "event" | "event_pro";
  entitlement_status?: "active" | "revoked";
};

function fromEventRow(row: EventRow, entitlement?: { plan_code: "free" | "event" | "event_pro"; entitlement_status: "active" | "revoked" } | null, enterpriseActive = false): StoredEvent {
  return {
    id: row.id,
    title: row.title,
    startDate: row.start_date ?? "",
    endDate: row.end_date ?? "",
    location: row.location,
    responsible: row.responsible,
    createdAt: row.created_at,
    planCode: enterpriseActive ? "enterprise" : entitlement?.plan_code ?? row.plan_code ?? "free",
    bookedPlanCode: entitlement?.plan_code ?? row.plan_code ?? "free",
    entitlementStatus: entitlement?.entitlement_status ?? row.entitlement_status ?? "active",
    hasPaidEventLicense: Boolean(entitlement && entitlement.entitlement_status === "active" && (entitlement.plan_code === "event" || entitlement.plan_code === "event_pro")),
  };
}

export async function fetchStoredEventsFromDatabase() {
  const { createClient } = await import("@/lib/supabase/client");
  const supabase = createClient();
  const [{ data, error }, { data: entitlements, error: entitlementError }, { data: organizationEntitlements, error: organizationEntitlementError }] = await Promise.all([
    supabase.from("events").select("id, title, start_date, end_date, location, responsible, created_at, organization_id").order("created_at", { ascending: false }),
    supabase.from("event_entitlements").select("event_id, plan_code, entitlement_status"),
    supabase.from("organization_entitlements").select("organization_id, is_active, expires_at"),
  ]);
  if (error || entitlementError || organizationEntitlementError) return { data: null, error: error ?? entitlementError ?? organizationEntitlementError };
  const entitlementByEvent = new Map((entitlements ?? []).map((item) => [item.event_id, item]));
  const enterpriseOrganizations = new Set((organizationEntitlements ?? []).filter((item) => item.is_active && new Date(item.expires_at).getTime() > Date.now()).map((item) => item.organization_id));
  return { data: (data ?? []).map((row) => fromEventRow(row as EventRow, entitlementByEvent.get(row.id), Boolean(row.organization_id && enterpriseOrganizations.has(row.organization_id)))), error: null };
}

export async function createStoredEventInDatabase(event: Omit<StoredEvent, "id" | "createdAt" | "planCode" | "bookedPlanCode" | "entitlementStatus" | "hasPaidEventLicense">) {
  const { createClient } = await import("@/lib/supabase/client");
  const supabase = createClient();
  const { data: eventId, error } = await supabase.rpc("create_event_with_free_entitlement", {
    event_title: event.title,
    event_start_date: event.startDate || null,
    event_end_date: event.endDate || null,
    event_location: event.location,
    event_responsible: event.responsible,
  });
  if (error || typeof eventId !== "string") return { data: null, error: error ?? new Error("Event konnte nicht erstellt werden.") };
  return fetchStoredEventFromDatabase(eventId);
}

/* A free entitlement is created by the trusted database function, never from this client. */
export async function fetchStoredEventFromDatabase(id: string) {
  const { createClient } = await import("@/lib/supabase/client");
  const supabase = createClient();
  const [{ data, error }, { data: entitlement, error: entitlementError }] = await Promise.all([
    supabase.from("events").select("id, title, start_date, end_date, location, responsible, created_at, organization_id").eq("id", id).maybeSingle(),
    supabase.from("event_entitlements").select("event_id, plan_code, entitlement_status").eq("event_id", id).maybeSingle(),
  ]);
  if (error || entitlementError) return { data: null, error: error ?? entitlementError };
  let enterpriseActive = false;
  if (data?.organization_id) {
    const { data: organizationEntitlement, error: organizationEntitlementError } = await supabase.from("organization_entitlements").select("is_active, expires_at").eq("organization_id", data.organization_id).maybeSingle();
    if (organizationEntitlementError) return { data: null, error: organizationEntitlementError };
    enterpriseActive = Boolean(organizationEntitlement?.is_active && new Date(organizationEntitlement.expires_at).getTime() > Date.now());
  }
  return { data: data ? fromEventRow(data as EventRow, entitlement, enterpriseActive) : null, error: null };
}

export async function updateStoredEventDetails(id: string, event: Omit<StoredEvent, "id" | "createdAt" | "planCode" | "bookedPlanCode" | "entitlementStatus" | "hasPaidEventLicense">) {
  const { createClient } = await import("@/lib/supabase/client");
  const supabase = createClient();
  const { error } = await supabase
    .from("events")
    .update({ title: event.title, start_date: event.startDate || null, end_date: event.endDate || null, location: event.location, responsible: event.responsible })
    .eq("id", id);
  if (error) return { data: null, error };
  return fetchStoredEventFromDatabase(id);
}

export async function deleteStoredEventFromDatabase(id: string) {
  const { createClient } = await import("@/lib/supabase/client");
  const supabase = createClient();
  return supabase.from("events").delete().eq("id", id);
}

export function formatEventDate(value: string, options: Intl.DateTimeFormatOptions = { day: "2-digit", month: "long", year: "numeric" }) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? new Intl.DateTimeFormat("de-DE", options).format(new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : value;
}

export function formatEventDateRange(startDate: string, endDate: string) {
  const start = formatEventDate(startDate, { day: "2-digit", month: "long" });
  const end = formatEventDate(endDate, { day: "2-digit", month: "long", year: "numeric" });
  return `${start} — ${end}`;
}
