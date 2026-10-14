import { EventsOverview } from "@/components/events-overview";
import { privatePageMetadata } from "@/lib/seo";

export const metadata = privatePageMetadata("Events", "Verwalte Veranstaltungen, Sponsoringtarife und den Fortschritt deiner Events.");

export default function EventsPage() {
  return <EventsOverview />;
}
