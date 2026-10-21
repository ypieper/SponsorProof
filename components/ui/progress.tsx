import { clampProgress } from "@/lib/status";

export function Progress({ value, label = "Fortschritt" }: { value: number; label?: string }) {
  const progress = clampProgress(value);
  return <div className="progress-wrap"><div className="progress-track" role="progressbar" aria-label={label} aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><div className="progress-fill" style={{ width: `${progress}%` }} /></div><span className="progress-num">{progress}%</span></div>;
}
