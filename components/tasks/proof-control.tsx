"use client";

import { Icon } from "@/components/ui";
import { downloadStoredEvidence } from "@/lib/evidence-storage";
import type { Evidence,Task } from "@/lib/tasks/types";
import { useRef, useState, type ChangeEvent, type ReactNode } from "react";

export function TaskProofControl({ task, evidence, disabled, mobileMode = false, actionMenu = false, extraActions, onProofAdded, onProofDeleted }: { task: Task; evidence?: Evidence; disabled: boolean; mobileMode?: boolean; actionMenu?: boolean; extraActions?: ReactNode; onProofAdded: (task: Task, file: File) => Promise<boolean>; onProofDeleted: (task: Task) => Promise<void> }) {
  const uploadRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [proofSaved, setProofSaved] = useState(false);

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError("Dateien dürfen höchstens 10 MB groß sein.");
      return;
    }
    setSaving(true);
    setError("");
    setProofSaved(false);
    try {
      if (await onProofAdded(task, file)) setProofSaved(true);
    } catch {
      setError("Der Nachweis konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  }

  async function downloadEvidence() {
    if (!evidence) return;
    const { data, error } = await downloadStoredEvidence(evidence);
    if (error || !data) { setError("Der Nachweis konnte nicht geladen werden."); return; }
    const url = URL.createObjectURL(data);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = evidence.name;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function removeEvidence() {
    if (!evidence || !window.confirm(`Möchtest du den Nachweis „${evidence.name}“ wirklich löschen?`)) return;
    setSaving(true);
    setError("");
    setProofSaved(false);
    try {
      await onProofDeleted(task);
    } catch {
      setError("Der Nachweis konnte nicht gelöscht werden.");
    } finally {
      setSaving(false);
    }
  }

  return <div className={`task-proof-control ${evidence ? "has-evidence" : ""} ${mobileMode ? "mobile-proof-control" : ""}`}>
    <input ref={uploadRef} type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" hidden onChange={handleFile} />
    <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={handleFile} />
    {evidence && <span className="task-proof-file" title={`${evidence.name}${evidence.createdAt ? ` · ${new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" }).format(new Date(evidence.createdAt))}` : ""}`}><Icon name="check" size={13}/>{evidence.name}{evidence.createdAt && ` · ${new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" }).format(new Date(evidence.createdAt))}`}</span>}
    <div className={`task-proof-actions ${evidence ? "compact" : ""} ${actionMenu ? "task-proof-actions-menu-mode" : ""}`}>
      {(() => {
        const returned = task.status !== "Erledigt" && Boolean(task.sponsorApprovalStatus === "changes_requested" || task.sponsorFeedback?.length || task.organizerFeedback?.some((feedback) => feedback.decision === "organizer_changes_requested"));
        const replaceLabel = evidence || returned ? "Datei ersetzen" : "Datei hochladen";
        return <button className={`btn task-proof-upload ${evidence && !returned && !actionMenu ? "task-proof-icon-button" : ""} ${returned ? "btn-primary task-proof-replace-prominent" : ""}`} type="button" onClick={() => uploadRef.current?.click()} disabled={disabled || saving || !task.eventId} aria-label={evidence || returned ? replaceLabel : undefined} title={evidence || returned ? replaceLabel : undefined}><Icon name="file" size={14}/>{!evidence || returned || actionMenu ? replaceLabel : null}</button>;
      })()}
      {actionMenu ? <details className="task-overflow-menu task-proof-overflow-menu"><summary className="btn" aria-label="Weitere Aufgabenaktionen" title="Weitere Aufgabenaktionen"><Icon name="menu" size={15}/></summary><div className="task-overflow-menu-items"><button className="btn task-overflow-menu-item" type="button" onClick={() => cameraRef.current?.click()} disabled={disabled || saving || !task.eventId}><Icon name="camera" size={14}/> Foto aufnehmen</button>{evidence && <><button className="btn task-overflow-menu-item" type="button" onClick={() => void downloadEvidence()} disabled={saving}><Icon name="download" size={14}/> Datei herunterladen</button><button className="btn task-overflow-menu-item" type="button" onClick={() => { void removeEvidence(); }} disabled={disabled || saving}><Icon name="trash" size={14}/> Datei löschen</button></>}{extraActions}</div></details> : <><button className={`btn task-proof-camera ${evidence ? "task-proof-icon-button" : ""}`} type="button" onClick={() => cameraRef.current?.click()} disabled={disabled || saving || !task.eventId} aria-label={evidence ? "Foto aufnehmen" : undefined} title={evidence ? "Foto aufnehmen" : undefined}><Icon name="camera" size={14}/>{!evidence && (mobileMode ? "Foto aufnehmen" : "Kamera")}</button>{evidence && <><button className="btn task-proof-icon-button" type="button" onClick={downloadEvidence} disabled={saving} aria-label="Datei herunterladen" title="Herunterladen"><Icon name="download" size={14}/></button><button className="btn task-proof-delete task-proof-icon-button" type="button" onClick={() => { void removeEvidence(); }} disabled={disabled || saving} aria-label="Datei löschen" title="Löschen"><Icon name="trash" size={14}/></button></>}</>}
    </div>
    {!task.eventId && <span className="task-proof-error">Ordne die Aufgabe zuerst einem Event zu, um einen Nachweis hinzuzufügen.</span>}
    {mobileMode && proofSaved && <span className="task-proof-success" role="status"><Icon name="check" size={14}/> Nachweis gespeichert</span>}
    {error && <span className="task-proof-error" role="alert">{error}</span>}
    {saving && <span className="task-proof-saving" role="status">Nachweis wird gespeichert …</span>}
  </div>;
}
