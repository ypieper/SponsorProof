"use client";

import { Icon } from "@/components/ui";
import { formatFeedbackDate } from "@/lib/display-format";
import type { PortalFile } from "@/lib/sponsor-portal/types";

export function SponsorEvidenceLink({ file, disabled = false }: { file: PortalFile; disabled?: boolean }) {
  const canPreview = file.content_type === "application/pdf" || file.content_type.startsWith("image/");
  const versionDate = formatFeedbackDate(file.created_at);
  if (disabled) return <button className="btn" type="button" disabled title="Dateien können in der Demo nicht geöffnet oder heruntergeladen werden." aria-label={`Datei in der Demo nicht verfügbar: ${file.file_name}`} key={file.id}><Icon name="file" size={14}/>{file.file_name}</button>;
  return <a className="btn" href={file.url} target="_blank" rel="noopener noreferrer" key={file.id}><Icon name="file" size={14}/>{canPreview ? "In neuem Tab ansehen" : "Datei herunterladen"}: {file.file_name}{versionDate && ` · ${versionDate}`}</a>;
}

export function SponsorEvidenceHistory({ files, disabled = false }: { files: PortalFile[]; disabled?: boolean }) {
  const versions = files.slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
  const [current, ...previous] = versions;
  if (!current) return null;
  return <div className="sponsor-portal-review-files">
    <SponsorEvidenceLink file={current} disabled={disabled}/>
    {previous.length > 0 && <details className="sponsor-portal-previous-versions"><summary>Vorherige Versionen ({previous.length})<Icon name="chevron" size={13}/></summary><div>{previous.map((file) => <SponsorEvidenceLink file={file} disabled={disabled} key={file.id}/>)}</div></details>}
  </div>;
}

export function SponsorCompletedTaskRow({ task, benefitName, demoMode = false }: { task: { id: string; title: string; sponsor_approval_status: string; sponsor_approved_at: string | null; files: PortalFile[] }; benefitName?: string; demoMode?: boolean }) {
  const approved = task.sponsor_approval_status === "approved";
  return <article className="sponsor-portal-completed-task" key={task.id}>
    <div className="sponsor-portal-completed-task-copy">
      <b>{task.title}</b>
      <small>{approved ? `Freigegeben${task.sponsor_approved_at ? ` am ${formatFeedbackDate(task.sponsor_approved_at)}` : ""}` : "Abgeschlossen"}</small>
      {benefitName && <small className="sponsor-portal-task-benefit-label">Leistung: {benefitName}</small>}
    </div>
    <div className="sponsor-portal-completed-task-files">
      {task.files.length > 0 ? <SponsorEvidenceHistory files={task.files} disabled={demoMode}/> : <small className="sponsor-portal-unit-wait">Kein Nachweis angehängt.</small>}
    </div>
    <span className="sponsor-benefit-status sponsor-benefit-status-done">{approved ? "Freigegeben" : "Abgeschlossen"}</span>
  </article>;
}
