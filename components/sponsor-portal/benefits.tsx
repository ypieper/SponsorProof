"use client";

import { benefitWorkflowCount } from "@/lib/benefit-workflow";
import type { PortalBenefit } from "@/lib/sponsor-portal/types";

export function SponsorBenefits({ benefits }: { benefits: PortalBenefit[] }) {
  return <section className="panel sponsor-portal-detail-panel sponsor-portal-benefits-list">
    <div className="sponsor-portal-tab-heading"><h2>Leistungen</h2><p>Hier findest du deine vereinbarten Leistungen für dieses Event.</p></div>
    <div className="sponsor-portal-agreed-benefits">{benefits.map((benefit) => {
      const quantity = Math.max(1, benefit.quantity || 1);
      const workflowCount = benefitWorkflowCount(quantity, benefit.tasks_per_unit);
      const units = benefit.units.slice(0, workflowCount);
      const complete = units.length === workflowCount && units.every((unit) => unit.status === "Abgeschlossen");
      const status = complete ? "Abgeschlossen" : units.some((unit) => unit.status === "In Bearbeitung") ? "In Bearbeitung" : "Offen";
      return <article className={`sponsor-portal-agreed-benefit${complete ? " is-complete" : ""}`} key={benefit.id}>
        <header><span className="sponsor-benefit-type">{benefit.benefit_type === "in_kind" ? "Sachleistung" : "Geldleistung"}</span><div><b>{benefit.title}</b><span>{[benefit.description, `Anzahl: ${quantity}`].filter(Boolean).join(" · ")}</span></div><span className={`sponsor-benefit-status sponsor-benefit-status-${complete ? "done" : status === "In Bearbeitung" ? "progress" : "open"}`}>{status}</span></header>
      </article>;
    })}</div>
  </section>;
}
