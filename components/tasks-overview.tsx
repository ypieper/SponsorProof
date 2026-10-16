"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { EmptyState, Icon, PageHeading, Status } from "@/components/ui";
import { fetchSponsorRecords } from "@/lib/sponsors-storage";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { fetchStoredEventsFromDatabase } from "@/lib/events-storage";
import { fetchStoredBenefits, updateStoredBenefit } from "@/lib/benefits-storage";
import { createStoredTask, deleteStoredTask, fetchStoredTasks, updateStoredTask, type CompletionType } from "@/lib/tasks-storage";
import { deleteStoredEvidenceRecord, downloadStoredEvidence, fetchStoredEvidence, uploadStoredEvidence, type StoredEvidence } from "@/lib/evidence-storage";
import { useEventEntitlements } from "@/components/event-entitlements";
import { createClient } from "@/lib/supabase/client";

type SponsorTaskFeedback = { id: string; decision: string; comment: string; created_at: string };
type OrganizerTaskFeedback = { id: string; decision: string; comment: string; created_at: string };
type Task = { id: string; title: string; sponsor: string; sponsorId: string; due: string; dueAt?: string; status: "Offen" | "Erledigt"; eventId: string; eventTitle: string; source: "Leistung" | "Manuell"; storedTask?: boolean; benefitId?: string; benefitTitle?: string; benefitQuantity?: number; benefitType?: "monetary" | "in_kind"; workflowOrder?: number; workflowInstance?: number; completionType?: CompletionType; blockedBy?: string; assignee?: string; assigneeId?: string; assignedToSponsor?: boolean; publishReady?: boolean; sponsorApprovalStatus?: string; requiresSponsorApproval?: boolean; sponsorFeedback?: SponsorTaskFeedback[]; organizerFeedback?: OrganizerTaskFeedback[] };

