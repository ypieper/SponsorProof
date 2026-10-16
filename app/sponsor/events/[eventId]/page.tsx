import { SponsorPortal } from "@/components/sponsor-portal";

type Props = { params: Promise<{ eventId: string }> };

export default async function SponsorEventPage({ params }: Props) {
  const { eventId } = await params;
  return <SponsorPortal eventId={eventId} />;
}
