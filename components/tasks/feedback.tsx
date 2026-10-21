"use client";

import { Icon } from "@/components/ui";
import { formatFeedbackDate } from "@/lib/display-format";
import { downloadStoredEvidence } from "@/lib/evidence-storage";
import type { Evidence,OrganizerTaskFeedback,SponsorTaskFeedback } from "@/lib/tasks/types";

export function TaskFeedbackNotice({ feedback, decision, collapsed = false }: { feedback: SponsorTaskFeedback | OrganizerTaskFeedback; decision: "sponsor_return" | "organizer_return" | "organizer_revoked"; collapsed?: boolean }) {
  const label = decision === "organizer_revoked" ? "Bestätigung zurückgenommen" : "Grund der Rückgabe";
  if (collapsed) return <details className="task-feedback-archive"><summary><span>{label}</span><time dateTime={feedback.created_at}>{formatFeedbackDate(feedback.created_at)}</time></summary><p>{feedback.comment}</p></details>;
  return <span className="task-sponsor-feedback"><b>{label}<time dateTime={feedback.created_at}>{formatFeedbackDate(feedback.created_at)}</time></b><span>{feedback.comment}</span></span>;
}

export function TaskVersionHistory({ versions, feedback, onDownloadError }: { versions: Evidence[]; feedback: Array<{ feedback: SponsorTaskFeedback | OrganizerTaskFeedback; decision: "sponsor_return" | "organizer_return" }>; onDownloadError: () => void }) {
  if (!versions.length && !feedback.length) return null;
  const historyCount = versions.length + feedback.length;
  return <details className="task-version-history">
    <summary><span>Versionsverlauf</span><small>{historyCount}</small><Icon name="chevron" size={13}/></summary>
    <div className="task-version-history-content">
      {feedback.map(({ feedback: entry, decision }) => <TaskFeedbackNotice feedback={entry} decision={decision} key={`${decision}-${entry.id}`}/>)}
      {versions.map((version) => <button className="btn task-version-file" type="button" key={version.id} onClick={async () => {
        const { data, error } = await downloadStoredEvidence(version);
        if (error || !data) { onDownloadError(); return; }
        const url = URL.createObjectURL(data);
        const link = document.createElement("a");
        link.href = url;
        link.download = version.name;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }}><Icon name="file" size={13}/><span>{version.name}</span><time>{version.createdAt ? formatFeedbackDate(version.createdAt) : ""}</time></button>)}
    </div>
  </details>;
}
