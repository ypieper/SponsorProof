import Link from "next/link";
import { tasks } from "@/lib/demo-data";
import { Icon, Metric } from "@/components/ui";
import { DashboardEvents } from "@/components/dashboard-events";

export default function DashboardPage() {
  return <main className="content">
    <div className="page-heading"><div><div className="eyebrow">MONTAG, 12. APRIL 2027</div><h1>Guten Morgen, Maria <span aria-hidden="true">☀️</span></h1><p className="subtitle">Hier ist der aktuelle Stand deiner Sponsoring-Aktivitäten.</p></div></div>
    <section className="metric-grid">
      <Metric label="Sponsoringvolumen" value="38.500 €" note="gesamt" icon="spark"/>
      <Metric label="Sponsoren" value="16" note="aktiv" icon="users"/>
      <Metric label="Leistungen" value="74" note="vereinbart" icon="check"/>
      <Metric label="Erfüllt" value="82 %" note="aller Leistungen" icon="layers"/>
    </section>
    <div className="dashboard-grid">
      <section className="panel">
        <div className="panel-heading"><div><h2>Deine Events</h2><p>Alle Veranstaltungen im Überblick</p></div></div>
        <DashboardEvents />
      </section>
      <section className="panel">
        <div className="panel-heading"><div><h2>Benötigt deine Aufmerksamkeit</h2><p>Diese Aufgaben stehen als Nächstes an</p></div><span className="status status-progress">3 offen</span></div>
        <div className="task-list">{tasks.map((task) => <div className="task-row" key={task.title}><span className="task-check"><Icon name="clock" size={15}/></span><div><div className="task-title">{task.title}</div><div className="task-caption">{task.sponsor}</div></div><span className="task-date">{task.due}</span></div>)}</div>
        <Link className="btn btn-primary dashboard-section-link" href="/aufgaben">Alle Aufgaben ansehen <Icon name="arrow" size={14}/></Link>
      </section>
    </div>
  </main>;
}
