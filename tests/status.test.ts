import assert from "node:assert/strict";
import test from "node:test";
import { sponsorTabFingerprint, sponsorTabReadKey } from "../lib/sponsor-portal/tab-updates";
import { clampProgress, statusLabel, statusTone } from "../lib/status";

test("completion synonyms use one label and visual tone", () => {
  for (const value of ["Erledigt", "Erfüllt", "Abgeschlossen"]) {
    assert.equal(statusLabel(value), "Abgeschlossen");
    assert.equal(statusTone(value), "done");
  }
});

test("both existing spellings of sponsor waiting states use the same badge", () => {
  assert.equal(statusTone("Warte auf Sponsor"), "waiting");
  assert.equal(statusTone("Wartet auf Sponsor"), "waiting");
  assert.equal(statusTone("Keine Aufgaben vorgesehen"), "open");
});

test("invalid progress can never produce an overflowing bar or NaN percentage", () => {
  assert.equal(clampProgress(-5), 0);
  assert.equal(clampProgress(150), 100);
  assert.equal(clampProgress(Number.NaN), 0);
  assert.equal(clampProgress(Infinity), 0);
  assert.equal(clampProgress(42), 42);
});

test("reading a tab is scoped to the sponsor, event and tab", () => {
  assert.notEqual(sponsorTabReadKey("event-a", "sponsor", "tasks"), sponsorTabReadKey("event-b", "sponsor", "tasks"));
  assert.notEqual(sponsorTabReadKey("event", "sponsor-a", "tasks"), sponsorTabReadKey("event", "sponsor-b", "tasks"));
  assert.notEqual(sponsorTabReadKey("event", "sponsor", "tasks"), sponsorTabReadKey("event", "sponsor", "documents"));
});

test("changed tab contents get a new fingerprint", () => {
  assert.equal(sponsorTabFingerprint([{ id: "task", status: "Offen" }]), sponsorTabFingerprint([{ id: "task", status: "Offen" }]));
  assert.notEqual(sponsorTabFingerprint([{ id: "task", status: "Offen" }]), sponsorTabFingerprint([{ id: "task", status: "Erledigt" }]));
});
