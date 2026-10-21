import assert from "node:assert/strict";
import test from "node:test";
import { calculateEventMetrics, emptyMetrics, eventLifecycleStage, sumEventMetrics, type Benefit, type EventMetricsInput } from "../lib/event-metric-values";

function benefit(id: string, changes: Partial<Benefit> = {}): Benefit {
  return { id, event_id: "event", sponsor_id: "sponsor", contract_id: null, title: id, status: "Offen", evidence_summary: null, quantity: 1, ...changes };
}

function input(changes: Partial<EventMetricsInput> = {}): EventMetricsInput {
  return { assignments: [{ event_id: "event", sponsor_id: "sponsor" }], contracts: [], benefits: [], tasks: [], evidence: [], documents: [], reports: [], ...changes };
}

test("benefits without tasks are counted in the agreement but excluded from progress", () => {
  const result = calculateEventMetrics(["event"], input({
    benefits: [benefit("untracked", { completion_required: false }), benefit("tracked")],
    tasks: [{ id: "old-task", event_id: "event", benefit_id: "untracked", status: "Erledigt", workflow_instance: 1 }],
  })).event;
  assert.equal(result.benefits, 2);
  assert.equal(result.trackedBenefits, 1);
  assert.equal(result.completed, 0);
  assert.equal(result.evidenceTasks, 1);
  assert.equal(result.completedEvidenceTasks, 0);
});

test("obsolete units do not prevent completion of a shared workflow", () => {
  const tasks = [
    { id: "current", event_id: "event", benefit_id: "benefit", status: "Erledigt", workflow_instance: 1 },
    { id: "obsolete", event_id: "event", benefit_id: "benefit", status: "Offen", workflow_instance: 2 },
  ];
  const oneWorkflow = calculateEventMetrics(["event"], input({ benefits: [benefit("benefit", { quantity: 20, tasks_per_unit: false })], tasks })).event;
  const perUnit = calculateEventMetrics(["event"], input({ benefits: [benefit("benefit", { quantity: 2, tasks_per_unit: true })], tasks })).event;
  assert.equal(oneWorkflow.completed, 1);
  assert.equal(oneWorkflow.evidenceTasks, 1);
  assert.equal(perUnit.completed, 0);
  assert.equal(perUnit.evidenceTasks, 2);
});

test("legacy evidence and completion labels still count after extraction", () => {
  const result = calculateEventMetrics(["event"], input({ benefits: [benefit("legacy", { evidence_summary: "banner.jpg" }), benefit("status", { status: "Erfüllt" })] })).event;
  assert.equal(result.completed, 2);
  assert.equal(result.completedEvidenceTasks, 2);
});

test("normalized duplicate titles count once for the same sponsor", () => {
  const result = calculateEventMetrics(["event"], input({ benefits: [benefit("a", { title: " Banner   am Eingang " }), benefit("b", { title: "banner am eingang" })] })).event;
  assert.equal(result.benefits, 1);
  assert.equal(result.trackedBenefits, 1);
});

test("unassigned sponsors cannot contribute money or benefits to an event", () => {
  const result = calculateEventMetrics(["event"], input({
    contracts: [{ id: "contract", event_id: "event", sponsor_id: "not-assigned", value_cents: 500000 }],
    benefits: [benefit("other", { sponsor_id: "not-assigned" })],
  })).event;
  assert.equal(result.sponsors, 1);
  assert.equal(result.sponsorship, 0);
  assert.equal(result.benefits, 0);
});

test("signed volume and final lifecycle require the actual report states", () => {
  const data = input({
    contracts: [{ id: "contract", event_id: "event", sponsor_id: "sponsor", value_cents: 1500000, signature_status: "signed" }],
    documents: [{ contract_id: "contract", kind: "generated_pdf" }],
    reports: [{ contract_id: "contract", generated_at: "2026-10-21T12:00:00Z", sent_at: null }],
  });
  const beforeSending = calculateEventMetrics(["event"], data).event;
  assert.equal(beforeSending.signedSponsorship, 15000);
  assert.equal(eventLifecycleStage(beforeSending).label, "Alle Verträge unterschrieben");
  data.reports[0].sent_at = "2026-10-21T12:05:00Z";
  assert.equal(eventLifecycleStage(calculateEventMetrics(["event"], data).event).label, "Abgeschlossen");
});

test("empty and aggregated event metrics remain independent", () => {
  assert.deepEqual(calculateEventMetrics([], input()), {});
  const total = sumEventMetrics([{ ...emptyMetrics(), sponsors: 2, sponsorship: 1000 }, { ...emptyMetrics(), sponsors: 1, sponsorship: 500 }]);
  assert.equal(total.sponsors, 3);
  assert.equal(total.sponsorship, 1500);
  assert.equal(emptyMetrics().sponsors, 0);
});
