"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui";
import { DashboardEvents } from "@/components/dashboard-events";
import { DashboardMetrics, type DashboardTaskSummary } from "@/components/dashboard-metrics";
import { DashboardTasks } from "@/components/dashboard-tasks";
import { DashboardGreeting } from "@/components/dashboard-greeting";
import { DashboardTeamInvite } from "@/components/dashboard-team-invite";

export function DashboardWorkspace() {
  const [taskSummary, setTaskSummary] = useState<DashboardTaskSummary | null>(null);

  return <main className="content dashboard-content">
    <div className="dashboard-intro-row">
      <DashboardGreeting />
      <DashboardTeamInvite />
    </div>
    <DashboardMetrics taskSummary={taskSummary}/>
    <div className="dashboard-grid">
      <section className="panel dashboard-attention-panel">
        <div className="panel-heading dashboard-panel-heading"><div><h2>Benötigt deine Aufmerksamkeit</h2><p>Deine nächsten Aufgaben und Schritte</p></div><Link className="btn dashboard-panel-action" href="/aufgaben">Alle Aufgaben ansehen <Icon name="arrow" size={13}/></Link></div>
        <DashboardTasks onSummaryChange={setTaskSummary}/>
      </section>
      <section className="panel dashboard-events-panel">
        <div className="panel-heading dashboard-panel-heading"><div><h2>Deine Events</h2><p>Deine Veranstaltungen im Überblick</p></div><Link className="btn dashboard-panel-action" href="/events">Alle Events ansehen <Icon name="arrow" size={13}/></Link></div>
        <DashboardEvents />
      </section>
    </div>
  </main>;
}
