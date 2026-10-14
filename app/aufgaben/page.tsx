import { TasksOverview } from "@/components/tasks-overview";
import { privatePageMetadata } from "@/lib/seo";

export const metadata = privatePageMetadata("Aufgaben", "Sieh offene Sponsoring-Leistungen und zugehörige Nachweise auf einen Blick.");

export default function TasksPage() {
  return <main className="content"><TasksOverview /></main>;
}