function applyWorkflowDependencies(tasks: Task[]): Task[] {
  const blockers = new Map<string, string>();
  const workflows = new Map<string, Task[]>();
  for (const task of tasks) {
    if (task.storedTask && task.benefitId && task.workflowOrder != null) {
      const groupKey = `${task.benefitId}:${task.workflowInstance ?? 1}`;
      const group = workflows.get(groupKey) ?? [];
      group.push(task);
      workflows.set(groupKey, group);
    }
  }
  for (const workflow of workflows.values()) {
    workflow.sort((a, b) => (a.workflowOrder ?? 0) - (b.workflowOrder ?? 0));
    for (let index = 1; index < workflow.length; index += 1) {
      const incomplete = workflow.slice(0, index).find((previous) => previous.status !== "Erledigt");
      if (incomplete) blockers.set(workflow[index].id, incomplete.title);
    }
  }
  return tasks.map((task) => ({ ...task, blockedBy: blockers.get(task.id) }));
}
type Evidence = StoredEvidence;
const emptyDraft = { title: "", sponsor: "", sponsorId: "", assigneeId: "", due: "", eventId: "", completionType: "file_required" as CompletionType };
function formatDue(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  return new Intl.DateTimeFormat("de-DE").format(new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}
function formatFeedbackDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function TaskFeedbackNotice({ feedback, decision, collapsed = false }: { feedback: SponsorTaskFeedback | OrganizerTaskFeedback; decision: "sponsor_return" | "organizer_return" | "organizer_revoked"; collapsed?: boolean }) {
  const label = decision === "organizer_revoked" ? "Bestätigung zurückgenommen" : "Grund der Rückgabe";
  if (collapsed) return <details className="task-feedback-archive"><summary><span>{label}</span><time dateTime={feedback.created_at}>{formatFeedbackDate(feedback.created_at)}</time></summary><p>{feedback.comment}</p></details>;
  return <span className="task-sponsor-feedback"><b>{label}<time dateTime={feedback.created_at}>{formatFeedbackDate(feedback.created_at)}</time></b><span>{feedback.comment}</span></span>;
}

function TaskProofControl({ task, evidence, disabled, mobileMode = false, onProofAdded, onProofDeleted }: { task: Task; evidence?: Evidence; disabled: boolean; mobileMode?: boolean; onProofAdded: (task: Task, file: File) => Promise<boolean>; onProofDeleted: (task: Task) => Promise<void> }) {
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
    {evidence && <span className="task-proof-file" title={evidence.name}><Icon name="check" size={13}/>{evidence.name}</span>}
    <div className={`task-proof-actions ${evidence ? "compact" : ""}`}>
      <button className={`btn task-proof-upload ${evidence ? "task-proof-icon-button" : ""}`} type="button" onClick={() => uploadRef.current?.click()} disabled={disabled || saving || !task.eventId} aria-label={evidence ? "Nachweis ersetzen" : undefined} title={evidence ? "Nachweis ersetzen" : undefined}><Icon name="file" size={14}/>{!evidence && "Datei hochladen"}</button>
      <button className={`btn task-proof-camera ${evidence ? "task-proof-icon-button" : ""}`} type="button" onClick={() => cameraRef.current?.click()} disabled={disabled || saving || !task.eventId} aria-label={evidence ? "Foto aufnehmen" : undefined} title={evidence ? "Foto aufnehmen" : undefined}><Icon name="camera" size={14}/>{!evidence && (mobileMode ? "Foto aufnehmen" : "Kamera")}</button>
      {evidence && <><button className="btn task-proof-icon-button" type="button" onClick={downloadEvidence} disabled={saving} aria-label="Nachweis herunterladen" title="Herunterladen"><Icon name="download" size={14}/></button><button className="btn task-proof-delete task-proof-icon-button" type="button" onClick={() => { void removeEvidence(); }} disabled={disabled || saving} aria-label="Nachweis löschen" title="Löschen"><Icon name="trash" size={14}/></button></>}
    </div>
    {!task.eventId && <span className="task-proof-error">Ordne die Aufgabe zuerst einem Event zu, um einen Nachweis hinzuzufügen.</span>}
    {mobileMode && proofSaved && <span className="task-proof-success" role="status"><Icon name="check" size={14}/> Nachweis gespeichert</span>}
    {error && <span className="task-proof-error" role="alert">{error}</span>}
    {saving && <span className="task-proof-saving" role="status">Nachweis wird gespeichert …</span>}
  </div>;
}

function OrganizerApprovalControl({ task, previousEvidence, sponsorApprovalFollows, canRevoke = true, disabled, busy, onApprove, onReject, onRevoke }: { task: Task; previousEvidence?: Evidence; sponsorApprovalFollows: boolean; canRevoke?: boolean; disabled: boolean; busy: boolean; onApprove: (task: Task, sharePreviousFile: boolean) => Promise<boolean>; onReject: (task: Task, comment: string) => Promise<boolean>; onRevoke: (task: Task, comment: string) => Promise<boolean> }) {
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
  return <div className="organizer-approval-control">{completed ? <><span className="task-sponsor-approved"><Icon name="check" size={13}/> Bestätigt</span>{canRevoke && <button className="btn organizer-approval-revoke" type="button" disabled={disabled || busy} onClick={() => { setComment(""); setDialog("revoke"); }}>Freigabe zurücknehmen</button>}</> : <div className="organizer-approval-actions"><button className="btn" type="button" disabled={disabled || busy} onClick={() => { setComment(""); setDialog("reject"); }}>Ablehnen</button><button className="btn btn-primary" type="button" disabled={disabled || busy} onClick={startApproval}>{busy ? "Wird gespeichert …" : "Bestätigen"}</button></div>}
    {dialog && <div className="modal-backdrop organizer-task-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setDialog(null); }}><section className="create-modal organizer-task-modal" role="dialog" aria-modal="true" aria-labelledby={`organizer-task-dialog-${task.id}`}><div className="create-modal-head"><div><h2 id={`organizer-task-dialog-${task.id}`}>{dialog === "approve" ? "Aufgabe bestätigen" : dialog === "reject" ? "Aufgabe ablehnen" : "Freigabe zurücknehmen"}</h2><p>{dialog === "approve" ? "Für die folgende Sponsorenfreigabe muss der Nachweis bereitgestellt werden." : dialog === "reject" ? "Der Kommentar wird beim vorherigen Arbeitsschritt angezeigt, damit die Änderung umgesetzt werden kann." : "Der vorherige Nachweis wird gelöscht und die folgenden Schritte werden zurückgesetzt. Eine Sponsorenfreigabe wird dadurch wieder ausgeblendet."}</p></div><button className="icon-button" type="button" aria-label="Dialog schließen" disabled={busy} onClick={() => setDialog(null)}><Icon name="close" size={16}/></button></div>
      {dialog === "approve" ? previousEvidence ? <label className="organizer-task-share-choice"><input type="checkbox" checked={sharePreviousFile} onChange={(event) => setSharePreviousFile(event.target.checked)}/><span><b>Nachweis für die Sponsorenfreigabe bereitstellen *</b><small>{previousEvidence.name}</small></span></label> : <p className="organizer-task-no-file">Für die folgende Sponsorenfreigabe muss zuerst ein Nachweis in der vorherigen Aufgabe hochgeladen werden.</p> : <label className="settings-field organizer-task-reject-comment"><span>{dialog === "revoke" ? "Grund für die Rücknahme *" : "Grund für die Ablehnung *"}</span><textarea autoFocus rows={4} required maxLength={2000} value={comment} onChange={(event) => setComment(event.target.value)} placeholder={dialog === "revoke" ? "Warum wird die Freigabe zurückgenommen?" : "Was muss geändert werden?"} /></label>}
      <div className="create-modal-actions"><button className="btn" type="button" disabled={busy} onClick={() => setDialog(null)}>Abbrechen</button><button className={`btn ${dialog === "approve" ? "btn-primary" : "organizer-task-reject-button"}`} type="button" disabled={disabled || busy || (dialog !== "approve" && !comment.trim()) || (dialog === "approve" && sponsorApprovalFollows && (!previousEvidence || !sharePreviousFile))} onClick={() => void submit()}>{busy ? "Wird gespeichert …" : dialog === "approve" ? "Bestätigung speichern" : dialog === "revoke" ? "Freigabe zurücknehmen" : "Ablehnung senden"}</button></div></section></div>}
  </div>;
}

function SponsorApprovalStatus({ task }: { task: Task }) {
  if (task.sponsorApprovalStatus === "approved") return <span className="task-sponsor-approved"><Icon name="check" size={13}/> Vom Sponsor freigegeben</span>;
  if (task.sponsorApprovalStatus === "changes_requested") return <span className="task-sponsor-returned">Die Aufgabe wurde abgelehnt bzw. zurückgegeben. Eine neue Freigabedatei steht zeitnah bereit.</span>;
  return <span className="task-caption">{task.blockedBy ? "Sponsorenfreigabe wird vorbereitet." : "Wartet auf Sponsorenfreigabe"}</span>;
}

function isSponsorApprovalTask(task: Task) {
  return task.completionType === "sponsor_approval" || task.requiresSponsorApproval;
}

function workflowStatus(tasks: Task[]) {
  if (!tasks.length) return "Offen";
  if (tasks.every((task) => task.status === "Erledigt")) return "Abgeschlossen";
  if (tasks.some((task) => (task.assignedToSponsor || task.completionType === "sponsor_upload") && task.status !== "Erledigt" && !task.blockedBy)) return "Warte auf Sponsor";
  if (tasks.some((task) => isSponsorApprovalTask(task) && task.sponsorApprovalStatus !== "approved" && !task.blockedBy)) return "Warte auf Sponsor";
  return tasks.some((task) => task.status === "Erledigt") ? "In Bearbeitung" : "Offen";
}

function taskStatus(task: Task) {
  if ((task.assignedToSponsor || task.completionType === "sponsor_upload") && task.status !== "Erledigt" && !task.blockedBy) return "Warte auf Sponsor";
  return task.status;
}

export function TasksOverview({ sponsorFilter, sponsorName, eventFilter = "all", embedded = false, mobileMode = false, allowCreate = false }: { sponsorFilter?: string; sponsorName?: string; eventFilter?: string; embedded?: boolean; mobileMode?: boolean; allowCreate?: boolean } = {}) {
  const { ensureFeature } = useEventEntitlements();
  const [items, setItems] = useState<Task[]>([]);
  const [sponsorNames, setSponsorNames] = useState<Record<string, string>>({});
  const [availableSponsors, setAvailableSponsors] = useState<Array<{ id: string; name: string; eventIds: string[] }>>([]);
  const [eventNames, setEventNames] = useState<Record<string, string>>({});
  const [events, setEvents] = useState<Array<{ id: string; title: string }>>([]);
  const [organizerMembers, setOrganizerMembers] = useState<Array<{ user_id: string; email: string; role: string }>>([]);
  const [evidenceByTask, setEvidenceByTask] = useState<Record<string, Evidence>>({});
  const [ready, setReady] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState(() => ({ ...emptyDraft, sponsor: sponsorName ?? "", eventId: eventFilter !== "all" ? eventFilter : emptyDraft.eventId }));
  const [message, setMessage] = useState("");
  const [organizerApprovalBusyId, setOrganizerApprovalBusyId] = useState("");
  const [sponsorTaskCompletionBusyId, setSponsorTaskCompletionBusyId] = useState("");
  const [selectedEvent, setSelectedEvent] = useState(eventFilter);
  const [selectedSponsor, setSelectedSponsor] = useState(sponsorFilter ?? "all");
  const [selectedStatus, setSelectedStatus] = useState<"all" | Task["status"]>("all");
  const [hideCompleted, setHideCompleted] = useState(false);
  const [onlyMyTasks, setOnlyMyTasks] = useState(false);
  const [currentUserId, setCurrentUserId] = useState("");

  useEffect(() => setSelectedEvent(eventFilter), [eventFilter]);
  useEffect(() => setSelectedSponsor(sponsorFilter ?? "all"), [sponsorFilter]);

  useEffect(() => {
    async function loadTasks() {
      try {
        if (!isSupabaseConfigured) throw new Error("Supabase ist nicht eingerichtet.");
        const [evidenceResult, sponsorResult, eventResult, benefitResult, taskResult, feedbackResult, organizerFeedbackResult] = await Promise.all([
          fetchStoredEvidence(), fetchSponsorRecords(), fetchStoredEventsFromDatabase(), fetchStoredBenefits(), fetchStoredTasks(),
          createClient().from("sponsor_task_feedback").select("id, task_id, decision, comment, created_at").order("created_at", { ascending: true }),
          createClient().from("task_workflow_feedback").select("id, task_id, decision, comment, created_at").order("created_at", { ascending: true }),
        ]);
        if (evidenceResult.error || sponsorResult.error || eventResult.error || benefitResult.error || taskResult.error) throw new Error("Supabase-Daten konnten nicht vollständig geladen werden.");
        const sponsorNameMap = Object.fromEntries((sponsorResult.data ?? []).map(({ sponsor }) => [sponsor.id, sponsor.name]));
        setAvailableSponsors((sponsorResult.data ?? []).map(({ sponsor }) => ({ id: sponsor.id, name: sponsor.name, eventIds: sponsor.eventIds })));
        const eventNameMap = Object.fromEntries((eventResult.data ?? []).map((event) => [event.id, event.title]));
        setSponsorNames(sponsorNameMap);
        setEventNames(eventNameMap);
        setEvents((eventResult.data ?? []).map((event) => ({ id: event.id, title: event.title })));
        const evidenceMap = Object.fromEntries((evidenceResult.data ?? []).map((entry) => [entry.taskId, entry]));
        setEvidenceByTask(evidenceMap);
        const storedTasks = taskResult.data ?? [];
        const assignedBenefitIds = new Set(storedTasks.filter((task) => task.source === "Leistung" && task.benefit_id).map((task) => task.benefit_id as string));
        const legacyBenefitTasks: Task[] = (benefitResult.data ?? []).filter((benefit) => !assignedBenefitIds.has(benefit.id)).map((benefit) => ({ id: `benefit-${benefit.id}`, title: benefit.title, sponsor: sponsorNameMap[benefit.sponsorId ?? ""] ?? "—", sponsorId: benefit.sponsorId ?? "", due: benefit.dueAt ? formatDue(benefit.dueAt) : "—", dueAt: benefit.dueAt, status: (evidenceMap[`benefit-${benefit.id}`] || benefit.status === "Erfüllt" || benefit.status === "Erledigt" ? "Erledigt" : "Offen"), eventId: benefit.eventId, eventTitle: eventNameMap[benefit.eventId] ?? "Event nicht gefunden", source: "Leistung", benefitType: benefit.benefitType }));
        const memberEmails = new Map<string, string>();
        const supabase = createClient();
        const [{ data: organizationId }, { data: authResult }] = await Promise.all([supabase.rpc("current_organization_id"), supabase.auth.getUser()]);
        setCurrentUserId(authResult.user?.id ?? "");
        if (typeof organizationId === "string") {
          const { data: members } = await supabase.from("organization_members").select("user_id,email,role").eq("organization_id", organizationId);
          const validMembers = (members ?? []).filter((member) => member.user_id && member.email) as Array<{ user_id: string; email: string; role: string }>;
          setOrganizerMembers(validMembers);
          for (const member of validMembers) memberEmails.set(member.user_id, member.email);
        }
        const benefitsById = new Map((benefitResult.data ?? []).map((benefit) => [benefit.id, benefit]));
        const feedbackByTask = new Map<string, SponsorTaskFeedback[]>();
        for (const feedback of feedbackResult.data ?? []) feedbackByTask.set(feedback.task_id, [...(feedbackByTask.get(feedback.task_id) ?? []), feedback as SponsorTaskFeedback]);
        const organizerFeedbackByTask: Record<string, OrganizerTaskFeedback[]> = {};
        for (const feedback of organizerFeedbackResult.data ?? []) organizerFeedbackByTask[feedback.task_id] = [...(organizerFeedbackByTask[feedback.task_id] ?? []), feedback as OrganizerTaskFeedback];
        const mappedTasks: Task[] = storedTasks.filter((task) => task.source === "Leistung" || task.source === "Manuell").map((task) => ({ id: task.id, title: task.title, sponsor: sponsorNameMap[task.sponsor_id ?? ""] ?? task.sponsor_name ?? "—", sponsorId: task.sponsor_id ?? "", due: task.due_at ? formatDue(task.due_at) : "—", dueAt: task.due_at ?? undefined, status: task.status === "Erledigt" ? "Erledigt" : "Offen", eventId: task.event_id ?? "", eventTitle: eventNameMap[task.event_id ?? ""] ?? "Keinem Event zugeordnet", source: task.source as Task["source"], storedTask: true, benefitId: task.benefit_id ?? undefined, benefitTitle: task.benefit_id ? benefitsById.get(task.benefit_id)?.title : undefined, benefitQuantity: task.benefit_id ? benefitsById.get(task.benefit_id)?.quantity : undefined, benefitType: task.benefit_id ? benefitsById.get(task.benefit_id)?.benefitType : undefined, workflowOrder: task.workflow_order ?? undefined, workflowInstance: task.workflow_instance ?? undefined, completionType: task.completion_type, assignee: task.assigned_to_sponsor || task.completion_type === "sponsor_upload" || task.completion_type === "sponsor_approval" || task.requires_sponsor_approval ? "Sponsor" : task.assigned_to ? memberEmails.get(task.assigned_to) : undefined, assigneeId: task.assigned_to ?? undefined, assignedToSponsor: task.assigned_to_sponsor, publishReady: task.publish_ready, sponsorApprovalStatus: task.sponsor_approval_status, requiresSponsorApproval: task.requires_sponsor_approval, sponsorFeedback: feedbackByTask.get(task.id) ?? [], organizerFeedback: organizerFeedbackByTask[task.id] ?? [] }));
        setItems(applyWorkflowDependencies([...legacyBenefitTasks, ...mappedTasks]));
      } catch {
        setMessage("Gespeicherte Aufgaben konnten nicht geladen werden.");
      } finally {
        setReady(true);
      }
    }
    void loadTasks();
    const refreshOnFocus = () => { void loadTasks(); };
    window.addEventListener("focus", refreshOnFocus);
    window.addEventListener("sponso:event-timeline-updated", refreshOnFocus);
    return () => {
      window.removeEventListener("focus", refreshOnFocus);
      window.removeEventListener("sponso:event-timeline-updated", refreshOnFocus);
    };
  }, []);

  async function addProof(task: Task, file: File): Promise<boolean> {
    if (!task.eventId) {
      setMessage("Ordne die Aufgabe zuerst einem Event zu, um einen Nachweis hinzuzufügen.");
      return false;
    }
    if (!(await ensureFeature(task.eventId, task.eventTitle, "evidence"))) return false;
    const benefitId = task.source === "Leistung" ? task.storedTask ? task.benefitId : task.id.slice("benefit-".length) : undefined;
    const { data, error } = await uploadStoredEvidence({ file, eventId: task.eventId || undefined, taskId: task.id, benefitId });
    if (error || !data) throw error ?? new Error("Nachweis konnte nicht gespeichert werden.");
    const needsSponsorApproval = task.completionType === "sponsor_approval" || task.requiresSponsorApproval;
    if (task.source === "Leistung" && !task.storedTask) {
      const { error } = await updateStoredBenefit(task.id.slice("benefit-".length), { status: "Erfüllt", evidence: file.name });
      if (error) throw error;
    } else if (!needsSponsorApproval) { const { error } = await updateStoredTask(task.id, { status: "Erledigt" }); if (error) throw error; }
    if (task.storedTask && task.benefitId && !needsSponsorApproval) await syncBenefitStatus(task.benefitId);
    window.dispatchEvent(new Event("sponso:event-timeline-updated"));
    setEvidenceByTask((current) => ({ ...current, [task.id]: data }));
    if (!needsSponsorApproval) setItems((current) => applyWorkflowDependencies(current.map((item) => item.id === task.id ? { ...item, status: "Erledigt" as Task["status"] } : item)));
    if (!mobileMode) setMessage(needsSponsorApproval ? `Datei für „${task.title}“ bereitgestellt. Die Sponsorfreigabe ist noch offen.` : `Nachweis für „${task.title}“ gespeichert. Aufgabe abgeschlossen.`);
    return true;
  }

  async function deleteProof(task: Task) {
    const evidence = evidenceByTask[task.id];
    if (evidence) { const { error } = await deleteStoredEvidenceRecord(evidence); if (error) throw error; }
    const needsSponsorApproval = task.completionType === "sponsor_approval" || task.requiresSponsorApproval;
    if (task.source === "Leistung" && !task.storedTask) {
      const { error } = await updateStoredBenefit(task.id.slice("benefit-".length), { status: "Offen", evidence: "Noch kein Nachweis" });
      if (error) throw error;
    } else if (!needsSponsorApproval) { const { error } = await updateStoredTask(task.id, { status: "Offen" }); if (error) throw error; }
    if (task.storedTask && task.benefitId && !needsSponsorApproval) await syncBenefitStatus(task.benefitId);
    window.dispatchEvent(new Event("sponso:event-timeline-updated"));
    setEvidenceByTask((current) => {
      const updated = { ...current };
      delete updated[task.id];
      return updated;
    });
    if (!needsSponsorApproval) setItems((current) => applyWorkflowDependencies(current.map((item) => item.id === task.id ? { ...item, status: "Offen" as const } : item)));
    setMessage(needsSponsorApproval ? `Datei für „${task.title}“ gelöscht. Die Sponsorfreigabe bleibt offen.` : `Nachweis für „${task.title}“ gelöscht. Die Aufgabe ist wieder offen.`);
  }

  async function completeSponsorAssignedTask(task: Task) {
    if (!task.assignedToSponsor || isSponsorApprovalTask(task) || task.status === "Erledigt" || task.blockedBy || !task.storedTask) return;
    if (!(await ensureFeature(task.eventId, task.eventTitle, "tasks"))) return;
    setSponsorTaskCompletionBusyId(task.id);
    setMessage("");
    try {
      const { error } = await updateStoredTask(task.id, { status: "Erledigt" });
      if (error) throw error;
      if (task.benefitId) await syncBenefitStatus(task.benefitId);
      setItems((current) => applyWorkflowDependencies(current.map((item) => item.id === task.id ? { ...item, status: "Erledigt" } : item)));
      window.dispatchEvent(new Event("sponso:event-timeline-updated"));
      setMessage(`„${task.title}“ wurde abgeschlossen.`);
    } catch {
      setMessage("Die Sachleistungsaufgabe konnte nicht abgeschlossen werden.");
    } finally {
      setSponsorTaskCompletionBusyId("");
    }
  }

  function sponsorAssignedTaskControl(task: Task) {
    if (!task.assignedToSponsor || isSponsorApprovalTask(task)) return null;
    if (task.completionType === "sponsor_upload") {
      return evidenceByTask[task.id]
        ? <TaskProofControl task={task} evidence={evidenceByTask[task.id]} disabled mobileMode={mobileMode} onProofAdded={addProof} onProofDeleted={deleteProof}/>
        : <span className="task-caption">Wartet auf Datei-Upload durch Sponsor</span>;
    }
    if (task.status === "Erledigt") return null;
    return <button className="btn btn-primary sponsor-task-complete" type="button" disabled={!ready || Boolean(task.blockedBy) || sponsorTaskCompletionBusyId === task.id} onClick={() => { void completeSponsorAssignedTask(task); }}>{sponsorTaskCompletionBusyId === task.id ? "Wird gespeichert …" : "Als erledigt markieren"}</button>;
  }

  function previousWorkflowTask(task: Task) {
    const workflowOrder = task.workflowOrder;
    if (!task.benefitId || workflowOrder == null) return undefined;
    return items.filter((candidate) => candidate.benefitId === task.benefitId && candidate.workflowInstance === task.workflowInstance && candidate.workflowOrder != null && candidate.workflowOrder < workflowOrder).sort((a, b) => (b.workflowOrder ?? 0) - (a.workflowOrder ?? 0))[0];
  }

  function hasFollowingSponsorApproval(task: Task) {
    const workflowOrder = task.workflowOrder;
    if (!task.benefitId || workflowOrder == null) return false;
    return items.some((candidate) => candidate.benefitId === task.benefitId
      && candidate.workflowInstance === task.workflowInstance
      && candidate.workflowOrder != null
      && candidate.workflowOrder > workflowOrder
      && isSponsorApprovalTask(candidate));
  }

  function canRevokeOrganizerTask(task: Task) {
    const workflowOrder = task.workflowOrder;
    if (!task.benefitId || workflowOrder == null) return true;
    return !items.some((candidate) => candidate.benefitId === task.benefitId
      && candidate.workflowInstance === task.workflowInstance
      && candidate.workflowOrder != null
      && candidate.workflowOrder > workflowOrder
      && (candidate.status === "Erledigt" || (isSponsorApprovalTask(candidate) && candidate.sponsorApprovalStatus === "approved")));
  }

  async function refreshWorkflow(task: Task) {
    const [taskResult, evidenceResult, feedbackResult] = await Promise.all([fetchStoredTasks(), fetchStoredEvidence(), createClient().from("task_workflow_feedback").select("id, task_id, decision, comment, created_at").order("created_at", { ascending: true })]);
    if (taskResult.error || evidenceResult.error || feedbackResult.error) throw taskResult.error ?? evidenceResult.error ?? feedbackResult.error;
    const storedTasks = taskResult.data ?? [];
    const taskById = new Map(storedTasks.map((item) => [item.id, item]));
    const feedbackByTask = new Map<string, OrganizerTaskFeedback[]>();
    for (const feedback of feedbackResult.data ?? []) feedbackByTask.set(feedback.task_id, [...(feedbackByTask.get(feedback.task_id) ?? []), feedback as OrganizerTaskFeedback]);
    setItems((current) => applyWorkflowDependencies(current.map((item) => {
      const latest = taskById.get(item.id);
      return latest ? { ...item, status: latest.status === "Erledigt" ? "Erledigt" : "Offen", sponsorApprovalStatus: latest.sponsor_approval_status, publishReady: latest.publish_ready, organizerFeedback: feedbackByTask.get(item.id) ?? item.organizerFeedback } : item;
    })));
    setEvidenceByTask(Object.fromEntries((evidenceResult.data ?? []).map((entry) => [entry.taskId, entry])));
    if (task.benefitId) await syncBenefitStatus(task.benefitId);
    window.dispatchEvent(new Event("sponso:event-timeline-updated"));
  }

  async function approveOrganizerTask(task: Task, sharePreviousFile: boolean): Promise<boolean> {
    if (task.completionType !== "organizer_approval" || task.status === "Erledigt" || task.blockedBy) return false;
    setOrganizerApprovalBusyId(task.id);
    try {
      const { error } = await createClient().rpc("respond_to_organizer_task", { target_task_id: task.id, target_decision: "approved", target_comment: null, share_previous_file: sharePreviousFile });
      if (error) throw error;
      await refreshWorkflow(task);
      setMessage(sharePreviousFile ? `„${task.title}“ wurde bestätigt. Der vorherige Nachweis ist jetzt für den Sponsor sichtbar.` : `„${task.title}“ wurde durch den Veranstalter bestätigt.`);
      return true;
    } catch (reason) {
      const details = reason instanceof Error ? reason.message : "";
      setMessage(details.includes("ORGANIZER_TASK_SPONSOR_FILE_REQUIRED")
        ? "Für die folgende Sponsorenfreigabe muss der Nachweis bereitgestellt werden."
        : details.includes("ORGANIZER_TASK_FILE_NOT_FOUND")
          ? "Lade zuerst einen Nachweis in der vorherigen Aufgabe hoch."
          : "Die Freigabe durch den Veranstalter konnte nicht gespeichert werden.");
      return false;
    } finally {
      setOrganizerApprovalBusyId("");
    }
  }

  async function revokeOrganizerTask(task: Task, comment: string): Promise<boolean> {
    if (task.completionType !== "organizer_approval" || task.status !== "Erledigt" || !comment.trim()) return false;
    setOrganizerApprovalBusyId(task.id);
    try {
      const supabase = createClient();
      const { data: deletedPaths, error } = await supabase.rpc("revoke_organizer_task_approval", { target_task_id: task.id, target_comment: comment.trim() });
      if (error) throw error;
      const storagePaths = Array.isArray(deletedPaths) ? deletedPaths.filter((path): path is string => typeof path === "string") : [];
      const { error: storageError } = storagePaths.length ? await supabase.storage.from("sponsorproof-files").remove(storagePaths) : { error: null };
      await refreshWorkflow(task);
      setMessage(storageError
        ? "Die Freigabe wurde zurückgenommen und die Sponsorenfreigabe ausgeblendet. Der Nachweis wurde aus dem Archiv entfernt, konnte aber nicht vollständig aus dem Speicher gelöscht werden."
        : "Die Freigabe wurde zurückgenommen. Der vorherige Nachweis wurde gelöscht und die Sponsorenfreigabe ausgeblendet.");
      return true;
    } catch (reason) {
      const details = reason instanceof Error ? reason.message : "";
      setMessage(details.includes("ORGANIZER_APPROVAL_FOLLOWING_TASK_COMPLETED")
        ? "Die Freigabe kann nicht zurückgenommen werden, weil eine nachfolgende Aufgabe bereits abgeschlossen ist."
        : details.includes("ORGANIZER_APPROVAL_SPONSOR_ALREADY_APPROVED")
          ? "Die Freigabe kann nicht zurückgenommen werden, weil der Sponsor bereits freigegeben hat."
        : "Die Freigabe konnte nicht zurückgenommen werden. Prüfe, ob die Datenbankmigration angewendet wurde.");
      return false;
    } finally {
      setOrganizerApprovalBusyId("");
    }
  }

  async function rejectOrganizerTask(task: Task, comment: string): Promise<boolean> {
    if (task.completionType !== "organizer_approval" || task.status === "Erledigt" || task.blockedBy || !comment.trim()) return false;
    setOrganizerApprovalBusyId(task.id);
    try {
      const supabase = createClient();
      const { data: deletedPaths, error } = await supabase.rpc("respond_to_organizer_task", { target_task_id: task.id, target_decision: "changes_requested", target_comment: comment.trim(), share_previous_file: false });
      if (error) throw error;
      const storagePaths = Array.isArray(deletedPaths) ? deletedPaths.filter((path): path is string => typeof path === "string") : [];
      const { error: storageError } = storagePaths.length ? await supabase.storage.from("sponsorproof-files").remove(storagePaths) : { error: null };
      await refreshWorkflow(task);
      setMessage(storageError
        ? `„${task.title}“ wurde zurückgegeben und die vorherige Aufgabe zurückgesetzt. Mindestens eine Nachweisdatei konnte nicht aus dem Archiv gelöscht werden.`
        : `„${task.title}“ wurde zurückgegeben. Der vorherige Nachweis wurde gelöscht und die Aufgabe zurückgesetzt.`);
      return true;
    } catch {
      setMessage("Die Aufgabe konnte nicht abgelehnt werden. Prüfe, ob die Datenbankmigration angewendet wurde.");
      return false;
    } finally {
      setOrganizerApprovalBusyId("");
    }
  }

  async function updateTaskDueDate(task: Task, dueAt: string) {
    try {
      if (task.source === "Leistung" && !task.storedTask) {
        if (!(await ensureFeature(task.eventId, task.eventTitle, "benefits"))) return;
        const benefitId = task.id.slice("benefit-".length);
        const { error } = await updateStoredBenefit(benefitId, { dueAt: dueAt || null });
        if (error) throw error;
      } else {
        const { error } = await updateStoredTask(task.id, { dueAt: dueAt || null });
        if (error) throw error;
      }
      setItems((current) => current.map((item) => item.id === task.id ? { ...item, dueAt: dueAt || undefined, due: dueAt ? formatDue(dueAt) : "—" } : item));
      setMessage(dueAt ? "Fälligkeit gespeichert." : "Fälligkeit entfernt.");
    } catch {
      setMessage("Die Fälligkeit konnte nicht gespeichert werden.");
    }
  }

  async function updateTaskEvent(task: Task, eventId: string) {
    if (task.source !== "Manuell" || task.eventId === eventId) return;
    if (evidenceByTask[task.id]) {
      setMessage("Lösche zuerst den vorhandenen Nachweis, bevor du die Aufgabe einem anderen Event zuordnest.");
      return;
    }
    try {
      const { error } = await updateStoredTask(task.id, { eventId: eventId || null });
      if (error) throw error;
      const eventTitle = events.find((item) => item.id === eventId)?.title ?? "Keinem Event zugeordnet";
      setItems((current) => current.map((item) => item.id === task.id ? { ...item, eventId, eventTitle, sponsorId: "" } : item));
      window.dispatchEvent(new Event("sponso:event-timeline-updated"));
      setMessage(eventId ? `Aufgabe „${task.title}“ wurde dem Event „${eventTitle}“ zugeordnet.` : `Aufgabe „${task.title}“ ist keinem Event mehr zugeordnet.`);
    } catch {
      setMessage("Das Event der Aufgabe konnte nicht geändert werden.");
    }
  }

  async function deleteManualTask(task: Task) {
    if (task.source !== "Manuell" || !window.confirm(`Möchtest du die manuelle Aufgabe „${task.title}“ wirklich löschen?`)) return;
    try {
      const proof = evidenceByTask[task.id];
      if (proof) { const { error } = await deleteStoredEvidenceRecord(proof); if (error) throw error; }
      const { error } = await deleteStoredTask(task.id);
      if (error) throw error;
      setItems((current) => current.filter((item) => item.id !== task.id));
      window.dispatchEvent(new Event("sponso:event-timeline-updated"));
      setEvidenceByTask((current) => {
        const updated = { ...current };
        delete updated[task.id];
        return updated;
      });
      setMessage(`Aufgabe „${task.title}“ gelöscht.`);
    } catch {
      setMessage("Die Aufgabe konnte nicht gelöscht werden.");
    }
  }

  async function createTask(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    const eventId = draft.eventId || (eventFilter !== "all" ? eventFilter : "");
    const selectedSponsorId = draft.completionType === "sponsor_approval" ? draft.sponsorId || (selectedSponsor !== "all" ? selectedSponsor : "") : selectedSponsor !== "all" ? selectedSponsor : "";
    const selectedSponsorRecord = items.find((task) => task.sponsorId === selectedSponsorId && (!eventId || task.eventId === eventId));
    try {
      const sponsorId = selectedSponsorId;
      const sponsor = selectedSponsorRecord?.sponsor || sponsorOptions.find((item) => item.id === sponsorId)?.name || sponsorName || draft.sponsor.trim() || "—";
      if (draft.completionType === "sponsor_approval" && (!eventId || !sponsorId)) {
        setMessage("Wähle für eine Sponsorfreigabe ein Event und einen zugeordneten Sponsor aus.");
        return;
      }
      const { data, error } = await createStoredTask({ title: draft.title.trim(), eventId: eventId && eventId !== "all" ? eventId : undefined, sponsorId, sponsorName: sponsor, dueAt: draft.due.trim() || undefined, completionType: draft.completionType, assignedTo: draft.completionType === "sponsor_approval" ? undefined : draft.assigneeId || undefined });
      if (error || !data) throw error ?? new Error("Aufgabe konnte nicht gespeichert werden.");
      const manualTask: Task = { id: data.id, title: data.title, sponsor, sponsorId, due: data.due_at ? formatDue(data.due_at) : "—", dueAt: data.due_at ?? undefined, status: "Offen", eventId: data.event_id ?? "", eventTitle: eventNames[data.event_id ?? ""] ?? "Keinem Event zugeordnet", source: "Manuell", storedTask: true, completionType: data.completion_type, assignee: data.assigned_to_sponsor ? "Sponsor" : organizerMembers.find((member) => member.user_id === data.assigned_to)?.email, assigneeId: data.assigned_to ?? undefined, sponsorApprovalStatus: data.sponsor_approval_status, requiresSponsorApproval: data.requires_sponsor_approval };
      setItems((current) => [...current, manualTask]);
      window.dispatchEvent(new Event("sponso:event-timeline-updated"));
      setDraft(emptyDraft);
      setShowCreate(false);
      setMessage("Aufgabe hinzugefügt.");
    } catch {
      setMessage("Die Aufgabe konnte nicht gespeichert werden.");
    }
  }

  const filteredItems = items.filter((task) => (selectedSponsor === "all" || task.sponsorId === selectedSponsor) && (selectedEvent === "all" || task.eventId === selectedEvent) && (selectedStatus === "all" || task.status === selectedStatus) && (!onlyMyTasks || Boolean(currentUserId && task.assigneeId === currentUserId)));
  const workflowItems = filteredItems.filter((task) => task.storedTask && task.benefitId && task.workflowOrder != null);
  const workflowGroups = [...workflowItems.reduce((groups, task) => {
    const key = task.benefitId!;
    const group = groups.get(key) ?? { key, benefitId: task.benefitId!, title: task.benefitTitle ?? "Leistung", quantity: task.benefitQuantity ?? 1, benefitType: task.benefitType, tasks: [] as Task[] };
    group.tasks.push(task);
    groups.set(key, group);
    return groups;
  }, new Map<string, { key: string; benefitId: string; title: string; quantity: number; benefitType?: Task["benefitType"]; tasks: Task[] }>()).values()].map((group) => ({ ...group, tasks: group.tasks.filter((task) => !hideCompleted || task.status !== "Erledigt") })).filter((group) => group.tasks.length > 0);
  const groupedTaskIds = new Set(workflowItems.map((task) => task.id));
  const standaloneItems = filteredItems.filter((task) => !groupedTaskIds.has(task.id) && (!hideCompleted || task.status !== "Erledigt"));
  const standaloneTaskIds = new Set(standaloneItems.map((task) => task.id));
  const visibleItems = filteredItems.filter((task) => !groupedTaskIds.has(task.id) && !standaloneTaskIds.has(task.id) && (!hideCompleted || task.status !== "Erledigt"));
  const visibleCompleted = filteredItems.filter((task) => task.status === "Erledigt").length;
  const sponsorOptions = [...new Map([...availableSponsors, ...items.filter((task) => task.sponsorId).map((task) => ({ id: task.sponsorId, name: sponsorNames[task.sponsorId] ?? (task.sponsor === task.sponsorId ? "Sponsor" : task.sponsor), eventIds: [task.eventId] }))].map((sponsor) => [sponsor.id, sponsor])).values()];
  const eventOptions = events.length ? events : [...new Map([...items.filter((task) => task.eventId && task.eventId !== "all").map((task) => [task.eventId, { id: task.eventId, title: eventNames[task.eventId] ?? task.eventTitle }] as const), ...(eventFilter !== "all" ? [[eventFilter, { id: eventFilter, title: eventNames[eventFilter] ?? "Dieses Event" }] as const] : [])]).values()];
  const selectedSponsorName = sponsorOptions.find((sponsor) => sponsor.id === selectedSponsor)?.name;
  const completionSummary = `${visibleCompleted} von ${filteredItems.length} abgeschlossen`;
  const noTasksYet = !embedded && ready && items.length === 0 && selectedStatus === "all" && selectedEvent === eventFilter;
  function renderStandaloneTaskCard(task: Task) {
    const feedbackNotices = <>{task.sponsorFeedback?.map((feedback) => <TaskFeedbackNotice feedback={feedback} decision="sponsor_return" collapsed={task.sponsorApprovalStatus === "approved"} key={`sponsor-${feedback.id}`}/>)}{task.organizerFeedback?.map((feedback) => <TaskFeedbackNotice feedback={feedback} decision={feedback.decision === "organizer_changes_requested" ? "organizer_return" : "organizer_revoked"} collapsed={feedback.decision === "organizer_changes_requested" && Boolean(evidenceByTask[task.id])} key={`organizer-${feedback.id}`}/>)}</>;
    const taskControl = task.blockedBy ? <span className="task-caption task-dependency-blocked">Wartet auf: {task.blockedBy}</span>
      : task.assignedToSponsor ? sponsorAssignedTaskControl(task)
      : task.completionType === "organizer_approval" ? <OrganizerApprovalControl task={task} canRevoke={canRevokeOrganizerTask(task)} sponsorApprovalFollows={hasFollowingSponsorApproval(task)} disabled={!ready} busy={organizerApprovalBusyId === task.id} previousEvidence={(() => { const previous = previousWorkflowTask(task); return previous ? evidenceByTask[previous.id] : undefined; })()} onApprove={approveOrganizerTask} onReject={rejectOrganizerTask} onRevoke={revokeOrganizerTask}/>
        : isSponsorApprovalTask(task) ? <SponsorApprovalStatus task={task}/>
          : <TaskProofControl task={task} evidence={evidenceByTask[task.id]} disabled={!ready} mobileMode={mobileMode} onProofAdded={addProof} onProofDeleted={deleteProof}/>;
    return <section className="benefit-task-group standalone-task-group" key={task.id} aria-label={`Aufgabe ${task.title}`}>
      <header className="benefit-task-group-heading"><div><span className={`task-source ${task.source === "Leistung" ? "derived" : "manual"}`}>{task.source === "Leistung" ? task.benefitType === "in_kind" ? "Sachleistung" : "Geldleistung" : "Aufgabe"}</span><h3>{task.title}</h3><small>{sponsorNames[task.sponsorId] ?? (task.sponsor === task.sponsorId ? "Sponsor" : task.sponsor)}{task.eventTitle ? ` · ${task.eventTitle}` : ""}</small></div><Status value={taskStatus(task)}/></header>
      <div className="benefit-task-instances"><div className="benefit-task-subtasks"><article className={`benefit-task-subtask ${task.status === "Erledigt" ? "task-completed-row" : ""}`}>
        <div className="benefit-task-subtask-info"><span>Bearbeiter: {task.assignee ?? "Nicht zugewiesen"}</span>{!embedded && task.source === "Manuell" && <label className="standalone-task-event"><span>Event</span><select className="task-event-select" aria-label={`Event für ${task.title}`} value={task.eventId} onChange={(event) => { void updateTaskEvent(task, event.target.value); }} disabled={!ready}><option value="">Keinem Event zugeordnet</option>{eventOptions.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}</select></label>}{task.blockedBy && <span className="task-dependency-blocked">Wartet auf Abschluss: {task.blockedBy}</span>}{!task.assignee && !task.blockedBy && <span className="standalone-task-kind"><Icon name="file" size={13}/> Einzelaufgabe</span>}{feedbackNotices}</div>
        <label className="benefit-task-due"><span>Fällig</span><input className="task-due-input" aria-label={`Fälligkeit für ${task.title}`} type="date" value={task.dueAt ?? ""} onChange={(event) => { void updateTaskDueDate(task, event.target.value); }} disabled={!ready}/></label>
        <Status value={taskStatus(task)}/><div className="standalone-task-actions">{taskControl}{!embedded && task.source === "Manuell" && <button className="btn task-delete-button" type="button" onClick={() => { void deleteManualTask(task); }} aria-label={`Aufgabe ${task.title} löschen`} title="Aufgabe löschen"><Icon name="trash" size={14}/></button>}</div>
      </article></div></div>
    </section>;
  }
  async function syncBenefitStatus(benefitId: string) {
    const { data, error } = await fetchStoredTasks();
    if (error) throw error;
    const benefitTasks = (data ?? []).filter((task) => task.benefit_id === benefitId && task.source === "Leistung");
    if (!benefitTasks.length) return;
    const status = benefitTasks.every((task) => task.status === "Erledigt") ? "Erfüllt" : "Offen";
    const result = await updateStoredBenefit(benefitId, { status });
    if (result.error) throw result.error;
  }

  return <>
    {!sponsorFilter && !embedded && <PageHeading eyebrow="VERANSTALTERBEREICH" title="Aufgaben" subtitle="Hier siehst du Aufgaben aus vereinbarten Leistungen und dokumentierst ihre Nachweise." />}
    {sponsorFilter && !embedded && <div className="sponsor-task-heading"><div><h2>Aufgaben & Nachweise</h2><p>Nachweise schließen Aufgaben ab.</p></div></div>}
    {noTasksYet ? <EmptyState title="Noch keine Aufgaben" description="Aufgaben erscheinen hier, sobald du Leistungen vereinbart oder im Event Aufgaben ergänzt hast." action={allowCreate ? <button className="btn btn-primary" type="button" onClick={() => { setMessage(""); setShowCreate(true); }}><Icon name="plus" size={14}/> Aufgabe anlegen</button> : undefined} /> : <section className={`panel table-panel ${embedded ? "event-task-panel" : ""}`}>
      <div className="table-head tasks-table-head"><div>{mobileMode ? <><h2>Aufgaben im Überblick</h2><p className="subtitle" style={{ fontSize: 11, marginTop: 4 }}>{completionSummary}</p></> : embedded ? <><h2>Aufgaben im Überblick</h2><p className="subtitle" style={{ fontSize: 11, marginTop: 4 }}>Verwalte Aufgaben und dokumentiere Nachweise zu vereinbarten Leistungen.</p><p className="subtitle" style={{ fontSize: 10, marginTop: 4 }}>{completionSummary}</p></> : <><h2>{selectedSponsorName ? `${selectedSponsorName} · Aufgaben` : "Alle Aufgaben"}</h2><p className="subtitle" style={{ fontSize: 11, marginTop: 4 }}>{completionSummary}</p></>}</div>{mobileMode ? <div className="mobile-task-filters"><label className="mobile-open-tasks-filter"><input type="checkbox" checked={hideCompleted} onChange={(event) => setHideCompleted(event.target.checked)}/>Nur offene</label>{!sponsorFilter && <label className="mobile-open-tasks-filter"><input type="checkbox" checked={onlyMyTasks} onChange={(event) => setOnlyMyTasks(event.target.checked)}/>Nur eigene Aufgaben</label>}</div> : <div className="task-filters"><label className="task-event-filter"><span>Sponsor</span><select value={selectedSponsor} onChange={(event) => setSelectedSponsor(event.target.value)}><option value="all">Alle Sponsoren</option>{sponsorOptions.map((sponsor) => <option key={sponsor.id} value={sponsor.id}>{sponsor.name}</option>)}</select></label>{!embedded && <label className="task-event-filter"><span>Event</span><select value={selectedEvent} onChange={(event) => setSelectedEvent(event.target.value)}><option value="all">Alle Events</option>{eventOptions.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}</select></label>}<label className="task-event-filter"><span>Status</span><select value={selectedStatus} onChange={(event) => setSelectedStatus(event.target.value as "all" | Task["status"])}><option value="all">Alle Status</option><option value="Offen">Offen</option><option value="Erledigt">Erledigt</option></select></label>{!sponsorFilter && <label className="task-own-filter"><input type="checkbox" checked={onlyMyTasks} onChange={(event) => setOnlyMyTasks(event.target.checked)}/>Nur eigene Aufgaben</label>}{allowCreate && <button className="btn btn-primary" type="button" onClick={() => { setMessage(""); setShowCreate(true); }}><Icon name="plus" size={15}/> Aufgabe anlegen</button>}</div>}</div>
      {(workflowGroups.length > 0 || standaloneItems.length > 0) && <div className="benefit-task-groups">{workflowGroups.map((group) => {
        const allTasks = items.filter((task) => task.benefitId === group.benefitId && task.workflowOrder != null);
        const instances = [...new Set(group.tasks.map((task) => task.workflowInstance ?? 1))].sort((a, b) => a - b);
        return <section className="benefit-task-group" key={group.key} aria-label={`Aufgaben zu ${group.title}`}>
          <header className="benefit-task-group-heading"><div><span className="task-source derived">{group.benefitType === "in_kind" ? "Sachleistung" : "Geldleistung"}</span><h3>{group.title}</h3>{group.quantity > 1 && <span className="benefit-task-quantity">{group.quantity} Einzelleistungen</span>}<small>{group.tasks[0]?.sponsor}{group.tasks[0]?.eventTitle ? ` · ${group.tasks[0].eventTitle}` : ""}</small></div><Status value={workflowStatus(allTasks)}/></header>
          <div className="benefit-task-instances">{instances.map((instance) => {
            const instanceTasks = group.tasks.filter((task) => (task.workflowInstance ?? 1) === instance).sort((a, b) => (a.workflowOrder ?? 0) - (b.workflowOrder ?? 0));
            const allInstanceTasks = allTasks.filter((task) => (task.workflowInstance ?? 1) === instance);
            return <details className="benefit-task-instance" key={instance} open={group.quantity === 1}>
              <summary><span>{group.quantity > 1 ? `Leistung ${instance} von ${group.quantity}` : "Details"}</span><Status value={workflowStatus(allInstanceTasks)}/></summary>
              <div className="benefit-task-subtasks">{instanceTasks.map((task) => {
                const feedbackNotices = <>{task.sponsorFeedback?.map((feedback) => <TaskFeedbackNotice feedback={feedback} decision="sponsor_return" collapsed={task.sponsorApprovalStatus === "approved"} key={`sponsor-${feedback.id}`}/>)}{task.organizerFeedback?.map((feedback) => <TaskFeedbackNotice feedback={feedback} decision={feedback.decision === "organizer_changes_requested" ? "organizer_return" : "organizer_revoked"} collapsed={feedback.decision === "organizer_changes_requested" && Boolean(evidenceByTask[task.id])} key={`organizer-${feedback.id}`}/>)}</>;
                const hasFeedback = Boolean(task.sponsorFeedback?.length || task.organizerFeedback?.length);
                return <article className={`benefit-task-subtask ${task.status === "Erledigt" ? "task-completed-row" : ""}`} key={task.id}><div className="benefit-task-subtask-info"><b>{task.title}</b><span>Bearbeiter: {task.assignee ?? "Nicht zugewiesen"}</span>{task.blockedBy && <span className="task-dependency-blocked">Wartet auf Abschluss: {task.blockedBy}</span>}</div><label className="benefit-task-due"><span>Fällig</span><input className="task-due-input" aria-label={`Fälligkeit für ${task.title}`} type="date" value={task.dueAt ?? ""} onChange={(event) => { void updateTaskDueDate(task, event.target.value); }} disabled={!ready}/></label><Status value={taskStatus(task)}/>{task.blockedBy ? <span className="task-caption task-dependency-blocked">Wartet auf: {task.blockedBy}</span> : task.assignedToSponsor ? sponsorAssignedTaskControl(task) : task.completionType === "organizer_approval" ? <OrganizerApprovalControl task={task} canRevoke={canRevokeOrganizerTask(task)} sponsorApprovalFollows={hasFollowingSponsorApproval(task)} disabled={!ready} busy={organizerApprovalBusyId === task.id} previousEvidence={(() => { const previous = previousWorkflowTask(task); return previous ? evidenceByTask[previous.id] : undefined; })()} onApprove={approveOrganizerTask} onReject={rejectOrganizerTask} onRevoke={revokeOrganizerTask}/> : isSponsorApprovalTask(task) ? <SponsorApprovalStatus task={task}/> : <TaskProofControl task={task} evidence={evidenceByTask[task.id]} disabled={!ready} mobileMode={mobileMode} onProofAdded={addProof} onProofDeleted={deleteProof}/ >}{hasFeedback && <div className="benefit-task-subtask-feedback">{feedbackNotices}</div>}</article>;
              })}</div>
            </details>;
          })}</div>
        </section>;
      })}{standaloneItems.map(renderStandaloneTaskCard)}</div>}
      {mobileMode && visibleItems.length > 0 && <div className="mobile-proof-list">{visibleItems.map((task) => <article className="mobile-task" key={task.id}>
        <div className="mobile-task-top"><div className="mobile-task-heading"><h3>{task.title}</h3>{task.source === "Leistung" && <span className="task-source derived">{task.benefitType === "in_kind" ? "Sachleistung" : "Geldleistung"}</span>}{task.publishReady && <span className="task-publish-ready">Freigegeben · Veröffentlichung möglich</span>}{task.sponsorFeedback?.map((feedback) => <TaskFeedbackNotice feedback={feedback} decision="sponsor_return" collapsed={task.sponsorApprovalStatus === "approved"} key={feedback.id}/>)}{task.organizerFeedback?.map((feedback) => <TaskFeedbackNotice feedback={feedback} decision={feedback.decision === "organizer_changes_requested" ? "organizer_return" : "organizer_revoked"} collapsed={feedback.decision === "organizer_changes_requested" && Boolean(evidenceByTask[task.id])} key={feedback.id}/>)}<p>{sponsorNames[task.sponsorId] ?? task.sponsor}{task.dueAt || task.due !== "—" ? ` · Fällig ${formatDue(task.dueAt ?? task.due)}` : ""} · Bearbeiter: {task.assignee ?? "Nicht zugewiesen"}</p></div><Status value={taskStatus(task)} /></div>
        {task.blockedBy && <span className="task-caption task-dependency-blocked">Wartet auf Abschluss: {task.blockedBy}</span>}{task.assignedToSponsor ? sponsorAssignedTaskControl(task) : task.completionType === "organizer_approval" ? !task.blockedBy && <OrganizerApprovalControl task={task} canRevoke={canRevokeOrganizerTask(task)} sponsorApprovalFollows={hasFollowingSponsorApproval(task)} disabled={!ready} busy={organizerApprovalBusyId === task.id} previousEvidence={(() => { const previous = previousWorkflowTask(task); return previous ? evidenceByTask[previous.id] : undefined; })()} onApprove={approveOrganizerTask} onReject={rejectOrganizerTask} onRevoke={revokeOrganizerTask}/> : isSponsorApprovalTask(task) ? <SponsorApprovalStatus task={task}/> : <TaskProofControl task={task} evidence={evidenceByTask[task.id]} disabled={!ready || Boolean(task.blockedBy)} mobileMode={mobileMode} onProofAdded={addProof} onProofDeleted={deleteProof}/> }
      </article>)}</div>}
      {!mobileMode && visibleItems.length > 0 && <table className="table tasks-table"><thead><tr><th>AUFGABE</th><th>SPONSOR</th><th>EVENT</th><th>FÄLLIG</th><th>QUELLE</th><th>STATUS</th><th>NACHWEIS</th><th>AKTION</th></tr></thead><tbody>{visibleItems.map((task) => <tr key={task.id} className={task.status === "Erledigt" ? "task-completed-row" : undefined}>
        <td><b style={{ color: "#3d4c5b" }}>{task.title}</b>{task.source === "Leistung" && <div className="task-caption">{task.benefitType === "in_kind" ? "Sachleistung" : "Geldleistung"}</div>}{task.publishReady && <div className="task-publish-ready">Freigegeben · Veröffentlichung möglich</div>}{task.sponsorFeedback?.map((feedback) => <TaskFeedbackNotice feedback={feedback} decision="sponsor_return" collapsed={task.sponsorApprovalStatus === "approved"} key={feedback.id}/>)}{task.organizerFeedback?.map((feedback) => <TaskFeedbackNotice feedback={feedback} decision={feedback.decision === "organizer_changes_requested" ? "organizer_return" : "organizer_revoked"} collapsed={feedback.decision === "organizer_changes_requested" && Boolean(evidenceByTask[task.id])} key={feedback.id}/>)}{task.blockedBy && <div className="task-caption task-dependency-blocked">Wartet auf Abschluss: {task.blockedBy}</div>}<div className="task-caption">Bearbeiter: {task.assignee ?? "Nicht zugewiesen"}</div></td><td>{sponsorFilter && task.sponsorId === sponsorFilter ? sponsorName ?? sponsorNames[task.sponsorId] ?? "Sponsor" : sponsorNames[task.sponsorId] ?? (task.sponsor === task.sponsorId ? "Sponsor" : task.sponsor)}</td><td className="task-event-cell">{task.source === "Manuell" ? <select className="task-event-name task-event-select" aria-label={`Event für ${task.title}`} value={task.eventId} onChange={(event) => { void updateTaskEvent(task, event.target.value); }} disabled={!ready}><option value="">Keinem Event zugeordnet</option>{events.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}</select> : <span className="task-event-name" title={task.eventTitle}>{task.eventTitle}</span>}</td><td><input className="task-due-input" aria-label={`Fälligkeit für ${task.title}`} type="date" value={task.dueAt ?? (/^\d{4}-\d{2}-\d{2}$/.test(task.due) ? task.due : "")} onChange={(event) => updateTaskDueDate(task, event.target.value)} disabled={!ready} /></td><td><span className={`task-source ${task.source === "Leistung" ? "derived" : "manual"}`}>{task.source === "Leistung" ? "Aus Vertrag" : "Manuell"}</span></td><td><Status value={taskStatus(task)} /></td><td>{task.blockedBy && <span className="task-caption task-dependency-blocked">Wartet auf: {task.blockedBy}</span>}{task.assignedToSponsor ? sponsorAssignedTaskControl(task) : task.completionType === "organizer_approval" ? !task.blockedBy && <OrganizerApprovalControl task={task} canRevoke={canRevokeOrganizerTask(task)} sponsorApprovalFollows={hasFollowingSponsorApproval(task)} disabled={!ready} busy={organizerApprovalBusyId === task.id} previousEvidence={(() => { const previous = previousWorkflowTask(task); return previous ? evidenceByTask[previous.id] : undefined; })()} onApprove={approveOrganizerTask} onReject={rejectOrganizerTask} onRevoke={revokeOrganizerTask}/> : isSponsorApprovalTask(task) ? <SponsorApprovalStatus task={task}/> : !task.blockedBy && <TaskProofControl task={task} evidence={evidenceByTask[task.id]} disabled={!ready} onProofAdded={addProof} onProofDeleted={deleteProof}/> }</td><td>{task.source === "Manuell" && <button className="btn task-delete-button" type="button" onClick={() => deleteManualTask(task)} aria-label={`Aufgabe ${task.title} löschen`} title="Aufgabe löschen"><Icon name="trash" size={14}/></button>}</td>
      </tr>)}</tbody></table>}
      {ready && visibleItems.length === 0 && workflowGroups.length === 0 && standaloneItems.length === 0 && (items.length === 0 ? <EmptyState className="empty-state-compact" title="Noch keine Aufgaben" description="Aufgaben erscheinen hier, sobald du Leistungen vereinbart oder Aufgaben ergänzt hast." /> : mobileMode && hideCompleted && filteredItems.length > 0 ? <EmptyState className="empty-state-compact" title="Keine offenen Aufgaben" description="Alle Aufgaben für dieses Event haben bereits einen Nachweis." action={<button className="btn" type="button" onClick={() => setHideCompleted(false)}>Erledigte Aufgaben anzeigen</button>} /> : <EmptyState className="empty-state-compact" title="Keine passenden Aufgaben" description="Passe die Filter an, um andere Aufgaben zu sehen." action={<button className="btn" type="button" onClick={() => { setSelectedSponsor("all"); setSelectedEvent(eventFilter); setSelectedStatus("all"); setHideCompleted(false); setOnlyMyTasks(false); }}>Filter zurücksetzen</button>} />)}
      {message && <p className="task-feedback" role="status">{message}</p>}
    </section>}
    {allowCreate && showCreate && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowCreate(false); }}><section className="create-modal" role="dialog" aria-modal="true" aria-labelledby="create-task-title"><div className="create-modal-head"><div><h2 id="create-task-title">Aufgabe anlegen</h2><p>Wähle, ob eine Datei benötigt wird oder die Aufgabe durch Veranstalter bestätigt oder durch Sponsor freigegeben wird.</p></div><button className="icon-button" type="button" aria-label="Dialog schließen" onClick={() => setShowCreate(false)}><Icon name="close" size={16}/></button></div><form onSubmit={createTask}><div className="settings-grid"><label className="settings-field settings-field-full"><span>Aufgabe *</span><input autoFocus required maxLength={100} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Was muss erledigt werden?" /></label><label className="settings-field settings-field-full"><span>Abschlussart</span><select value={draft.completionType} onChange={(event) => setDraft({ ...draft, completionType: event.target.value as CompletionType, sponsorId: "" })}><option value="file_required">Datei erforderlich</option><option value="organizer_approval">Bestätigung durch Veranstalter</option><option value="sponsor_approval">Freigabe durch Sponsor</option></select></label><label className="settings-field settings-field-full"><span>Event</span><select value={draft.eventId || (eventFilter !== "all" ? eventFilter : "")} disabled={eventFilter !== "all"} onChange={(event) => setDraft({ ...draft, eventId: event.target.value, sponsorId: "" })}><option value="">Keinem Event zugeordnet</option>{eventOptions.map((option) => <option key={option.id} value={option.id}>{option.title}</option>)}</select></label>{draft.completionType === "sponsor_approval" ? <label className="settings-field settings-field-full"><span>Sponsor *</span><select required value={draft.sponsorId || (selectedSponsor !== "all" ? selectedSponsor : "")} onChange={(event) => setDraft({ ...draft, sponsorId: event.target.value })}><option value="">Sponsor auswählen</option>{sponsorOptions.filter((sponsor) => !draft.eventId || sponsor.eventIds.includes(draft.eventId)).map((sponsor) => <option key={sponsor.id} value={sponsor.id}>{sponsor.name}</option>)}</select></label> : <label className="settings-field"><span>Sponsor</span><input value={draft.sponsor} onChange={(event) => setDraft({ ...draft, sponsor: event.target.value })} placeholder="Optional" /></label>}{draft.completionType !== "sponsor_approval" && <label className="settings-field"><span>Bearbeiter / Login</span><select value={draft.assigneeId} onChange={(event) => setDraft({ ...draft, assigneeId: event.target.value })}><option value="">Nicht zugewiesen</option>{organizerMembers.map((member) => <option key={member.user_id} value={member.user_id}>{member.email} · {member.role === "owner" ? "Inhaber" : "Mitglied"}</option>)}</select></label>}<label className="settings-field"><span>Fällig</span><input type="date" lang="de" value={draft.due} onChange={(event) => setDraft({ ...draft, due: event.target.value })} /></label></div><div className="create-modal-actions"><button className="btn" type="button" onClick={() => setShowCreate(false)}>Abbrechen</button><button className="btn btn-primary" type="submit" disabled={!ready}>Aufgabe speichern</button></div></form></section></div>}
  </>;
}
