export type EventPlanLabelCode = "free" | "event" | "event_pro" | "enterprise";

const eventPlanLabels: Record<EventPlanLabelCode, string> = {
  free: "Free",
  event: "Basic",
  event_pro: "Pro",
  enterprise: "Enterprise",
};

export function eventPlanLabel(code: EventPlanLabelCode) {
  return eventPlanLabels[code];
}
