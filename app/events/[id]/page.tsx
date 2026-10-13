import { CustomEventPage } from "@/components/custom-event-page";

export default async function EventPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; sponsor?: string }> }) {
  const { id } = await params;
  const { tab, sponsor } = await searchParams;
  return <CustomEventPage eventId={id} selectedTab={tab} selectedSponsorId={sponsor} />;
}
