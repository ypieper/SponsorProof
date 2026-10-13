import { notFound } from "next/navigation";
import { events, sponsors, sponsorContracts } from "@/lib/demo-data";
import { SponsorDetail } from "@/components/sponsor-detail";

export default async function SponsorPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; event?: string }> }) {
  const { id } = await params;
  const sponsor = sponsors.find((item) => item.id === id);
  if (!sponsor) notFound();
  const query = await searchParams;
  const tab = query.tab === "vertrag" || query.tab === "leistungen" ? "Vertrag" : query.tab === "aufgaben-nachweise" || query.tab === "nachweise" ? "Aufgaben & Nachweise" : query.tab === "report" ? "Report" : "Übersicht";
  const selectedEvent = query.event === "all" || events.some((event) => event.id === query.event) ? query.event ?? "all" : "all";

  return <SponsorDetail initialSponsor={sponsor} contracts={sponsorContracts.filter((contract) => contract.sponsorId === sponsor.id)} events={events} activeTab={tab} selectedEvent={selectedEvent} />;
}
