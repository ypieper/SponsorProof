import assert from "node:assert/strict";
import test from "node:test";
import { benefitWorkflowCount, getBenefitStatus, sortWorkflowTasks } from "../lib/benefit-workflow";
import type { Task } from "../lib/tasks/types";
import { applyWorkflowDependencies, taskStatus, workflowStatus } from "../lib/tasks/workflow";

function task(id: string, changes: Partial<Task> = {}): Task {
  return { id, title: id, sponsor: "Sponsor", sponsorId: "sponsor", due: "—", status: "Offen", eventId: "event", eventTitle: "Event", source: "Leistung", storedTask: true, benefitId: "benefit", workflowInstance: 1, workflowOrder: 1, completionType: "file_required", ...changes };
}

test("later workflow steps wait for the first incomplete step", () => {
  const items = applyWorkflowDependencies([task("upload"), task("review", { workflowOrder: 2, completionType: "sponsor_approval" })]);
  assert.equal(items[0].currentWorkflowStep, true);
  assert.equal(items[1].blockedBy, "upload");
  assert.equal(items[1].currentWorkflowStep, false);
});

test("completion unlocks the following step without unlocking another unit", () => {
  const items = applyWorkflowDependencies([task("upload", { status: "Erledigt" }), task("review", { workflowOrder: 2 }), task("second-upload", { workflowInstance: 2 }), task("second-review", { workflowInstance: 2, workflowOrder: 2 })]);
  assert.equal(items[1].blockedBy, undefined);
  assert.equal(items[1].currentWorkflowStep, true);
  assert.equal(items[3].blockedBy, "second-upload");
});

test("unrelated benefits and standalone tasks remain independent", () => {
  const items = applyWorkflowDependencies([task("first"), task("other", { benefitId: "other" }), task("manual", { storedTask: false, benefitId: undefined })]);
  assert.ok(items.every((item) => !item.blockedBy));
  assert.equal(items[2].currentWorkflowStep, false);
});

test("returned sponsor tasks show whether a replacement is still blocked", () => {
  assert.equal(taskStatus(task("review", { sponsorApprovalStatus: "changes_requested", blockedBy: "upload" })), "Änderung angefragt");
  assert.equal(taskStatus(task("review", { sponsorApprovalStatus: "changes_requested" })), "Warte auf Sponsor");
});

test("manual sponsor approval waits for its evidence", () => {
  const item = task("review", { source: "Manuell", completionType: "sponsor_approval" });
  assert.equal(taskStatus(item, false), "Nachweis fehlt");
  assert.equal(taskStatus(item, true), "Warte auf Sponsor");
});

test("workflow status distinguishes completed, active sponsor and empty workflows", () => {
  assert.equal(workflowStatus([]), "Offen");
  assert.equal(workflowStatus([task("done", { status: "Erledigt" })]), "Abgeschlossen");
  assert.equal(workflowStatus([task("sponsor", { assignedToSponsor: true })]), "Warte auf Sponsor");
});

test("shared quantity counts handle one workflow for an entire delivery", () => {
  assert.equal(benefitWorkflowCount(20, false), 1);
  assert.equal(benefitWorkflowCount(20, true), 20);
  assert.equal(benefitWorkflowCount(0), 1);
  assert.equal(benefitWorkflowCount(Infinity), 1);
});

test("benefits without tasks stay separate from completed task workflows", () => {
  assert.equal(getBenefitStatus({ status: "Offen", completionRequired: false }, []), "Keine Aufgaben vorgesehen");
  assert.equal(getBenefitStatus({ status: "Abgeschlossen" }, []), "Erledigt");
  assert.equal(getBenefitStatus({ status: "Offen", evidence: "Noch kein Nachweis" }, []), "Offen");
});

test("workflow sorting does not mutate the caller's array", () => {
  const tasks = [{ workflow_instance: 2, workflow_order: 1 }, { workflow_instance: 1, workflow_order: 2 }, { workflow_instance: 1, workflow_order: 1 }];
  const sorted = sortWorkflowTasks(tasks);
  assert.deepEqual(sorted.map((item) => [item.workflow_instance, item.workflow_order]), [[1, 1], [1, 2], [2, 1]]);
  assert.equal(tasks[0].workflow_instance, 2);
});
