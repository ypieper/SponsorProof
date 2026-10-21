import { Progress, Status } from "@/components/ui";
import { getBenefitStatus, sortWorkflowTasks } from "@/lib/benefit-workflow";
import type { StoredBenefit } from "@/lib/benefits-storage";
import type { StoredTaskRecord } from "@/lib/tasks-storage";

export function EventBenefitRow({ benefit, tasks }: { benefit: StoredBenefit; tasks: StoredTaskRecord[] }) {
  const benefitTasks = sortWorkflowTasks(tasks);
  const status = getBenefitStatus(benefit, benefitTasks);
  const done = status === "Erledigt";
  const noTasks = benefit.completionRequired === false;
  const completedTasks = benefitTasks.filter((task) => task.status === "Erledigt").length;
  const progress = benefitTasks.length ? Math.round(completedTasks / benefitTasks.length * 100) : done ? 100 : 0;
  const nextTask = benefitTasks.find((task) => task.status !== "Erledigt");
  const nextOwner = nextTask && (nextTask.assigned_to_sponsor || nextTask.completion_type === "sponsor_upload" || nextTask.completion_type === "sponsor_approval") ? "Sponsor" : "Veranstalter";
  const progressLabel = benefitTasks.length ? `${completedTasks} von ${benefitTasks.length} Aufgaben` : done ? "Erfüllt" : "Noch keine Aufgaben";

  return <tr className={done || noTasks ? "event-benefit-completed" : undefined}>
    <td data-label="Leistung">
      <div className="event-benefit-name"><b>{benefit.title}</b><span className="event-benefit-kind">{benefit.benefitType === "in_kind" ? "Sachleistung" : "Geldleistung"}</span></div>
      {benefit.description && <small className="event-benefit-description">{benefit.description}</small>}
    </td>
    <td data-label="Nächster Schritt">
      {noTasks ? <div className="event-benefit-no-tasks"><span className="event-benefit-muted">Keine Aufgaben vorgesehen</span><small>Fließt nicht in die Fortschrittsanzeigen ein</small></div>
        : nextTask ? <div className="event-benefit-next-step"><span>{nextOwner}</span><b>{nextTask.title}</b></div>
          : <span className="event-benefit-muted">Alle Aufgaben erledigt</span>}
    </td>
    <td data-label="Fortschritt">
      {noTasks ? <span className="event-benefit-muted">—</span> : <div className="event-benefit-table-progress"><Progress value={progress}/><small>{progressLabel}</small></div>}
    </td>
    <td data-label="Status"><Status value={status} tone={noTasks ? "done" : undefined}/></td>
  </tr>;
}
