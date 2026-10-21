import { statusLabel, statusTone, type StatusTone } from "@/lib/status";

export function Status({ value, tone }: { value: string; tone?: StatusTone }) {
  return <span className={`badge status status-${tone ?? statusTone(value)}`}>{statusLabel(value)}</span>;
}
