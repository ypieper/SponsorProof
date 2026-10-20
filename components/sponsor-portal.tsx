"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { Icon, SponsoLogo } from "@/components/ui";
import { LogoutButton } from "@/components/logout-button";
import { EventSponsorInvoice } from "@/components/event-sponsor-invoice";
import { SponsorDocumentArea } from "@/components/sponsor-document-area";
import { createClient } from "@/lib/supabase/client";
import { FirstLoginWalkthrough } from "@/components/first-login-walkthrough";
import { SponsorGroup } from "@/components/sponsor-group";

type PortalContract = {
  id: string;
  title: string;
  sponsor_name: string;
  value_cents: number;
  signature_status: "draft" | "pending_sponsor" | "pending_organizer" | "signed";
  sponsor_signed_at: string | null;
  organizer_signed_at: string | null;
  signed_at: string | null;
  signing_url: string | null;
};
type PortalFile = { id: string; file_name: string; content_type: string; created_at: string; url: string };
type PortalTask = { id: string; benefit_id: string | null; title: string; due_at: string | null; planned_publish_date: string | null; status: string; completion_type: string; requires_sponsor_approval: boolean; assigned_to_sponsor: boolean; sponsor_approval_status: string; sponsor_approved_at: string | null; ready: boolean; workflow_order: number | null; workflow_instance: number; files: PortalFile[] };
type PortalStandaloneTask = { id: string; title: string; due_at: string | null; status: string; completion_type: string; requires_sponsor_approval: boolean; sponsor_approval_status: string; sponsor_approved_at: string | null; ready: boolean; files: PortalFile[] };
type PortalBenefit = { id: string; title: string; benefit_type: "monetary" | "in_kind"; material_logistics: string | null; description: string; quantity: number; tasks_per_unit: boolean; due_at: string | null; status: "Offen" | "In Bearbeitung" | "Abgeschlossen"; units: Array<{ instance: number; needed_at: string | null; status: "Offen" | "In Bearbeitung" | "Abgeschlossen"; hasSponsorApproval: boolean; tasks: PortalTask[] }> };
type PortalApproval = PortalTask;
type PortalPartnership = { sponsor_id: string; sponsor_name: string; tasks: PortalStandaloneTask[]; contracts: PortalContract[]; benefits: PortalBenefit[] };
type PortalEvent = { id: string; title: string; start_date: string | null; end_date: string | null; location: string; organizer_logo_url: string | null; organizer_name: string; contact_first_name: string; contact_last_name: string; contact_email: string; contact_phone: string; signature_addon_enabled: boolean; sponsor_assignments: PortalPartnership[] };

const demoFile: PortalFile = { id: "demo-document", file_name: "Beispiel-Nachweis.pdf", content_type: "application/pdf", created_at: "2026-10-17T12:22:00.000Z", url: "/downloads/pacct-muster-vertriebspartnervereinbarung.pdf" };
const demoPortalEvent: PortalEvent = {
  id: "demo",
  title: "Aloha Open-Air 2027",
  start_date: "2027-06-10",
  end_date: "2027-06-10",
  location: "Festivalwiese 23",
  organizer_logo_url: null,
  organizer_name: "Aloha Events",
  contact_first_name: "Jonas",
  contact_last_name: "Kastenholz",
  contact_email: "jonas@pacct.de",
  contact_phone: "0175 34396572",
  signature_addon_enabled: true,
  sponsor_assignments: [{
    sponsor_id: "demo-sponsor",
    sponsor_name: "Elspass Autoland GmbH",
    contracts: [{ id: "demo-contract", title: "Sponsoringvertrag", sponsor_name: "Elspass Autoland GmbH", value_cents: 500000, signature_status: "signed", sponsor_signed_at: "2026-10-14T14:10:00.000Z", organizer_signed_at: "2026-10-14T14:12:00.000Z", signed_at: "2026-10-14T14:12:00.000Z", signing_url: "/downloads/pacct-muster-vertriebspartnervereinbarung.pdf" }],
    tasks: [
      { id: "demo-manual-upload", title: "Logo für die Event-Website bereitstellen", due_at: "2027-05-20", status: "Offen", completion_type: "sponsor_upload", requires_sponsor_approval: false, sponsor_approval_status: "pending", sponsor_approved_at: null, ready: true, files: [] },
      { id: "demo-manual-approval", title: "Social-Media-Beitrag freigeben", due_at: "2027-05-28", status: "In Bearbeitung", completion_type: "sponsor_approval", requires_sponsor_approval: true, sponsor_approval_status: "pending", sponsor_approved_at: null, ready: true, files: [demoFile] },
      { id: "demo-manual-changes-requested", title: "Social-Media-Beitrag erneut freigeben", due_at: "2027-05-30", status: "In Bearbeitung", completion_type: "sponsor_approval", requires_sponsor_approval: true, sponsor_approval_status: "changes_requested", sponsor_approved_at: null, ready: false, files: [demoFile] },
      { id: "demo-manual-completed", title: "Sponsorlogo im Programmheft freigeben", due_at: "2027-05-10", status: "Erledigt", completion_type: "sponsor_approval", requires_sponsor_approval: true, sponsor_approval_status: "approved", sponsor_approved_at: "2026-10-15T14:08:00.000Z", ready: true, files: [demoFile] },
    ],
    benefits: [{
      id: "demo-benefit",
      title: "Logo auf der Event-Website",
      benefit_type: "in_kind",
      material_logistics: null,
      description: "Platzierung des Sponsors auf der Event-Website",
      quantity: 1,
      tasks_per_unit: true,
      due_at: "2027-06-01",
      status: "In Bearbeitung",
      units: [{ instance: 1, needed_at: "2027-06-01", status: "In Bearbeitung", hasSponsorApproval: true, tasks: [
        { id: "demo-benefit-approval", benefit_id: "demo-benefit", title: "Website-Entwurf freigeben", due_at: "2027-05-25", planned_publish_date: null, status: "In Bearbeitung", completion_type: "sponsor_approval", requires_sponsor_approval: true, assigned_to_sponsor: false, sponsor_approval_status: "pending", sponsor_approved_at: null, ready: true, workflow_order: 1, workflow_instance: 1, files: [demoFile] },
      ] }],
    }],
  }],
};

