import { EventMode } from "@/components/event-mode";
import { privatePageMetadata } from "@/lib/seo";

export const metadata = privatePageMetadata("Nachweise vor Ort", "Erfasse offene Sponsoring-Nachweise direkt auf dem Smartphone.");

export default function EventModePage() {
  return <EventMode />;
}
