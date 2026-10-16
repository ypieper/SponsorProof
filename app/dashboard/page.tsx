import Link from "next/link";
import { Icon } from "@/components/ui";
import { DashboardEvents } from "@/components/dashboard-events";
import { DashboardTasks } from "@/components/dashboard-tasks";
import { DashboardGreeting } from "@/components/dashboard-greeting";
import { DashboardTeamInvite } from "@/components/dashboard-team-invite";
import { FirstLoginWalkthrough } from "@/components/first-login-walkthrough";
import { privatePageMetadata } from "@/lib/seo";

export const metadata = privatePageMetadata("Übersicht", "Behalte die nächsten Sponsoring-Aufgaben und alle Veranstaltungen im Blick.");

export default function DashboardPage() {
  return <main className="content">
    <DashboardGreeting />
    <FirstLoginWalkthrough audience="organizer" />
    <DashboardTeamInvite />
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