function DemoSponsorInvoice({ sponsorName }: { sponsorName: string }) {
  return <section className="panel sponsor-invoice-area">
    <div className="table-head"><div><h2>Rechnung</h2><p className="subtitle" style={{ fontSize: 11, marginTop: 4 }}>Veröffentlichte Rechnungen für {sponsorName} in diesem Event.</p></div></div>
    <article className="sponsor-invoice-total-card"><span>Gesamtrechnungswert (netto)</span><strong>5.000,00&nbsp;€</strong></article>
    <div className="sponsor-invoice-list"><article className="sponsor-invoice-card">
      <header className="sponsor-invoice-card-head"><div><span className="sponsor-invoice-card-label">Beispieldatensatz</span><b>Rechnung RE-2027-014</b></div><div className="sponsor-invoice-card-statuses"><span className="sponsor-invoice-payment-status unpaid">Offen</span></div></header>
      <div className="sponsor-invoice-grid">
        <label className="settings-field"><span>Rechnungsnummer</span><input type="text" value="RE-2027-014" disabled readOnly /></label>
        <label className="settings-field"><span>Rechnungsdatum</span><input type="text" value="10.06.2027" disabled readOnly /></label>
        <label className="settings-field"><span>Fällig am</span><input type="text" value="24.06.2027" disabled readOnly /></label>
        <label className="settings-field"><span>Versanddatum</span><input type="text" value="10.06.2027" disabled readOnly /></label>
        <label className="settings-field"><span>Nettobetrag</span><input type="text" value="5.000,00 €" disabled readOnly /></label>
        <label className="settings-field"><span>Bruttobetrag</span><input type="text" value="5.950,00 €" disabled readOnly /></label>
      </div>
      <div className="sponsor-invoice-file-row"><span>Beispielhafte Rechnungsangaben</span><button className="btn" type="button" disabled title="In der Demo nicht verfügbar"><Icon name="file" size={14}/> Rechnung herunterladen</button></div>
    </article><p className="sponsor-invoice-vat-note">Diese Angaben sind Beispieldaten. In der Demo wird keine Rechnung erstellt oder heruntergeladen.</p></div>
  </section>;
}

function SponsorBenefits({ benefits }: { benefits: PortalBenefit[] }) {
  return <section className="panel sponsor-portal-detail-panel sponsor-portal-benefits-list">
    <div className="sponsor-portal-tab-heading"><h2>Leistungen</h2><p>Hier findest du deine vereinbarten Leistungen für dieses Event.</p></div>
    <div className="sponsor-portal-agreed-benefits">{benefits.map((benefit) => {
      const quantity = Math.max(1, benefit.quantity || 1);
      const workflowCount = benefit.tasks_per_unit ? quantity : 1;
      const units = benefit.units.slice(0, workflowCount);
      const complete = units.length === workflowCount && units.every((unit) => unit.status === "Abgeschlossen");
      const status = complete ? "Abgeschlossen" : units.some((unit) => unit.status === "In Bearbeitung") ? "In Bearbeitung" : "Offen";
      return <article className={`sponsor-portal-agreed-benefit${complete ? " is-complete" : ""}`} key={benefit.id}>
        <header><span className="sponsor-benefit-type">{benefit.benefit_type === "in_kind" ? "Sachleistung" : "Geldleistung"}</span><div><b>{benefit.title}</b><span>{[benefit.description, `Anzahl: ${quantity}`].filter(Boolean).join(" · ")}</span></div><span className={`sponsor-benefit-status sponsor-benefit-status-${complete ? "done" : status === "In Bearbeitung" ? "progress" : "open"}`}>{status}</span></header>
      </article>;
    })}</div>
  </section>;
}

function statusLabel(status: PortalContract["signature_status"]) {
  if (status === "signed") return "Vollständig gezeichnet";
  if (status === "pending_organizer") return "Wartet auf Veranstalter";
  if (status === "pending_sponsor") return "Deine Zeichnung steht aus";
  return "Noch nicht freigegeben";
}
function formatFeedbackDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" }).format(date);
}
function formatPortalDate(value: string | null) {
  if (!value) return "Noch nicht geplant";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value;
}

function SponsorEvidenceLink({ file, disabled = false }: { file: PortalFile; disabled?: boolean }) {
  const canPreview = file.content_type === "application/pdf" || file.content_type.startsWith("image/");
  const versionDate = formatFeedbackDate(file.created_at);
  if (disabled) return <button className="btn" type="button" disabled title="Dateien können in der Demo nicht geöffnet oder heruntergeladen werden." aria-label={`Datei in der Demo nicht verfügbar: ${file.file_name}`} key={file.id}><Icon name="file" size={14}/>{file.file_name}</button>;
  return <a className="btn" href={file.url} target="_blank" rel="noopener noreferrer" key={file.id}><Icon name="file" size={14}/>{canPreview ? "In neuem Tab ansehen" : "Datei herunterladen"}: {file.file_name}{versionDate && ` · ${versionDate}`}</a>;
}

function SponsorEvidenceHistory({ files, disabled = false }: { files: PortalFile[]; disabled?: boolean }) {
  const versions = files.slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
  const [current, ...previous] = versions;
  if (!current) return null;
  return <div className="sponsor-portal-review-files">
    <SponsorEvidenceLink file={current} disabled={disabled}/>
    {previous.length > 0 && <details className="sponsor-portal-previous-versions"><summary>Vorherige Versionen ({previous.length})<Icon name="chevron" size={13}/></summary><div>{previous.map((file) => <SponsorEvidenceLink file={file} disabled={disabled} key={file.id}/>)}</div></details>}
  </div>;
}

function SponsorCompletedTaskRow({ task, benefitName, demoMode = false }: { task: { id: string; title: string; sponsor_approval_status: string; sponsor_approved_at: string | null; files: PortalFile[] }; benefitName?: string; demoMode?: boolean }) {
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

function SponsorTaskUpload({ busy, disabled, onUpload }: { busy: boolean; disabled: boolean; onUpload: (file: File) => void }) {
  return <label className="btn btn-primary sponsor-task-upload-button">
    <Icon name="file" size={14}/>{busy ? "Wird hochgeladen …" : "Datei hochladen"}
    <input type="file" accept="image/jpeg,image/png,image/webp,.pdf,.doc,.docx" hidden disabled={disabled || busy} onChange={(event) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (file) onUpload(file);
    }}/>
  </label>;
}

