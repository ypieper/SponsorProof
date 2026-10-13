import { isSupabaseConfigured } from "@/lib/supabase/config";

export type StoredEvent = {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  location: string;
  responsible: string;
  createdAt: string;
};

export const storedEventsKey = "sponsorproof.events.v1";

type EventRow = {
  id: string;
  title: string;
  start_date: string | null;
  end_date: string | null;
  location: string;
  responsible: string;
  created_at: string;
};

function fromEventRow(row: EventRow): StoredEvent {
  return {
    id: row.id,
    title: row.title,
    startDate: row.start_date ?? "",
    endDate: row.end_date ?? "",
    location: row.location,
    responsible: row.responsible,
    createdAt: row.created_at,
  };
}

export function readStoredEvents(): StoredEvent[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storedEventsKey) ?? "[]");
    return Array.isArray(value) ? value as StoredEvent[] : [];
  } catch {
    return [];
  }
}

export async function fetchStoredEventsFromDatabase() {
  const { createClient } = await import("@/lib/supabase/client");
  const supabase = createClient();
  const { data, error } = await supabase
    .from("events")
    .select("id, title, start_date, end_date, location, responsible, created_at")
    .order("created_at", { ascending: false });
  return { data: data?.map((row) => fromEventRow(row as EventRow)) ?? null, error };
}

export async function createStoredEventInDatabase(event: Omit<StoredEvent, "id" | "createdAt">) {
  const { createClient } = await import("@/lib/supabase/client");
  const supabase = createClient();
  const { data, error } = await supabase
    .from("events")
    .insert({
      title: event.title,
      start_date: event.startDate || null,
      end_date: event.endDate || null,
      location: event.location,
      responsible: event.responsible,
    })
    .select("id, title, start_date, end_date, location, responsible, created_at")
    .single();
  return { data: data ? fromEventRow(data as EventRow) : null, error };
}

export async function fetchStoredEventFromDatabase(id: string) {
  const { createClient } = await import("@/lib/supabase/client");
  const supabase = createClient();
  const { data, error } = await supabase
    .from("events")
    .select("id, title, start_date, end_date, location, responsible, created_at")
    .eq("id", id)
    .maybeSingle();
  return { data: data ? fromEventRow(data as EventRow) : null, error };
}

export async function updateStoredEventDetails(id: string, event: Omit<StoredEvent, "id" | "createdAt">) {
  if (!isSupabaseConfigured) {
    const events = readStoredEvents();
    const updated = events.map((storedEvent) => storedEvent.id === id ? { ...storedEvent, ...event } : storedEvent);
    if (!events.some((event) => event.id === id)) return { error: new Error("Event nicht gefunden.") };
    localStorage.setItem(storedEventsKey, JSON.stringify(updated));
    return { data: updated.find((event) => event.id === id) ?? null, error: null };
  }

  const { createClient } = await import("@/lib/supabase/client");
  const supabase = createClient();
  const { data, error } = await supabase
    .from("events")
    .update({ title: event.title, start_date: event.startDate || null, end_date: event.endDate || null, location: event.location, responsible: event.responsible })
    .eq("id", id)
    .select("id, title, start_date, end_date, location, responsible, created_at")
    .single();
  if (error) return { data: null, error };

  try {
    const events = readStoredEvents();
    const updatedEvent = fromEventRow(data as EventRow);
    const updatedEvents = events.some((event) => event.id === id)
      ? events.map((event) => event.id === id ? updatedEvent : event)
      : [...events, updatedEvent];
    localStorage.setItem(storedEventsKey, JSON.stringify(updatedEvents));
  } catch { /* Die Datenbank bleibt die maßgebliche Quelle. */ }
  return { data: fromEventRow(data as EventRow), error: null };
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
