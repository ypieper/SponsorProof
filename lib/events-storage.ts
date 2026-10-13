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

export function readStoredEvents(): StoredEvent[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storedEventsKey) ?? "[]");
    return Array.isArray(value) ? value as StoredEvent[] : [];
  } catch {
    return [];
  }
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