function SponsorUploadTaskCard({ task, benefitName, busy, disabled, onUpload }: { task: Pick<PortalTask, "title" | "due_at" | "status" | "ready" | "files">; benefitName?: string; busy: boolean; disabled: boolean; onUpload: (file: File) => void }) {
  const done = task.status === "Erledigt";
  const inProgress = task.status === "In Bearbeitung";
  return <article className="sponsor-portal-benefit-task sponsor-portal-approval-card sponsor-portal-upload-task-card">
    <div className="sponsor-portal-approval-placeholder sponsor-portal-upload-placeholder" aria-hidden="true"><Icon name="file" size={25}/><span>Upload</span></div>
    <div className="sponsor-portal-approval-content">
      <header><div className="sponsor-portal-review-copy"><span className="sponsor-portal-approval-eyebrow">Upload durch den Sponsor</span><b>{task.title}</b><small>{task.due_at ? `Fällig am ${formatPortalDate(task.due_at)}` : "Bitte lade den vereinbarten Nachweis hoch."}</small></div><span className={`sponsor-benefit-status sponsor-benefit-status-${done ? "done" : inProgress ? "progress" : "open"}`}>{done ? "Abgeschlossen" : inProgress ? "In Bearbeitung" : "Upload offen"}</span></header>
      {done ? task.files.length ? <SponsorEvidenceHistory files={task.files} disabled={disabled}/> : <small className="sponsor-portal-unit-wait">Der Nachweis wurde hochgeladen.</small> : <div className="sponsor-portal-upload-footer">{benefitName && <small className="sponsor-portal-task-benefit-label">Leistung: {benefitName}</small>}{task.ready ? <div className="sponsor-portal-review-actions"><SponsorTaskUpload busy={busy} disabled={disabled} onUpload={onUpload}/></div> : <small className="sponsor-portal-unit-wait">Wird nach Abschluss der vorherigen Aufgabe freigeschaltet.</small>}</div>}
    </div>
  </article>;
}

