import Link from "next/link";
import { Icon } from "@/components/ui";
import { DashboardEvents } from "@/components/dashboard-events";
import { DashboardTasks } from "@/components/dashboard-tasks";
import { DashboardGreeting } from "@/components/dashboard-greeting";
import { DashboardOnboarding } from "@/components/dashboard-onboarding";

export default function DashboardPage() {
  return <main className="content">
    <DashboardGreeting />
    <DashboardOnboarding />
    <div className="dashboard-grid">
      <section className="panel">
        <div className="panel-heading"><div><h2>Benötigt deine Aufmerksamkeit</h2><p>Offene Aufgaben im Blick behalten</p></div></div>
        <DashboardTasks />
        <Link className="btn btn-primary dashboard-section-link" href="/aufgaben">Alle Aufgaben ansehen <Icon name="arrow" size={14}/></Link>
      </section>
      <section className="panel">
        <div className="panel-heading"><div><h2>Deine Events</h2><p>Alle Veranstaltungen im Überblick</p></div></div>
        <DashboardEvents />
      </section>
    </div>
  </main>;
}
