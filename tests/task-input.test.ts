import assert from "node:assert/strict";
import test from "node:test";
import { taskInsertValues } from "../lib/tasks/input";

test("new tasks start open without old approvals or assignments", () => {
  const values = taskInsertValues({ title: "Banner aufhängen" }, "organization", "Manuell");
  assert.equal(values.status, "Offen");
  assert.equal(values.sponsor_approval_status, "not_required");
  assert.equal(values.assigned_to, null);
  assert.equal(values.due_at, null);
  assert.equal(values.source, "Manuell");
});

test("single and bulk task creation store the same explicitly configured workflow", () => {
  const input = { title: "Entwurf freigeben", source: "Leistung" as const, eventId: "event", sponsorId: "sponsor", benefitId: "benefit", workflowOrder: 2, workflowInstance: 3, completionType: "sponsor_approval" as const };
  assert.deepEqual(taskInsertValues(input, "org", "Manuell"), taskInsertValues(input, "org", "Leistung"));
  assert.equal(taskInsertValues(input, "org", "Leistung").sponsor_approval_status, "pending");
});

test("sponsor uploads retain their assigned party without requiring sponsor approval", () => {
  const values = taskInsertValues({ title: "Logo liefern", completionType: "sponsor_upload", assignedToSponsor: true }, "org", "Leistung");
  assert.equal(values.assigned_to_sponsor, true);
  assert.equal(values.requires_sponsor_approval, false);
});
