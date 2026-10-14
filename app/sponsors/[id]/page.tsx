import { notFound } from "next/navigation";
import { SponsorDetail } from "@/components/sponsor-detail";
import { createClient } from "@/lib/supabase/server";
import { formatEventDateRange } from "@/lib/events-storage";
import { contractFromRow, sponsorFromRow, type ContractRow, type SponsorRow } from "@/lib/sponsors-storage";
import { privatePageMetadata } from "@/lib/seo";

export const metadata = privatePageMetadata("Sponsorprofil", "Verwalte die Vereinbarungen, Leistungen und Nachweise eines Sponsors.");

type EventRow = { id: string; title: string; start_date: string | null; end_date: string | null; location: string };

export default async function SponsorPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; event?: string }> }) {
  const { id } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const [sponsorResult, contractResult, eventResult, assignmentResult] = await Promise.all([
    supabase.from("sponsors").select("*").eq("id", id).maybeSingle(),
    supabase.from("contracts").select("*").eq("sponsor_id", id).order("created_at", { ascending: false }),
    supabase.from("events").select("id, title, start_date, end_date, location").order("created_at", { ascending: false }),
    supabase.from("event_sponsors").select("event_id").eq("sponsor_id", id),
  ]);
  if (sponsorResult.error || contractResult.error || eventResult.error || assignmentResult.error || !sponsorResult.data) notFound();

  const contracts = (contractResult.data ?? []).map((row) => contractFromRow(row as ContractRow));
  const events = (eventResult.data ?? []).map((row) => {
    const event = row as EventRow;
    return { id: event.id, title: event.title, date: formatEventDateRange(event.start_date ?? "", event.end_date ?? ""), location: event.location };
  });
  const activeTab = query.tab === "vertrag" || query.tab === "leistungen" ? "Vertrag" : query.tab === "aufgaben-nachweise" || query.tab === "nachweise" ? "Aufgaben & Nachweise" : query.tab === "report" ? "Report" : "Übersicht";
  const selectedEvent = query.event === "all" || events.some((event) => event.id === query.event) ? query.event ?? "all" : "all";

  return <SponsorDetail initialSponsor={sponsorFromRow(sponsorResult.data as SponsorRow, contracts, (assignmentResult.data ?? []).map((row) => row.event_id))} contracts={contracts} events={events} activeTab={activeTab} selectedEvent={selectedEvent} />;
}
