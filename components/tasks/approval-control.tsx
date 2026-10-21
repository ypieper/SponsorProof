"use client";

import { Modal } from "@/components/modal";
import { Icon } from "@/components/ui";
import type { Evidence,Task } from "@/lib/tasks/types";
import { isSponsorApprovalTask } from "@/lib/tasks/workflow";
import { useState } from "react";

export function OrganizerApprovalControl({ task, previousEvidence, sponsorApprovalFollows, canRevoke = true, disabled, busy, onApprove, onReject, onRevoke }: { task: Task; previousEvidence?: Evidence; sponsorApprovalFollows: boolean; canRevoke?: boolean; disabled: boolean; busy: boolean; onApprove: (task: Task, sharePreviousFile: boolean) => Promise<boolean>; onReject: (task: Task, comment: string) => Promise<boolean>; onRevoke: (task: Task, comment: string) => Promise<boolean> }) {
  const [dialog, setDialog] = useState<"approve" | "reject" | "revoke" | null>(null);
  const [comment, setComment] = useState("");
  const [sharePreviousFile, setSharePreviousFile] = useState(false);
  const completed = task.status === "Erledigt";
  async function submit() {
    const succeeded = dialog === "approve" ? await onApprove(task, sharePreviousFile) : dialog === "reject" ? await onReject(task, comment) : dialog === "revoke" ? await onRevoke(task, comment) : false;
    if (succeeded) { setDialog(null); setComment(""); setSharePreviousFile(false); }
  }
  function startApproval() {
    if (sponsorApprovalFollows) {
      setSharePreviousFile(false);
      setDialog("approve");
      return;
    }
    void onApprove(task, false);
  }
  return <div className="organizer-approval-control">{completed ? <div className="organizer-approval-completed"><span className="task-sponsor-approved"><Icon name="check" size={13}/> Bestätigt</span>{canRevoke && <button className="btn organizer-approval-revoke" type="button" disabled={disabled || busy} onClick={() => { setComment(""); setDialog("revoke"); }}>Freigabe zurücknehmen</button>}</div> : <div className="organizer-approval-actions"><button className="btn" type="button" disabled={disabled || busy} onClick={() => { setComment(""); setDialog("reject"); }}>Ablehnen</button><button className="btn btn-primary" type="button" disabled={disabled || busy} onClick={startApproval}>{busy ? "Wird gespeichert …" : "Bestätigen"}</button></div>}
    {dialog && <Modal labelledBy={`organizer-task-dialog-${task.id}`} className="create-modal organizer-task-modal" backdropClassName="modal-backdrop organizer-task-modal-backdrop" role="dialog" busy={busy} onClose={() => setDialog(null)}><div className="create-modal-head"><div><h2 id={`organizer-task-dialog-${task.id}`}>{dialog === "approve" ? "Aufgabe bestätigen" : dialog === "reject" ? "Aufgabe ablehnen" : "Freigabe zurücknehmen"}</h2><p>{dialog === "approve" ? "Für die folgende Sponsorenfreigabe muss die Datei bereitgestellt werden." : dialog === "reject" ? "Die Aufgabe geht an den vorherigen Arbeitsschritt zurück. Der vorherige Nachweis wird gelöscht; spätere Schritte müssen danach erneut abgeschlossen werden." : "Die vorherige Datei wird gelöscht. Alle späteren Schritte werden zurückgesetzt und müssen erneut abgeschlossen werden; eine Sponsorenfreigabe wird ausgeblendet."}</p></div><button className="icon-button" type="button" aria-label="Dialog schließen" disabled={busy} onClick={() => setDialog(null)}><Icon name="close" size={16}/></button></div>
      {dialog === "approve" ? previousEvidence ? <label className="organizer-task-share-choice"><input type="checkbox" checked={sharePreviousFile} onChange={(event) => setSharePreviousFile(event.target.checked)}/><span><b>Datei für die Sponsorenfreigabe bereitstellen *</b><small>{previousEvidence.name}</small></span></label> : <p className="organizer-task-no-file">Für die folgende Sponsorenfreigabe muss zuerst eine Datei in der vorherigen Aufgabe hochgeladen werden.</p> : <label className="settings-field organizer-task-reject-comment"><span>{dialog === "revoke" ? "Grund für die Rücknahme *" : "Grund für die Ablehnung *"}</span><textarea autoFocus rows={4} required maxLength={2000} value={comment} onChange={(event) => setComment(event.target.value)} placeholder={dialog === "revoke" ? "Warum wird die Freigabe zurückgenommen?" : "Was muss geändert werden?"} /></label>}
      <div className="create-modal-actions"><button className="btn" type="button" disabled={busy} onClick={() => setDialog(null)}>Abbrechen</button><button className={`btn ${dialog === "approve" ? "btn-primary" : "organizer-task-reject-button"}`} type="button" disabled={disabled || busy || (dialog !== "approve" && !comment.trim()) || (dialog === "approve" && sponsorApprovalFollows && (!previousEvidence || !sharePreviousFile))} onClick={() => void submit()}>{busy ? "Wird gespeichert …" : dialog === "approve" ? "Bestätigung speichern" : dialog === "revoke" ? "Freigabe zurücknehmen" : "Ablehnung senden"}</button></div></Modal>}
  </div>;
}

export function SponsorApprovalStatus({ task }: { task: Task }) {
  if (task.sponsorApprovalStatus === "approved") return <span className="task-sponsor-approved"><Icon name="check" size={13}/> Vom Sponsor freigegeben</span>;
  if (task.sponsorApprovalStatus === "changes_requested" && task.blockedBy) return <span className="task-sponsor-returned">Änderung angefragt · wartet auf die neue Datei.</span>;
  if (task.sponsorApprovalStatus === "changes_requested") return <span className="task-caption">Wartet auf Freigabe des Sponsors.</span>;
  return <span className="task-caption">{task.blockedBy ? "Sponsorenfreigabe wird vorbereitet." : "Wartet auf Sponsorenfreigabe"}</span>;
}

export function SponsorProofPendingNotice({ task, evidence }: { task: Task; evidence?: Evidence }) {
  if (task.source !== "Manuell" || task.benefitId || !isSponsorApprovalTask(task) || evidence) return null;
  return <span className="sponsor-proof-pending-notice">Nachweis noch nicht hochgeladen · für den Sponsor erst nach dem Upload sichtbar.</span>;
}
