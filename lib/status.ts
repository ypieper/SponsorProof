import { isCompletedBenefitStatus } from "./benefit-workflow";

export type StatusTone = "done" | "progress" | "open" | "waiting";

export function statusTone(value: string): StatusTone {
  if (isCompletedBenefitStatus(value)) return "done";
  if (value === "In Arbeit" || value === "In Bearbeitung") return "progress";
  if (value === "Warte auf Sponsor" || value === "Wartet auf Sponsor") return "waiting";
  return "open";
}

export function statusLabel(value: string) {
  return isCompletedBenefitStatus(value) ? "Abgeschlossen" : value;
}

export function clampProgress(value: number) {
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
}