export function SponsorPortal({ eventId, demoMode = false }: { eventId?: string; demoMode?: boolean }) {
  const [events, setEvents] = useState<PortalEvent[]>(() => demoMode ? [demoPortalEvent] : []);
  const [loading, setLoading] = useState(!demoMode);
  const [profileRequired, setProfileRequired] = useState(false);
  const [profileName, setProfileName] = useState({ firstName: "", lastName: "" });
  const [savingProfile, setSavingProfile] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [approvalComments, setApprovalComments] = useState<Record<string, string>>({});
  const [returningTaskId, setReturningTaskId] = useState("");
  const [activeTab, setActiveTab] = useState<"contract" | "invoice" | "benefits" | "tasks" | "documents">(demoMode ? "contract" : "tasks");
  const [activeSponsorId, setActiveSponsorId] = useState("");
  const activeEvent = events.find((event) => event.id === eventId);
  const activePartnership = activeEvent?.sponsor_assignments.find((assignment) => assignment.sponsor_id === activeSponsorId) ?? activeEvent?.sponsor_assignments[0];
  const activeManualTasks = activePartnership?.tasks ?? [];
  const isCompletedSponsorTask = (task: { status: string; sponsor_approval_status: string }) => task.status === "Erledigt" || task.sponsor_approval_status === "approved";
  const activeManualTasksToShow = activeManualTasks.filter((task) => !isCompletedSponsorTask(task));
  const partnershipBenefits = activePartnership?.benefits ?? [];
  const completedTasks = [
    ...activeManualTasks.filter(isCompletedSponsorTask).map((task) => ({ task, benefitName: undefined as string | undefined })),
    ...partnershipBenefits.flatMap((benefit) => benefit.units.flatMap((unit) => unit.tasks
      .filter(isCompletedSponsorTask)
      .map((task) => ({ task, benefitName: benefit.title })))),
  ];
  const activeTaskBenefits = activePartnership?.benefits.map((benefit) => ({
    ...benefit,
    units: benefit.units.map((unit) => ({ ...unit, tasks: unit.tasks.filter((task) => !isCompletedSponsorTask(task)) })).filter((unit) => unit.tasks.length > 0),
  })).filter((benefit) => benefit.units.length > 0) ?? [];
  const hasActiveTasks = activeManualTasksToShow.length > 0 || activeTaskBenefits.length > 0;
  const returningTaskHasBenefit = returningTaskId ? events.flatMap((event) => event.sponsor_assignments).flatMap((assignment) => assignment.benefits.flatMap((benefit) => benefit.units.flatMap((unit) => unit.tasks))).some((task) => task.id === returningTaskId) : false;
  const hasTaskContent = activeTaskBenefits.length > 0 || activeManualTasks.length > 0;
  const hasBenefitContent = (activePartnership?.benefits.length ?? 0) > 0;
  const hasSignedContract = activePartnership?.contracts.some((contract) => contract.signature_status === "signed") ?? false;
  const canShowBenefits = hasSignedContract && hasBenefitContent;
  const canShowTasks = activeManualTasks.length > 0 || hasSignedContract;
  const displayedTab = activeTab === "documents" ? "documents" : activeTab === "tasks" && canShowTasks ? "tasks" : activeTab === "benefits" && canShowBenefits ? "benefits" : !hasSignedContract
    ? "contract"
    : activeTab === "tasks" && !canShowTasks
      ? canShowBenefits ? "benefits" : "contract"
      : activeTab === "benefits" && !canShowBenefits
        ? hasTaskContent ? "tasks" : "contract"
        : activeTab;
  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/sponsor/portal", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Dein Sponsor-Bereich konnte nicht geladen werden.");
      setEvents(result.events ?? []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Dein Sponsor-Bereich konnte nicht geladen werden.");
    } finally { if (showLoading) setLoading(false); }
  }, []);
  useEffect(() => {
    if (demoMode) return;
    let active = true;
    void createClient().auth.getUser().then(async ({ data, error: userError }) => {
      if (!active) return;
      if (userError || !data.user) {
        setError("Bitte melde dich erneut an, um deinen Sponsor-Bereich zu öffnen.");
        setLoading(false);
        return;
      }
      const firstName = String(data.user.user_metadata?.first_name ?? "").trim();
      const lastName = String(data.user.user_metadata?.last_name ?? "").trim();
      setProfileName({ firstName, lastName });
      if (!firstName || !lastName) {
        setProfileRequired(true);
        setLoading(false);
        return;
      }
      await load();
    }).catch(() => {
      if (!active) return;
      setError("Dein Profil konnte nicht geladen werden. Bitte melde dich erneut an.");
      setLoading(false);
    });
    return () => { active = false; };
  }, [demoMode, load]);
  useEffect(() => {
    if (demoMode) return;
    const waitingForOrganizer = events.some((event) => event.sponsor_assignments.some((assignment) => assignment.contracts.some((contract) => contract.signature_status === "pending_organizer")));
    if (!waitingForOrganizer) return;
    let cancelled = false;
    const refreshContracts = async () => {
      try {
        const response = await fetch("/api/sponsor/portal", { cache: "no-store" });
        if (!response.ok || cancelled) return;
        const result = await response.json();
        if (!cancelled) setEvents(result.events ?? []);
      } catch {
        // The current contract state stays visible if a background refresh fails.
      }
    };
    const interval = window.setInterval(() => { void refreshContracts(); }, 15000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [demoMode, events]);
  useEffect(() => {
    if (demoMode) {
      setActiveTab("tasks");
      setActiveSponsorId("");
      return;
    }
    const validTabs = ["contract", "invoice", "benefits", "tasks", "documents"] as const;
    const syncTab = () => {
      const requested = new URLSearchParams(window.location.search).get("tab");
      setActiveTab(validTabs.includes(requested as typeof validTabs[number]) ? requested as typeof validTabs[number] : "tasks");
    };
    syncTab();
    window.addEventListener("popstate", syncTab);
    setActiveSponsorId("");
    return () => window.removeEventListener("popstate", syncTab);
  }, [demoMode, eventId]);

  function selectTab(tab: "contract" | "invoice" | "benefits" | "tasks" | "documents") {
    setActiveTab(tab);
    if (demoMode) return;
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    window.history.pushState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }

  async function sign(contract: PortalContract) {
    if (demoMode || busyId || !activeEvent?.signature_addon_enabled) return;
    setBusyId(contract.id); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/contracts/${contract.id}/simple-signature`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Die Zeichnung konnte nicht gespeichert werden.");
      setMessage("Deine Zeichnung wurde gespeichert. Der Veranstalter kann jetzt ebenfalls zeichnen.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Die Zeichnung konnte nicht gespeichert werden.");
    } finally { setBusyId(""); }
  }

  async function uploadSponsorTask(task: { id: string }, file: File) {
    if (demoMode || busyId) return;
    setBusyId(task.id); setError(""); setMessage("");
    try {
      const formData = new FormData();
      formData.set("file", file);
      const response = await fetch(`/api/sponsor/tasks/${task.id}/upload`, { method: "POST", body: formData });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Die Datei konnte nicht hochgeladen werden.");
      setMessage("Deine Datei wurde hochgeladen und die Aufgabe abgeschlossen.");
      await load(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Die Datei konnte nicht hochgeladen werden.");
    } finally { setBusyId(""); }
  }

  async function respondToTask(task: { id: string }, decision: "approve" | "return"): Promise<boolean> {
    if (demoMode || busyId) return false;
    const comment = approvalComments[task.id]?.trim() ?? "";
    if (decision === "return" && !comment) {
      setError("Bitte gib einen Kommentar zu den gewünschten Änderungen ein.");
      return false;
    }
    setBusyId(task.id); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/sponsor/tasks/${task.id}/approval`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, comment }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Deine Rückmeldung konnte nicht gespeichert werden.");
      setApprovalComments((current) => ({ ...current, [task.id]: "" }));
      setMessage(decision === "approve" ? "Deine Freigabe wurde gespeichert." : result.fileCleanupWarning
        ? "Deine Rückgabe wurde gesendet. Die Datei konnte nicht vollständig aus dem Speicher gelöscht werden."
        : "Deine Rückgabe wurde gesendet. Der Veranstalter kann die Datei jetzt anpassen und erneut zur Freigabe bereitstellen.");
      await load();
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Deine Rückmeldung konnte nicht gespeichert werden.");
      return false;
    } finally { setBusyId(""); }
  }

  async function submitReturn() {
    const task = events.flatMap((event) => event.sponsor_assignments).flatMap((assignment) => [
      ...assignment.tasks,
      ...assignment.benefits.flatMap((benefit) => benefit.units.flatMap((unit) => unit.tasks)),
    ]).find((item) => item.id === returningTaskId);
    if (!task) return;
    if (await respondToTask(task, "return")) setReturningTaskId("");
  }

  async function redeemInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (demoMode || redeeming) return;
    setRedeeming(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/sponsor/redeem-code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: inviteCode }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Der Einladungscode konnte nicht eingelöst werden.");
      setInviteCode("");
      setMessage("Die Sponsor-Zuordnung wurde mit deinem Konto verknüpft. Ein Event erscheint nur einmal; weitere Zuordnungen wählst du direkt im Event aus.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Der Einladungscode konnte nicht eingelöst werden.");
    } finally { setRedeeming(false); }
  }

  async function saveSponsorProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (demoMode) return;
    const firstName = profileName.firstName.trim();
    const lastName = profileName.lastName.trim();
    if (!firstName || !lastName || savingProfile) {
      setError("Bitte gib Vor- und Nachnamen ein.");
      return;
    }
    setSavingProfile(true);
    setError("");
    try {
      const { error: updateError } = await createClient().auth.updateUser({ data: { first_name: firstName, last_name: lastName } });
      if (updateError) throw updateError;
      setProfileRequired(false);
      setMessage("Deine Angaben wurden gespeichert.");
      await load();
    } catch {
      setError("Dein Name konnte nicht gespeichert werden. Bitte versuche es erneut.");
    } finally {
      setSavingProfile(false);
    }
  }

  return <main className={`sponsor-portal-page${demoMode ? " sponsor-portal-demo-embedded" : ""}`}>
    <header className="sponsor-portal-header">{demoMode ? <span className="brand" aria-label="pacct Sponsor-Bereich"><SponsoLogo /></span> : <Link href="/sponsor" className="brand" aria-label="pacct Sponsor-Bereich"><SponsoLogo /></Link>}<div><span>Sponsor-Bereich</span>{demoMode ? <button className="btn logout-button" type="button" disabled>Abmelden</button> : <LogoutButton />}</div></header>
    <section className="sponsor-portal-content">
      {profileRequired ? <section className="panel sponsor-profile-setup">
        <div className="eyebrow">ERSTEINRICHTUNG</div>
        <h1>Wie dürfen wir dich ansprechen?</h1>
        <p>Bitte ergänze deinen Vor- und Nachnamen. Danach kannst du deinen Sponsor-Bereich nutzen.</p>
        {error && <p className="field-message error" role="alert">{error}</p>}
        <form className="sponsor-profile-form" onSubmit={(event) => void saveSponsorProfile(event)}>
          <label className="settings-field"><span>Vorname *</span><input autoComplete="given-name" required maxLength={80} value={profileName.firstName} onChange={(event) => setProfileName((current) => ({ ...current, firstName: event.target.value }))} /></label>
          <label className="settings-field"><span>Nachname *</span><input autoComplete="family-name" required maxLength={80} value={profileName.lastName} onChange={(event) => setProfileName((current) => ({ ...current, lastName: event.target.value }))} /></label>
          <button className="btn btn-primary" type="submit" disabled={savingProfile}>{savingProfile ? "Wird gespeichert …" : "Speichern und weiter"}<Icon name="arrow" size={15}/></button>
        </form>
      </section> : eventId ? <>
        {!demoMode && <Link className="sponsor-portal-back-link" href="/sponsor">← Alle Events</Link>}
        {error && !returningTaskId && <p className="field-message error" role="alert">{error}</p>}{message && <p className="field-message success" role="status">{message}</p>}
        {loading ? <section className="panel"><p className="task-empty">Event wird geladen …</p></section> : activeEvent ? <>
          <div className="sponsor-portal-event-heading">{activeEvent.organizer_logo_url && <img className="sponsor-portal-event-heading-logo" src={activeEvent.organizer_logo_url} alt={`Logo ${activeEvent.title}`} />}<div><div className="eyebrow">DEINE PARTNERSCHAFT</div><h1>{activeEvent.title}</h1><p className="subtitle">{[activeEvent.start_date && new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(new Date(`${activeEvent.start_date}T00:00:00`)), activeEvent.location].filter(Boolean).join(" · ") || "Event"}</p></div></div>
          <section className="sponsor-portal-contact"><span className="settings-section-icon"><Icon name="users" size={16}/></span><div><b>Deine Ansprechperson</b>{[activeEvent.contact_first_name, activeEvent.contact_last_name].filter(Boolean).join(" ") && <strong>{[activeEvent.contact_first_name, activeEvent.contact_last_name].filter(Boolean).join(" ")}</strong>}{activeEvent.contact_email && <a href={`mailto:${activeEvent.contact_email}`}>{activeEvent.contact_email}</a>}{activeEvent.contact_phone && <a href={`tel:${activeEvent.contact_phone.replace(/[^\d+]/g, "")}`}>{activeEvent.contact_phone}</a>}{![activeEvent.contact_first_name, activeEvent.contact_last_name, activeEvent.contact_email, activeEvent.contact_phone].some(Boolean) && <span>Kontaktdaten werden noch ergänzt.</span>}</div></section>
          {activePartnership && (activeEvent.sponsor_assignments.length > 1 ? <label className="sponsor-portal-assignment-select"><span>Sponsor-Zuordnung</span><select value={activePartnership.sponsor_id} onChange={(event) => setActiveSponsorId(event.target.value)}>{activeEvent.sponsor_assignments.map((assignment) => <option key={assignment.sponsor_id} value={assignment.sponsor_id}>{assignment.sponsor_name}</option>)}</select></label> : <p className="sponsor-portal-assignment-name">Sponsor: {activePartnership.sponsor_name}</p>)}
          <div className="sponsor-portal-tabs" role="tablist" aria-label="Event-Bereiche"><button type="button" role="tab" aria-selected={displayedTab === "contract"} className={displayedTab === "contract" ? "active" : ""} onClick={() => selectTab("contract")}>Vertrag</button>{hasSignedContract && <button type="button" role="tab" aria-selected={displayedTab === "invoice"} className={displayedTab === "invoice" ? "active" : ""} onClick={() => selectTab("invoice")}>Rechnung</button>}{canShowBenefits && <button type="button" role="tab" aria-selected={displayedTab === "benefits"} className={displayedTab === "benefits" ? "active" : ""} onClick={() => selectTab("benefits")}>Leistungen</button>}{canShowTasks && <button type="button" role="tab" aria-selected={displayedTab === "tasks"} className={displayedTab === "tasks" ? "active" : ""} onClick={() => selectTab("tasks")}>Aufgaben</button>}<button type="button" role="tab" aria-selected={displayedTab === "documents"} className={displayedTab === "documents" ? "active" : ""} onClick={() => selectTab("documents")}>Dokumente</button></div>
          {displayedTab === "invoice" ? activePartnership ? demoMode ? <DemoSponsorInvoice sponsorName={activePartnership.sponsor_name}/> : <EventSponsorInvoice eventId={activeEvent.id} sponsorId={activePartnership.sponsor_id} sponsorName={activePartnership.sponsor_name} endpointBase={`/api/events/${activeEvent.id}/sponsors/${activePartnership.sponsor_id}/invoice`} /> : <section className="panel"><p className="task-empty">Für dieses Event wurde keine Sponsor-Zuordnung gefunden.</p></section> : displayedTab === "documents" ? activePartnership ? demoMode ? <section className="panel sponsor-document-area"><div className="table-head"><div><h2>Dokumente</h2><p className="subtitle">Deine Uploads und die vom Veranstalter für dich bereitgestellten Unterlagen.</p></div></div><p className="task-empty">Für dieses Event wurden noch keine weiteren Dokumente bereitgestellt.</p></section> : <SponsorDocumentArea eventId={activeEvent.id} sponsorId={activePartnership.sponsor_id} sponsorName={activePartnership.sponsor_name} mode="sponsor" /> : <section className="panel"><p className="task-empty">Für dieses Event wurde keine Sponsor-Zuordnung gefunden.</p></section> : displayedTab === "benefits" ? <SponsorBenefits benefits={activePartnership?.benefits ?? []}/> : displayedTab === "tasks" ? <section className="panel sponsor-portal-detail-panel sponsor-portal-benefits sponsor-portal-task-list"><div className="sponsor-portal-tab-heading"><h2>Aufgaben</h2><p>Hier siehst du für dich angelegte Aufgaben und Aufgaben zu vereinbarten Leistungen.</p></div>{hasActiveTasks && <SponsorGroup className="sponsor-portal-task-sponsor-group" name={activePartnership?.sponsor_name ?? "Sponsor"} itemCount={activeManualTasksToShow.length + activeTaskBenefits.reduce((count, benefit) => count + benefit.units.reduce((unitCount, unit) => unitCount + unit.tasks.length, 0), 0)} itemLabel="Aufgabe" itemLabelPlural="Aufgaben" contentClassName="sponsor-portal-task-sponsor-content">{activeManualTasksToShow.length > 0 && <div className="sponsor-portal-task-card-grid">{activeManualTasksToShow.map((task) => {
            const isApproval = task.completion_type === "sponsor_approval" || task.requires_sponsor_approval;
            if (task.completion_type === "sponsor_upload") return <SponsorUploadTaskCard key={task.id} task={task} busy={busyId === task.id} disabled={demoMode || Boolean(busyId)} onUpload={(file) => void uploadSponsorTask(task, file)}/>;
            const statusClass = task.status === "Erledigt" ? "done" : task.status === "In Bearbeitung" ? "progress" : "open";
            const statusText = task.status === "Erledigt" ? "Abgeschlossen" : task.status === "In Bearbeitung" ? "In Bearbeitung" : "Offen";
            if (isApproval && task.sponsor_approval_status === "approved") return <article className="sponsor-portal-benefit-task sponsor-portal-assigned-task" key={task.id}><div className="sponsor-portal-review-copy"><b>{task.title}</b><small>{`Freigegeben${task.sponsor_approved_at ? ` am ${formatFeedbackDate(task.sponsor_approved_at)}` : ""}`}</small><SponsorEvidenceHistory files={task.files} disabled={demoMode}/></div><span className="sponsor-benefit-status sponsor-benefit-status-done">Freigegeben</span></article>;
            if (isApproval) {
              const returned = task.sponsor_approval_status === "changes_requested";
              return <article className="sponsor-portal-benefit-task sponsor-portal-approval-card sponsor-portal-manual-approval" key={task.id}><div className="sponsor-portal-approval-placeholder sponsor-portal-manual-approval-placeholder" aria-hidden="true"><Icon name="file" size={25}/><span>Freigabe</span></div><div className="sponsor-portal-approval-content"><header><div className="sponsor-portal-review-copy"><span className="sponsor-portal-approval-eyebrow">Freigabe durch den Sponsor</span><b>{task.title}</b><small>{task.due_at ? `Rückmeldung bis ${formatPortalDate(task.due_at)}` : "Bitte prüfe den bereitgestellten Nachweis."}</small></div><span className={`sponsor-benefit-status sponsor-benefit-status-${returned ? "open" : "progress"}`}>{returned ? "Änderung angefragt" : "Freigabe offen"}</span></header><div className="sponsor-portal-review-footer">{task.files.length ? <SponsorEvidenceHistory files={task.files} disabled={demoMode}/> : <small className="sponsor-portal-unit-wait">Der Veranstalter hat noch keinen Nachweis zur Freigabe bereitgestellt.</small>}{returned ? <div className="sponsor-portal-returned-status" role="status">Änderung angefragt</div> : task.ready && <div className="sponsor-portal-review-actions"><button className="btn" type="button" disabled={demoMode || Boolean(busyId)} onClick={() => { setError(""); setReturningTaskId(task.id); }}>Änderung anfragen</button><button className="btn btn-primary" type="button" disabled={demoMode || Boolean(busyId)} onClick={() => void respondToTask(task, "approve")}>{busyId === task.id ? "Wird gespeichert …" : "Freigeben"}</button></div>}</div></div></article>;
            }
            return <article className="sponsor-portal-benefit-task sponsor-portal-assigned-task" key={task.id}><div className="sponsor-portal-review-copy"><b>{task.title}</b><small>{task.due_at ? `Fällig am ${formatPortalDate(task.due_at)}` : "Vom Veranstalter angelegt"}</small></div><span className={`sponsor-benefit-status sponsor-benefit-status-${statusClass}`}>{statusText}</span></article>;
          })}</div>}{activeTaskBenefits.length ? <div className="sponsor-portal-task-card-grid">{activeTaskBenefits.map((benefit) => <article className="sponsor-portal-benefit" key={benefit.id}>
            <header><div><span className="sponsor-benefit-type">{benefit.benefit_type === "in_kind" ? "Sachleistung" : "Geldleistung"}</span><b>{benefit.title}</b><span>{benefit.quantity > 1 ? `Anzahl: ${benefit.quantity}` : ""}{benefit.description ? `${benefit.quantity > 1 ? " · " : ""}${benefit.description}` : ""}</span></div><span className={`sponsor-benefit-status sponsor-benefit-status-${benefit.status === "Abgeschlossen" ? "done" : benefit.status === "In Bearbeitung" ? "progress" : "open"}`}>{benefit.status}</span></header>
            <div className="sponsor-portal-benefit-tasks">{benefit.units.map((unit) => <section className="sponsor-portal-unit" key={unit.instance}><header><b>{benefit.quantity > 1 ? `Leistung ${unit.instance} von ${benefit.quantity}` : "Leistung"}</b>{benefit.quantity > 1 && <span><i className={`sponsor-benefit-status sponsor-benefit-status-${unit.status === "Abgeschlossen" ? "done" : unit.status === "In Bearbeitung" ? "progress" : "open"}`}>{unit.status}</i></span>}</header><div className="sponsor-portal-unit-task-grid">{unit.tasks.slice().sort((a, b) => (a.workflow_order ?? 0) - (b.workflow_order ?? 0)).map((task) => {
              const showTaskStatus = true;
              const approved = task.sponsor_approval_status === "approved";
              const returned = task.sponsor_approval_status === "changes_requested" && !task.ready;
              const fileLinks = <SponsorEvidenceHistory files={task.files} disabled={demoMode}/>;
              if (task.assigned_to_sponsor && task.completion_type === "sponsor_upload") return <SponsorUploadTaskCard key={task.id} task={task} benefitName={benefit.title} busy={busyId === task.id} disabled={demoMode || Boolean(busyId)} onUpload={(file) => void uploadSponsorTask(task, file)}/>;
              if (task.assigned_to_sponsor && task.completion_type !== "sponsor_approval") return <article className="sponsor-portal-benefit-task sponsor-portal-assigned-task" key={task.id}><div className="sponsor-portal-review-copy"><b>{task.title}</b><small>Dein Beitrag{task.due_at ? ` · Fällig am ${formatPortalDate(task.due_at)}` : ""}</small><small className="sponsor-portal-task-benefit-label">Leistung: {benefit.title}</small></div>{showTaskStatus && <span className={`sponsor-benefit-status sponsor-benefit-status-${task.status === "Erledigt" ? "done" : task.status === "In Bearbeitung" ? "progress" : "open"}`}>{task.status === "Erledigt" ? "Abgeschlossen" : task.status === "In Bearbeitung" ? "In Bearbeitung" : "Offen"}</span>}</article>;
              if (approved) return <details className="sponsor-portal-benefit-task sponsor-portal-benefit-task-completed" key={task.id}><summary className="sponsor-portal-completed-summary"><span className="sponsor-portal-completed-copy"><b>{task.title}</b></span>{showTaskStatus && <span className="sponsor-benefit-status sponsor-benefit-status-done">Abgeschlossen</span>}<Icon name="chevron" size={15}/></summary><div className="sponsor-portal-completed-content"><small>{`Freigegeben${task.sponsor_approved_at ? ` am ${formatFeedbackDate(task.sponsor_approved_at)}` : ""}.`}</small><small className="sponsor-portal-task-benefit-label">Leistung: {benefit.title}</small>{fileLinks}</div></details>;
              return <article className="sponsor-portal-benefit-task sponsor-portal-approval-card sponsor-portal-manual-approval" key={task.id}>
                <div className="sponsor-portal-approval-placeholder sponsor-portal-manual-approval-placeholder" aria-hidden="true"><Icon name="file" size={25}/><span>Freigabe</span></div>
                <div className="sponsor-portal-approval-content"><header><div className="sponsor-portal-review-copy"><span className="sponsor-portal-approval-eyebrow">Freigabe durch den Sponsor</span><b>{task.title}</b><small>{returned ? "Änderungen wurden angefragt." : "Entwurf bereitgestellt · wartet auf deine Rückmeldung."}</small></div><span className={`sponsor-benefit-status ${returned ? "sponsor-benefit-status-open" : "sponsor-benefit-status-progress"}`}>{returned ? "Änderungen angefragt" : "Freigabe offen"}</span></header>
                  {task.due_at && <p className="sponsor-portal-approval-due">Rückmeldung bis {formatPortalDate(task.due_at)}</p>}
                  <small className="sponsor-portal-task-benefit-label">Leistung: {benefit.title}</small>
                  <div className="sponsor-portal-review-footer">{fileLinks}{returned ? <div className="sponsor-portal-returned-status" role="status">Änderung angefragt</div> : <div className="sponsor-portal-review-actions"><button className="btn" type="button" disabled={demoMode || !task.ready || Boolean(busyId)} onClick={() => { setError(""); setReturningTaskId(task.id); }}>Änderung anfragen</button><button className="btn btn-primary" type="button" disabled={demoMode || !task.ready || Boolean(busyId)} onClick={() => void respondToTask(task, "approve")}>{busyId === task.id ? "Wird gespeichert …" : "Freigeben"}</button></div>}</div>
                </div>
              </article>;
            })}</div></section>)}</div></article>)}</div> : null}</SponsorGroup>}
          {!hasActiveTasks && <div className="sponsor-portal-task-empty-state"><div className="sponsor-portal-task-empty-illustration" aria-hidden="true"><svg viewBox="0 0 176 132" fill="none"><path d="M22 103.5c20.5-8.4 39.7-11.2 66-11.2 26.2 0 46.4 3.1 66 11.2" stroke="#DDE7EE" strokeWidth="2" strokeLinecap="round"/><rect x="35" y="21" width="91" height="87" rx="15" transform="rotate(-8 35 21)" fill="#F3F7FA" stroke="#DCE6ED" strokeWidth="2"/><rect x="55" y="21" width="91" height="87" rx="15" transform="rotate(5 55 21)" fill="white" stroke="#DCE6ED" strokeWidth="2"/><path d="M77 49h43M75 63h47M73 77h31" stroke="#AAB9C6" strokeWidth="4" strokeLinecap="round"/><circle cx="125" cy="89" r="22" fill="#E7F5EF" stroke="white" strokeWidth="5"/><path d="m115 89 7 7 13-15" stroke="#299775" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/><path d="m41 37-5 5m0-5 5 5" stroke="#EF7056" strokeWidth="2.5" strokeLinecap="round"/><circle cx="145" cy="36" r="3" fill="#F4B44E"/></svg></div><h3>Aktuell nichts zu tun</h3><p>Bei neuen Aufgaben, zum Beispiel Freigaben von Dokumenten, findest du alle Informationen hier. Eine Benachrichtigung per E-Mail ist aktuell noch nicht eingerichtet.</p></div>}
          <details className="sponsor-portal-completed-tasks"><summary><span>Erledigte Aufgaben</span><span className="sponsor-portal-completed-count">{completedTasks.length}</span><Icon name="chevron" size={15}/></summary><div className="sponsor-portal-completed-task-list">{completedTasks.map(({ task, benefitName }) => <SponsorCompletedTaskRow key={task.id} task={task} benefitName={benefitName} demoMode={demoMode}/>)}{completedTasks.length === 0 && <p className="sponsor-portal-completed-empty">Noch keine Aufgaben abgeschlossen.</p>}</div></details></section> : <><section className="panel sponsor-portal-detail-panel sponsor-portal-contract-panel"><div className="sponsor-portal-tab-heading"><h2>Vertrag</h2><p>Vertragsdetails und aktueller Zeichnungsstand.</p></div>{activePartnership?.contracts.length ? activePartnership.contracts.map((contract) => {
            const sponsorSigned = contract.signature_status === "pending_organizer" || contract.signature_status === "signed";
            const organizerSigned = contract.signature_status === "signed";
            const statusClass = organizerSigned ? "done" : contract.signature_status === "pending_sponsor" || contract.signature_status === "pending_organizer" ? "progress" : "open";
            const organizerDisplayName = activeEvent?.organizer_name?.trim() || "Veranstalter";
            return <article className="sponsor-portal-contract" key={contract.id}>
              <header className="sponsor-portal-contract-heading"><div><h3>{contract.title || "Sponsoringvertrag"}</h3><p>{contract.sponsor_name}<span aria-hidden="true"> · </span>{new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(Number(contract.value_cents) / 100)}</p></div><span className={`sponsor-benefit-status sponsor-benefit-status-${statusClass}`}>{statusLabel(contract.signature_status)}</span></header>
              {activeEvent?.signature_addon_enabled && <section className={`sponsor-portal-signature-focus ${organizerSigned ? "is-complete" : contract.signature_status === "pending_sponsor" || contract.signature_status === "pending_organizer" ? "is-active" : ""}`} aria-label="Zeichnungsablauf"><div className="sponsor-portal-signature-focus-heading"><b>Zeichnungsablauf</b><span>{organizerSigned ? "Beide Unterschriften liegen vor." : contract.signature_status === "pending_organizer" ? `Deine Unterschrift ist erfolgt. Jetzt zeichnet ${organizerDisplayName}.` : contract.signature_status === "pending_sponsor" ? "Bitte prüfe den Vertrag und zeichne als Nächstes." : "Der Vertrag wurde noch nicht zur Zeichnung freigegeben."}</span></div><div className="signature-steps sponsor-portal-signature-steps"><div className={`signature-step ${sponsorSigned ? "done" : contract.signature_status === "pending_sponsor" ? "active" : ""}`}><span className="signature-step-marker">{sponsorSigned ? <Icon name="check" size={13}/> : null}</span><div><b>1. {contract.sponsor_name}</b><small>{sponsorSigned ? `Gezeichnet${contract.sponsor_signed_at ? ` am ${new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(new Date(contract.sponsor_signed_at))}` : ""}` : contract.signature_status === "pending_sponsor" ? "Als Nächstes" : "Wartet auf die Freigabe"}</small></div>{activeEvent?.signature_addon_enabled && contract.signature_status === "pending_sponsor" && <button className="btn btn-primary signature-step-action" type="button" disabled={busyId === contract.id} onClick={() => void sign(contract)}>{busyId === contract.id ? "Wird gespeichert …" : "Jetzt zeichnen"}</button>}</div><div className={`signature-step ${organizerSigned ? "done" : contract.signature_status === "pending_organizer" ? "active" : ""}`}><span className="signature-step-marker">{organizerSigned ? <Icon name="check" size={13}/> : null}</span><div><b>2. {organizerDisplayName}</b><small>{organizerSigned ? `Gezeichnet${contract.organizer_signed_at ? ` am ${new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(new Date(contract.organizer_signed_at))}` : ""}` : contract.signature_status === "pending_organizer" ? "Als Nächstes" : "Wartet auf die vorherige Zeichnung"}</small></div></div></div></section>}
              <div className="sponsor-portal-contract-actions">{contract.signing_url && contract.signature_status !== "signed" && <a className="btn" href={contract.signing_url} target="_blank" rel="noreferrer"><Icon name="file" size={14}/> Vertrag ansehen</a>}{contract.signature_status === "signed" && (demoMode || contract.signing_url) && <a className="btn" href={demoMode ? "/downloads/pacct-muster-vertriebspartnervereinbarung.pdf" : `/api/sponsor/contracts/${contract.id}/document?download=true`}><Icon name="file" size={14}/> Gezeichneten Vertrag herunterladen</a>}</div>
            </article>;
          }) : <p className="task-empty">Für dieses Event wurde noch kein Vertrag hinterlegt.</p>}{activeEvent?.signature_addon_enabled && <p className="sponsor-simple-signature-note">Die Klick-Zeichnung ist eine interne Bestätigung im pacct-Bereich und keine qualifizierte elektronische Signatur.</p>}</section></>}
        </> : <section className="panel sponsor-portal-empty"><h2>Event nicht gefunden</h2><p>Dieses Event ist nicht mit deinem Sponsor-Konto verknüpft.</p><Link className="btn" href="/sponsor">Zur Event-Übersicht</Link></section>}
      </> : <>
        <div className="eyebrow">DEINE PARTNERSCHAFTEN</div><h1>Willkommen im Sponsor-Bereich</h1><p className="subtitle">Hier findest du deine verknüpften Events.</p>
        <FirstLoginWalkthrough audience="sponsor" />
        {error && <p className="field-message error" role="alert">{error}</p>}{message && <p className="field-message success" role="status">{message}</p>}
        <form className="panel sponsor-invite-form" onSubmit={(event) => void redeemInvite(event)}><label htmlFor="sponsor-invite-code"><b>Event mit Einladungscode freischalten</b><span>Der Code verknüpft genau deine Sponsor-Zuordnung in diesem Event. Leerzeichen und Groß-/Kleinschreibung sind egal.</span></label><div><input id="sponsor-invite-code" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={96} value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} placeholder="Einladungscode eingeben" required/><button className="btn btn-primary" type="submit" disabled={redeeming}>{redeeming ? "Wird verknüpft …" : "Event freischalten"}</button></div></form>
        {loading ? <section className="panel"><p className="task-empty">Deine Partnerschaften werden geladen …</p></section> : events.length ? <div className="sponsor-portal-event-list">{events.map((event) => {
          const benefitCount = event.sponsor_assignments.reduce((sum, assignment) => sum + assignment.benefits.length, 0);
          const contractCount = event.sponsor_assignments.reduce((sum, assignment) => sum + assignment.contracts.length, 0);
          return <Link className="sponsor-portal-event-card" href={`/sponsor/events/${event.id}`} key={event.id}>
            {event.organizer_logo_url ? <img className="sponsor-portal-event-card-logo" src={event.organizer_logo_url} alt={`Logo ${event.title}`} /> : <span className="sponsor-portal-event-card-logo sponsor-portal-event-card-logo-placeholder" aria-hidden="true">{event.title.slice(0, 1).toLocaleUpperCase("de-DE")}</span>}
            <span className="sponsor-portal-event-card-copy"><b>{event.title}</b><small>{[event.start_date && new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(new Date(`${event.start_date}T00:00:00`)), event.location].filter(Boolean).join(" · ") || "Event"}</small></span>
            <span className="sponsor-portal-event-card-stats" aria-label="Eventübersicht">
              {event.sponsor_assignments.length > 1 && <span><b>{event.sponsor_assignments.length}</b><small>Sponsor-Zuordnungen</small></span>}
              <span><b>{benefitCount}</b><small>Leistungen</small></span>
              <span><b>{contractCount}</b><small>Verträge</small></span>
            </span>
            <span className="sponsor-portal-event-card-arrow" aria-hidden="true">→</span>
          </Link>;
        })}</div> : <section className="panel sponsor-portal-empty"><div className="metric-icon"><Icon name="file" size={18}/></div><h2>Noch keine verknüpften Events</h2><p>Bitte löse einen Einladungscode ein, damit deine Partnerschaften hier angezeigt werden.</p><Link className="btn" href="/login/sponsor">Zum Sponsor-Login</Link></section>}
      </>}
    </section>
    <footer className="sponsor-portal-footer"><span>© {new Date().getFullYear()} pacct</span><nav aria-label="Rechtliche Hinweise"><Link href="/impressum">Impressum</Link><Link href="/agb">AGB</Link><Link href="/datenschutz">Datenschutzerklärung</Link><Link href="/kontakt">Kontakt</Link></nav></footer>
    {returningTaskId && <div className="modal-backdrop sponsor-return-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busyId) { setReturningTaskId(""); setError(""); } }}><section className="create-modal sponsor-return-modal" role="dialog" aria-modal="true" aria-labelledby="sponsor-return-title"><div className="create-modal-head"><div><h2 id="sponsor-return-title">Aufgabe ablehnen</h2><p>{returningTaskHasBenefit ? "Dein Kommentar wird dem Veranstalter angezeigt. Die Unteraufgaben werden zurückgesetzt." : "Dein Kommentar wird dem Veranstalter angezeigt, damit die Aufgabe überarbeitet werden kann."}</p></div><button className="icon-button" type="button" aria-label="Dialog schließen" disabled={Boolean(busyId)} onClick={() => { setReturningTaskId(""); setError(""); }}><Icon name="close" size={16}/></button></div>{error && <p className="field-message error" role="alert">{error}</p>}<label className="sponsor-portal-comment"><span>Kommentar zu den gewünschten Änderungen *</span><textarea autoFocus required rows={4} maxLength={2000} value={approvalComments[returningTaskId] ?? ""} onChange={(event) => setApprovalComments((current) => ({ ...current, [returningTaskId]: event.target.value }))} placeholder="Was soll geändert werden?" /></label><div className="create-modal-actions"><button className="btn" type="button" disabled={Boolean(busyId)} onClick={() => { setReturningTaskId(""); setError(""); }}>Abbrechen</button><button className="btn btn-primary" type="button" disabled={Boolean(busyId) || !(approvalComments[returningTaskId] ?? "").trim()} onClick={() => void submitReturn()}>{busyId === returningTaskId ? "Wird gespeichert …" : "Ablehnen und zurückgeben"}</button></div></section></div>}
  </main>;
}
