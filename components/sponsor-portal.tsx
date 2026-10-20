"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { Icon, SponsoLogo } from "@/components/ui";
import { formatEventReportMetricValue } from "@/lib/event-report-metric-format";
import { LogoutButton } from "@/components/logout-button";
import { EventSponsorInvoice } from "@/components/event-sponsor-invoice";
import { SponsorDocumentArea } from "@/components/sponsor-document-area";
import { createClient } from "@/lib/supabase/client";
import { FirstLoginWalkthrough } from "@/components/first-login-walkthrough";

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
type PortalTask = { id: string; benefit_id: string | null; title: string; due_at: string | null; planned_publish_date: string | null; status: string; completion_type: string; requires_sponsor_approval: boolean; assigned_to_sponsor: boolean; sponsor_approval_status: string; sponsor_approved_at: string | null; ready: boolean; blocked_by?: string | null; workflow_order: number | null; workflow_instance: number; files: PortalFile[] };
type PortalStandaloneTask = { id: string; title: string; due_at: string | null; status: string; completion_type: string; requires_sponsor_approval: boolean; sponsor_approval_status: string; sponsor_approved_at: string | null; ready: boolean; blocked_by?: string | null; files: PortalFile[] };
type PortalBenefit = { id: string; title: string; benefit_type: "monetary" | "in_kind"; material_logistics: string | null; description: string; quantity: number; tasks_per_unit: boolean; due_at: string | null; status: "Offen" | "In Bearbeitung" | "Abgeschlossen"; units: Array<{ instance: number; needed_at: string | null; status: "Offen" | "In Bearbeitung" | "Abgeschlossen"; hasSponsorApproval: boolean; tasks: PortalTask[] }> };
type PortalApproval = PortalTask;
type PortalPartnership = { sponsor_id: string; sponsor_name: string; tasks: PortalStandaloneTask[]; contracts: PortalContract[]; benefits: PortalBenefit[]; tab_updates?: { invoices: Array<{ id: string; updated_at: string }>; documents: Array<{ id: string; uploaded_at: string | null }> } };
type PortalEvent = { id: string; title: string; start_date: string | null; end_date: string | null; location: string; organizer_logo_url: string | null; organizer_name: string; contact_first_name: string; contact_last_name: string; contact_email: string; contact_phone: string; signature_addon_enabled: boolean; report_metrics?: Array<{ id: string; name: string; value: string }>; sponsor_assignments: PortalPartnership[] };
type PortalEventSummary = Pick<PortalEvent, "id" | "title" | "start_date" | "end_date" | "location" | "organizer_logo_url"> & { benefit_count: number; signed_volume_cents: number };

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
  report_metrics: [{ id: "demo-attendance", name: "Besucherzahl", value: "12.500" }, { id: "demo-social-reach", name: "Social-Media-Reichweite", value: "85.000" }],
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

type SponsorPortalTab = "contract" | "invoice" | "benefits" | "tasks" | "documents" | "leistungsnachweis";
const sponsorTabReadStorageKey = "sponso:sponsor-tab-read:v1";

function sponsorTabFingerprint(value: unknown) {
  const text = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${text.length}-${(hash >>> 0).toString(36)}`;
}

function sponsorTabReadKey(eventId: string, sponsorId: string, tab: SponsorPortalTab) {
  return `${eventId}:${sponsorId}:${tab}`;
}

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

function SponsorTaskUpload({ taskId, busy, disabled, onUpload, onBrandKitSelect }: { taskId: string; busy: boolean; disabled: boolean; onUpload: (file: File) => void; onBrandKitSelect: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<Array<{ id: string; file_name: string; label: string; content_type: string; url: string | null }>>([]);
  const [selected, setSelected] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function showBrandKit() {
    if (open) { setOpen(false); return; }
    setOpen(true); setLoading(true); setError("");
    try {
      const response = await fetch(`/api/sponsor/brand-kit?taskId=${encodeURIComponent(taskId)}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Das Brand-Kit konnte nicht geladen werden.");
      setFiles(result.files ?? []);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Das Brand-Kit konnte nicht geladen werden."); }
    finally { setLoading(false); }
  }
  return <div className="sponsor-task-upload-options"><div><label className="btn btn-primary sponsor-task-upload-button"><Icon name="file" size={14}/>{busy ? "Wird hochgeladen …" : "Datei hochladen"}<input type="file" accept="image/jpeg,image/png,image/webp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx" hidden disabled={disabled || busy} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) onUpload(file); }}/></label><button className="btn" type="button" disabled={disabled || busy} onClick={() => void showBrandKit()}>Aus Brand-Kit auswählen</button></div>
    {open && <div className="sponsor-task-brand-kit-picker" aria-label="Datei aus Brand-Kit auswählen">{loading ? <small>Brand-Kit wird geladen …</small> : error ? <small className="field-message error">{error}</small> : files.length ? <><div className="sponsor-task-brand-kit-options">{files.map((file) => <button className={selected === file.id ? "selected" : ""} type="button" key={file.id} disabled={busy} onClick={() => setSelected(file.id)}><Icon name="file" size={14}/><span>{file.label}</span><small>{file.file_name}</small></button>)}</div>{selected && <div className="sponsor-task-brand-kit-preview">{files.find((file) => file.id === selected)?.url && <a href={files.find((file) => file.id === selected)?.url ?? undefined} target="_blank" rel="noreferrer">Datei vorab ansehen</a>}<button className="btn btn-primary" type="button" disabled={busy} onClick={() => { const chosen = files.find((file) => file.id === selected); if (chosen && window.confirm(`„${chosen.label}“ als Nachweis für diese Aufgabe einreichen?`)) onBrandKitSelect(chosen.id); }}>{busy ? "Wird eingereicht …" : "Auswahl bestätigen und einreichen"}</button></div>}</> : <small>Im Brand-Kit sind noch keine Dateien vorhanden. Du kannst zuerst eine Datei direkt hochladen.</small>}</div>}
  </div>;
}

function SponsorUploadTaskCard({ task, benefitName, busy, disabled, onUpload, onBrandKitSelect }: { task: Pick<PortalTask, "id" | "title" | "due_at" | "status" | "ready" | "blocked_by" | "files">; benefitName?: string; busy: boolean; disabled: boolean; onUpload: (file: File) => void; onBrandKitSelect: (id: string) => void }) {
  const done = task.status === "Erledigt";
  const inProgress = task.status === "In Bearbeitung";
  return <article className="sponsor-portal-benefit-task sponsor-portal-approval-card sponsor-portal-manual-approval sponsor-portal-upload-card">
    <div className="sponsor-portal-approval-placeholder" aria-hidden="true"><Icon name="file" size={25}/><span>Upload</span></div>
    <div className="sponsor-portal-approval-content">
      <header><div className="sponsor-portal-review-copy"><span className="sponsor-portal-approval-eyebrow">Datei vom Sponsor</span><b>{task.title}</b><small>{task.due_at ? `Fällig am ${formatPortalDate(task.due_at)}` : "Bitte lade den vereinbarten Nachweis hoch."}</small>{benefitName && <small className="sponsor-portal-task-benefit-label">Leistung: {benefitName}</small>}</div><span className={`sponsor-benefit-status sponsor-benefit-status-${done ? "done" : inProgress ? "progress" : "open"}`}>{done ? "Abgeschlossen" : inProgress ? "In Bearbeitung" : "Upload offen"}</span></header>
      <div className="sponsor-portal-review-footer">{done ? task.files.length ? <SponsorEvidenceHistory files={task.files} disabled={disabled}/> : <small className="sponsor-portal-unit-wait">Nachweis hochgeladen</small> : task.ready ? <SponsorTaskUpload taskId={task.id} busy={busy} disabled={disabled} onUpload={onUpload} onBrandKitSelect={onBrandKitSelect}/> : <small className="sponsor-portal-unit-wait">{task.blocked_by ? `Wird nach Abschluss von „${task.blocked_by}“ freigeschaltet.` : "Wird nach dem vorherigen Schritt freigeschaltet."}</small>}</div>
    </div>
  </article>;
}

function SponsorEventsList({ events, ongoingCount, completedCount, selectedTab, onSelectTab }: { events: PortalEventSummary[]; ongoingCount: number; completedCount: number; selectedTab: "ongoing" | "completed"; onSelectTab: (tab: "ongoing" | "completed") => void }) {
  return <>
    <div className="sponsor-portal-event-list-tabs" id="sponsor-events" role="tablist" aria-label="Events nach Status">
      <button type="button" role="tab" id="sponsor-events-ongoing-tab" aria-selected={selectedTab === "ongoing"} aria-controls="sponsor-events-panel" className={selectedTab === "ongoing" ? "active" : ""} onClick={() => onSelectTab("ongoing")}>Laufende Events<span>{ongoingCount}</span></button>
      <button type="button" role="tab" id="sponsor-events-completed-tab" aria-selected={selectedTab === "completed"} aria-controls="sponsor-events-panel" className={selectedTab === "completed" ? "active" : ""} onClick={() => onSelectTab("completed")}>Abgeschlossene Events<span>{completedCount}</span></button>
    </div>
    {events.length ? <div className="sponsor-portal-event-list" id="sponsor-events-panel" role="tabpanel" aria-labelledby={selectedTab === "ongoing" ? "sponsor-events-ongoing-tab" : "sponsor-events-completed-tab"}>{events.map((event) => <Link className="sponsor-portal-event-card" href={`/sponsor/events/${event.id}`} key={event.id}>
      {event.organizer_logo_url ? <img className="sponsor-portal-event-card-logo" src={event.organizer_logo_url} alt={`Logo ${event.title}`} /> : <span className="sponsor-portal-event-card-logo sponsor-portal-event-card-logo-placeholder" aria-hidden="true">{event.title.slice(0, 1).toLocaleUpperCase("de-DE")}</span>}
      <span className="sponsor-portal-event-card-copy"><b>{event.title}</b><small>{[event.start_date && new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(new Date(`${event.start_date}T00:00:00`)), event.location].filter(Boolean).join(" · ") || "Event"}</small></span>
      <span className="sponsor-portal-event-card-stats" aria-label="Eventübersicht"><span className="sponsor-portal-benefit-count-badge"><b>{event.benefit_count}</b><small>Leistungen</small></span></span>
      <span className="sponsor-portal-event-card-arrow" aria-hidden="true">→</span>
    </Link>)}</div> : <section className="panel sponsor-portal-empty sponsor-portal-event-empty" id="sponsor-events-panel" role="tabpanel" aria-labelledby={selectedTab === "ongoing" ? "sponsor-events-ongoing-tab" : "sponsor-events-completed-tab"}><p>{selectedTab === "ongoing" ? "Zurzeit gibt es keine laufenden Events." : "Es gibt noch keine abgeschlossenen Events."}</p></section>}
  </>;
}

export function SponsorPortal({ eventId, demoMode = false, view = "dashboard" }: { eventId?: string; demoMode?: boolean; view?: "dashboard" | "events" }) {
  const [events, setEvents] = useState<PortalEvent[]>(() => demoMode ? [demoPortalEvent] : []);
  const [eventSummaries, setEventSummaries] = useState<PortalEventSummary[]>([]);
  const [loading, setLoading] = useState(!demoMode);
  const [profileRequired, setProfileRequired] = useState(false);
  const [profileName, setProfileName] = useState({ firstName: "", lastName: "" });
  const [savingProfile, setSavingProfile] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [showEventInvite, setShowEventInvite] = useState(false);
  const [redeeming, setRedeeming] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [approvalComments, setApprovalComments] = useState<Record<string, string>>({});
  const [returningTaskId, setReturningTaskId] = useState("");
  const [activeTab, setActiveTab] = useState<SponsorPortalTab>("tasks");
  const [readTabSignatures, setReadTabSignatures] = useState<Record<string, string>>({});
  const [readTabSignaturesLoaded, setReadTabSignaturesLoaded] = useState(false);
  const [eventListTab, setEventListTab] = useState<"ongoing" | "completed">("ongoing");
  const [activeSponsorId, setActiveSponsorId] = useState("");
  const activeEvent = events.find((event) => event.id === eventId);
  const activePartnership = activeEvent?.sponsor_assignments.find((assignment) => assignment.sponsor_id === activeSponsorId) ?? activeEvent?.sponsor_assignments[0];
  const signedSponsoringVolume = activePartnership?.contracts.reduce((total, contract) => contract.signature_status === "signed" ? total + contract.value_cents : total, 0) ?? 0;
  const activeManualTasks = activePartnership?.tasks ?? [];
  const isCompletedSponsorTask = (task: { status: string; sponsor_approval_status: string }) => task.status === "Erledigt" || task.sponsor_approval_status === "approved";
  const activeManualTasksToShow = activeManualTasks.filter((task) => !isCompletedSponsorTask(task) && task.ready);
  const partnershipBenefits = activePartnership?.benefits ?? [];
  const completedTasks = [
    ...activeManualTasks.filter(isCompletedSponsorTask).map((task) => ({ task, benefitName: undefined as string | undefined })),
    ...partnershipBenefits.flatMap((benefit) => benefit.units.flatMap((unit) => unit.tasks
      .filter(isCompletedSponsorTask)
      .map((task) => ({ task, benefitName: benefit.title })))),
  ];
  const activeTaskBenefits = activePartnership?.benefits.map((benefit) => ({
    ...benefit,
    units: benefit.units.map((unit) => ({ ...unit, tasks: unit.tasks.filter((task) => !isCompletedSponsorTask(task) && task.ready) })).filter((unit) => unit.tasks.length > 0),
  })).filter((benefit) => benefit.units.length > 0) ?? [];
  const hasActiveTasks = activeManualTasksToShow.length > 0 || activeTaskBenefits.length > 0;
  const returningTaskHasBenefit = returningTaskId ? events.flatMap((event) => event.sponsor_assignments).flatMap((assignment) => assignment.benefits.flatMap((benefit) => benefit.units.flatMap((unit) => unit.tasks))).some((task) => task.id === returningTaskId) : false;
  const hasTaskContent = activeManualTasks.length > 0 || partnershipBenefits.some((benefit) => benefit.units.some((unit) => unit.tasks.length > 0));
  const hasBenefitContent = (activePartnership?.benefits.length ?? 0) > 0;
  const hasSignedContract = activePartnership?.contracts.some((contract) => contract.signature_status === "signed") ?? false;
  const sponsorActionTasks = [
    ...activeManualTasks.map((task) => ({ task, benefitName: undefined as string | undefined })),
    ...partnershipBenefits.flatMap((benefit) => benefit.units.flatMap((unit) => unit.tasks.map((task) => ({ task, benefitName: benefit.title })))),
  ].filter(({ task }) => {
    if (isCompletedSponsorTask(task) || !task.ready) return false;
    return task.completion_type === "sponsor_upload" || task.completion_type === "sponsor_approval" || task.requires_sponsor_approval;
  }).sort((a, b) => {
    const aDue = a.task.due_at ?? "9999-12-31";
    const bDue = b.task.due_at ?? "9999-12-31";
    return aDue.localeCompare(bDue);
  });
  const contractToSign = activePartnership?.contracts.find((contract) => contract.signature_status === "pending_sponsor" && activeEvent?.signature_addon_enabled);
  const nextSponsorAction = contractToSign
    ? { tab: "contract" as const, title: "Vertrag prüfen und unterschreiben", description: contractToSign.title || "Sponsoringvertrag", due: "" }
    : sponsorActionTasks[0]
      ? {
          tab: "tasks" as const,
          title: sponsorActionTasks[0].task.completion_type === "sponsor_upload" ? "Datei bereitstellen" : "Entwurf freigeben",
          description: sponsorActionTasks[0].task.title,
          due: sponsorActionTasks[0].task.due_at ? `Fällig am ${formatPortalDate(sponsorActionTasks[0].task.due_at)}` : "",
        }
      : null;
  const waitingForOrganizerSignature = !nextSponsorAction && activePartnership?.contracts.some((contract) => contract.signature_status === "pending_organizer");
  const canShowBenefits = hasSignedContract && hasBenefitContent;
  const canShowTasks = hasTaskContent;
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const isEventCompleted = (event: Pick<PortalEvent, "start_date" | "end_date">) => {
    const lastEventDate = event.end_date || event.start_date;
    return Boolean(lastEventDate && lastEventDate < todayKey);
  };
  const ongoingSummaryEvents = eventSummaries.filter((event) => !isEventCompleted(event));
  const completedSummaryEvents = eventSummaries.filter(isEventCompleted);
  const visibleSummaryEvents = eventListTab === "ongoing" ? ongoingSummaryEvents : completedSummaryEvents;
  const totalBenefitCount = eventSummaries.reduce((total, event) => total + event.benefit_count, 0);
  const totalSignedVolume = eventSummaries.reduce((total, event) => total + event.signed_volume_cents, 0);
  const displayedTab = activeTab === "documents" ? "documents" : activeTab === "leistungsnachweis" ? "leistungsnachweis" : activeTab === "tasks" && canShowTasks ? "tasks" : activeTab === "benefits" && canShowBenefits ? "benefits" : !hasSignedContract
    ? "contract"
    : activeTab === "tasks" && !canShowTasks
      ? canShowBenefits ? "benefits" : "contract"
      : activeTab === "benefits" && !canShowBenefits
        ? hasTaskContent ? "tasks" : "contract"
        : activeTab;
  const allSponsorTasks = [
    ...activeManualTasks.filter((task) => task.ready || isCompletedSponsorTask(task)),
    ...partnershipBenefits.flatMap((benefit) => benefit.units.flatMap((unit) => unit.tasks.filter((task) => task.ready || isCompletedSponsorTask(task)))),
  ];
  const tabSnapshots: Record<SponsorPortalTab, { signature: string; hasContent: boolean }> = {
    contract: {
      signature: sponsorTabFingerprint(activePartnership?.contracts.map(({ id, title, value_cents, signature_status, sponsor_signed_at, organizer_signed_at, signed_at }) => ({ id, title, value_cents, signature_status, sponsor_signed_at, organizer_signed_at, signed_at })) ?? []),
      hasContent: Boolean(activePartnership?.contracts.length),
    },
    invoice: {
      signature: sponsorTabFingerprint(activePartnership?.tab_updates?.invoices ?? []),
      hasContent: Boolean(activePartnership?.tab_updates?.invoices.length),
    },
    benefits: {
      signature: sponsorTabFingerprint(partnershipBenefits.map(({ id, title, benefit_type, description, quantity, status, due_at, units }) => ({ id, title, benefit_type, description, quantity, status, due_at, units: units.map(({ instance, needed_at, status: unitStatus, tasks }) => ({ instance, needed_at, status: unitStatus, tasks: tasks.map(({ id: taskId, title: taskTitle, status: taskStatus, sponsor_approval_status, sponsor_approved_at, files }) => ({ id: taskId, title: taskTitle, status: taskStatus, sponsor_approval_status, sponsor_approved_at, files: files.map(({ id: fileId, created_at }) => ({ id: fileId, created_at })) })) })) }))),
      hasContent: partnershipBenefits.length > 0,
    },
    tasks: {
      signature: sponsorTabFingerprint(allSponsorTasks.map(({ id, title, due_at, status, ready, blocked_by, sponsor_approval_status, sponsor_approved_at, files }) => ({ id, title, due_at, status, ready, blocked_by, sponsor_approval_status, sponsor_approved_at, files: files.map(({ id: fileId, created_at }) => ({ id: fileId, created_at })) }))),
      hasContent: allSponsorTasks.length > 0,
    },
    documents: {
      signature: sponsorTabFingerprint(activePartnership?.tab_updates?.documents ?? []),
      hasContent: Boolean(activePartnership?.tab_updates?.documents.length),
    },
    leistungsnachweis: {
      signature: sponsorTabFingerprint(activeEvent?.report_metrics ?? []),
      hasContent: Boolean(activeEvent?.report_metrics?.length),
    },
  };
  const activeReadKey = activeEvent && activePartnership ? sponsorTabReadKey(activeEvent.id, activePartnership.sponsor_id, displayedTab) : "";
  const hasUnreadTabContent = (tab: SponsorPortalTab) => {
    if (!activeEvent || !activePartnership || !readTabSignaturesLoaded) return false;
    const snapshot = tabSnapshots[tab];
    return snapshot.hasContent && readTabSignatures[sponsorTabReadKey(activeEvent.id, activePartnership.sponsor_id, tab)] !== snapshot.signature;
  };
  useEffect(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem(sponsorTabReadStorageKey) ?? "{}") as unknown;
      if (stored && typeof stored === "object" && !Array.isArray(stored)) {
        setReadTabSignatures(Object.fromEntries(Object.entries(stored).filter((entry): entry is [string, string] => typeof entry[1] === "string")));
      }
    } catch {
      // The unread dots still work for this session if browser storage is unavailable.
    } finally {
      setReadTabSignaturesLoaded(true);
    }
  }, []);
  useEffect(() => {
    if (!readTabSignaturesLoaded || !activeReadKey || !activeEvent || !activePartnership) return;
    const signature = tabSnapshots[displayedTab].signature;
    if (readTabSignatures[activeReadKey] === signature) return;
    const next = { ...readTabSignatures, [activeReadKey]: signature };
    setReadTabSignatures(next);
    try {
      window.localStorage.setItem(sponsorTabReadStorageKey, JSON.stringify(next));
    } catch {
      // The active tab remains read for this session even without browser storage.
    }
  }, [readTabSignaturesLoaded, activeReadKey, activeEvent, activePartnership, displayedTab, tabSnapshots[displayedTab].signature, readTabSignatures]);
  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError("");
    try {
      const query = eventId ? `?eventId=${encodeURIComponent(eventId)}` : "?summary=1";
      const response = await fetch(`/api/sponsor/portal${query}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Dein Sponsor-Bereich konnte nicht geladen werden.");
      setProfileRequired(Boolean(result.profileRequired));
      if (result.profileName) setProfileName(result.profileName);
      if (eventId) setEvents(result.events ?? []);
      else setEventSummaries(result.events ?? []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Dein Sponsor-Bereich konnte nicht geladen werden.");
    } finally { if (showLoading) setLoading(false); }
  }, [eventId]);
  useEffect(() => {
    if (demoMode) return;
    void load();
  }, [demoMode, load]);
  useEffect(() => {
    if (demoMode) return;
    const waitingForOrganizer = events.some((event) => event.sponsor_assignments.some((assignment) => assignment.contracts.some((contract) => contract.signature_status === "pending_organizer")));
    if (!eventId) return;
    let cancelled = false;
    const refreshPortalData = async () => {
      try {
        const response = await fetch(`/api/sponsor/portal?eventId=${encodeURIComponent(eventId ?? "")}`, { cache: "no-store" });
        if (!response.ok || cancelled) return;
        const result = await response.json();
        if (!cancelled) setEvents(result.events ?? []);
      } catch {
        // The current contract state stays visible if a background refresh fails.
      }
    };
    const interval = window.setInterval(() => { void refreshPortalData(); }, waitingForOrganizer ? 15000 : 60000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [demoMode, eventId, events]);
  useEffect(() => {
    if (demoMode) {
      setActiveTab("tasks");
      setActiveSponsorId("");
      return;
    }
    const validTabs = ["contract", "invoice", "benefits", "tasks", "documents", "leistungsnachweis"] as const;
    const syncTab = () => {
      const requested = new URLSearchParams(window.location.search).get("tab");
      setActiveTab(validTabs.includes(requested as typeof validTabs[number]) ? requested as typeof validTabs[number] : "tasks");
    };
    syncTab();
    window.addEventListener("popstate", syncTab);
    setActiveSponsorId("");
    return () => window.removeEventListener("popstate", syncTab);
  }, [demoMode, eventId]);

  function selectTab(tab: "contract" | "invoice" | "benefits" | "tasks" | "documents" | "leistungsnachweis") {
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

  async function uploadSponsorTask(task: { id: string }, selection: File | { brandKitFileId: string }) {
    if (demoMode || busyId) return;
    setBusyId(task.id); setError(""); setMessage("");
    try {
      const formData = new FormData();
      if (selection instanceof File) formData.set("file", selection);
      else formData.set("brandKitFileId", selection.brandKitFileId);
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
      setShowEventInvite(false);
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

  const openEventInvite = () => { setError(""); setShowEventInvite(true); };

  return <main className={`sponsor-portal-page${demoMode ? " sponsor-portal-demo-embedded" : ""}`}>
    <header className="sponsor-portal-header">{demoMode ? <span className="brand" aria-label="pacct Sponsor-Bereich"><SponsoLogo /></span> : <Link href="/sponsor" className="brand" aria-label="pacct Sponsor-Bereich"><SponsoLogo /></Link>}<nav className="sponsor-portal-main-nav" aria-label="Hauptnavigation"><Link href="/sponsor" className={!eventId && view === "dashboard" ? "active" : ""} aria-current={!eventId && view === "dashboard" ? "page" : undefined}>Übersicht</Link><Link href="/sponsor/events" className={eventId || view === "events" ? "active" : ""} aria-current={eventId || view === "events" ? "page" : undefined}>Events</Link>{!demoMode && <Link href="/sponsor/brand-kit">Brand-Kit</Link>}</nav><div><span className="sponsor-portal-header-caption">Sponsorportal</span>{demoMode ? <button className="btn logout-button" type="button" disabled>Abmelden</button> : <LogoutButton />}</div></header>
    <section className={`sponsor-portal-content${eventId ? " sponsor-portal-content-event" : ""}`}>
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
        {!demoMode && <Link className="sponsor-portal-back-link" href="/sponsor/events">← Alle Events</Link>}
        {error && !returningTaskId && <p className="field-message error" role="alert">{error}</p>}{message && <p className="field-message success" role="status">{message}</p>}
        {loading ? <section className="panel"><p className="task-empty">Event wird geladen …</p></section> : activeEvent ? <>
          <div className="sponsor-portal-event-top-grid">
            <div className="sponsor-portal-event-title-area">
              <div className="sponsor-portal-event-heading">{activeEvent.organizer_logo_url && <img className="sponsor-portal-event-heading-logo" src={activeEvent.organizer_logo_url} alt={`Logo ${activeEvent.title}`} />}<div><div className="eyebrow">DEINE PARTNERSCHAFT</div><h1>{activeEvent.title}</h1><p className="subtitle">{[activeEvent.start_date && new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(new Date(`${activeEvent.start_date}T00:00:00`)), activeEvent.location].filter(Boolean).join(" · ") || "Event"}</p>{activePartnership && <div className="sponsor-portal-heading-meta"><p className="sponsor-portal-signed-volume"><span>Gezeichnetes Sponsoring-Volumen</span><strong>{new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(signedSponsoringVolume / 100)}</strong></p></div>}</div></div>
              {activePartnership && activeEvent.sponsor_assignments.length > 1 && <label className="sponsor-portal-assignment-select"><span>Sponsor-Zuordnung</span><select value={activePartnership.sponsor_id} onChange={(event) => setActiveSponsorId(event.target.value)}>{activeEvent.sponsor_assignments.map((assignment) => <option key={assignment.sponsor_id} value={assignment.sponsor_id}>{assignment.sponsor_name}</option>)}</select></label>}
            </div>
            <div className="sponsor-portal-overview-grid">
              {activePartnership && <section className={`sponsor-portal-next-action${nextSponsorAction ? " is-actionable" : " is-waiting"}`} aria-live="polite">
                <span className="sponsor-portal-next-action-icon"><Icon name={nextSponsorAction ? "arrow" : waitingForOrganizerSignature ? "clock" : "check"} size={17}/></span>
                <div className="sponsor-portal-next-action-copy"><span>Als Nächstes von dir</span><strong>{nextSponsorAction?.title ?? (waitingForOrganizerSignature ? "Der Veranstalter unterschreibt" : "Aktuell ist nichts von dir offen")}</strong><small>{nextSponsorAction ? [nextSponsorAction.description, nextSponsorAction.due].filter(Boolean).join(" · ") : waitingForOrganizerSignature ? "Deine Unterschrift liegt vor. Du erhältst hier den aktuellen Stand." : "Offene Unterschriften, Freigaben oder Uploads werden hier angezeigt."}</small></div>
                {nextSponsorAction && <button className="btn" type="button" onClick={() => selectTab(nextSponsorAction.tab)}>{nextSponsorAction.tab === "contract" ? "Zum Vertrag" : "Zu den Aufgaben"}<Icon name="arrow" size={14}/></button>}
              </section>}
              <section className="sponsor-portal-contact"><span className="settings-section-icon"><Icon name="users" size={16}/></span><div><b>Deine Ansprechperson</b>{[activeEvent.contact_first_name, activeEvent.contact_last_name].filter(Boolean).join(" ") && <strong>{[activeEvent.contact_first_name, activeEvent.contact_last_name].filter(Boolean).join(" ")}</strong>}{activeEvent.contact_email && <a href={`mailto:${activeEvent.contact_email}`}>{activeEvent.contact_email}</a>}{activeEvent.contact_phone && <a href={`tel:${activeEvent.contact_phone.replace(/[^\d+]/g, "")}`}>{activeEvent.contact_phone}</a>}{![activeEvent.contact_first_name, activeEvent.contact_last_name, activeEvent.contact_email, activeEvent.contact_phone].some(Boolean) && <span>Kontaktdaten werden noch ergänzt.</span>}</div></section>
            </div>
          </div>
          <div className="sponsor-portal-tabs" role="tablist" aria-label="Event-Bereiche"><button type="button" role="tab" aria-selected={displayedTab === "contract"} className={displayedTab === "contract" ? "active" : ""} onClick={() => selectTab("contract")}>Vertrag{hasUnreadTabContent("contract") && <span className="sponsor-portal-tab-unread-dot" role="img" aria-label="Neuigkeiten"/>}</button>{hasSignedContract && <button type="button" role="tab" aria-selected={displayedTab === "invoice"} className={displayedTab === "invoice" ? "active" : ""} onClick={() => selectTab("invoice")}>Rechnung{hasUnreadTabContent("invoice") && <span className="sponsor-portal-tab-unread-dot" role="img" aria-label="Neuigkeiten"/>}</button>}{canShowBenefits && <button type="button" role="tab" aria-selected={displayedTab === "benefits"} className={displayedTab === "benefits" ? "active" : ""} onClick={() => selectTab("benefits")}>Leistungen<span className="sponsor-portal-tab-count" aria-label={`${activePartnership?.benefits.length ?? 0} Leistungen`}>{activePartnership?.benefits.length ?? 0}</span>{hasUnreadTabContent("benefits") && <span className="sponsor-portal-tab-unread-dot" role="img" aria-label="Neuigkeiten"/>}</button>}{canShowTasks && <button type="button" role="tab" aria-selected={displayedTab === "tasks"} className={displayedTab === "tasks" ? "active" : ""} onClick={() => selectTab("tasks")}>Aufgaben{hasUnreadTabContent("tasks") && <span className="sponsor-portal-tab-unread-dot" role="img" aria-label="Neuigkeiten"/>}</button>}<button type="button" role="tab" aria-selected={displayedTab === "documents"} className={displayedTab === "documents" ? "active" : ""} onClick={() => selectTab("documents")}>Dokumente{hasUnreadTabContent("documents") && <span className="sponsor-portal-tab-unread-dot" role="img" aria-label="Neuigkeiten"/>}</button><button type="button" role="tab" aria-selected={displayedTab === "leistungsnachweis"} className={displayedTab === "leistungsnachweis" ? "active" : ""} onClick={() => selectTab("leistungsnachweis")}>Leistungsnachweis{hasUnreadTabContent("leistungsnachweis") && <span className="sponsor-portal-tab-unread-dot" role="img" aria-label="Neuigkeiten"/>}</button></div>
          {displayedTab === "leistungsnachweis" ? <section className="panel sponsor-portal-detail-panel sponsor-portal-report-panel"><div className="sponsor-portal-tab-heading"><span className="sponsor-portal-report-icon"><Icon name="file" size={18}/></span><div><h2>Leistungsnachweis</h2><p>Hier findest du Kennzahlen und künftig deinen Bericht zu den vereinbarten und erbrachten Sponsoringleistungen.</p></div></div><section className="sponsor-portal-report-metrics"><h3>Event-Kennzahlen</h3>{activeEvent.report_metrics?.length ? <dl>{activeEvent.report_metrics.map((metric) => <div key={metric.id}><dt>{metric.name}</dt><dd>{formatEventReportMetricValue(metric.value)}</dd></div>)}</dl> : <p>Der Veranstalter hat noch keine Event-Kennzahlen hinterlegt.</p>}</section><section className="sponsor-portal-report-generation"><div><h3>Leistungsnachweis erstellen</h3><p>Der Bericht fasst vereinbarte Leistungen, Nachweise und Event-Kennzahlen zusammen.</p></div><button className="btn" type="button" disabled aria-describedby="sponsor-report-coming-soon">Bericht erstellen</button><p id="sponsor-report-coming-soon" className="sponsor-portal-report-note">Die Berichtserstellung ist bald verfügbar.</p></section></section> : displayedTab === "invoice" ? activePartnership ? demoMode ? <DemoSponsorInvoice sponsorName={activePartnership.sponsor_name}/> : <EventSponsorInvoice eventId={activeEvent.id} sponsorId={activePartnership.sponsor_id} sponsorName={activePartnership.sponsor_name} endpointBase={`/api/events/${activeEvent.id}/sponsors/${activePartnership.sponsor_id}/invoice`} /> : <section className="panel"><p className="task-empty">Für dieses Event wurde keine Sponsor-Zuordnung gefunden.</p></section> : displayedTab === "documents" ? activePartnership ? demoMode ? <section className="panel sponsor-document-area"><div className="table-head"><div><h2>Dokumente</h2><p className="subtitle">Deine Uploads und die vom Veranstalter für dich bereitgestellten Unterlagen.</p></div></div><p className="task-empty">Für dieses Event wurden noch keine weiteren Dokumente bereitgestellt.</p></section> : <SponsorDocumentArea eventId={activeEvent.id} sponsorId={activePartnership.sponsor_id} sponsorName={activePartnership.sponsor_name} mode="sponsor" /> : <section className="panel"><p className="task-empty">Für dieses Event wurde keine Sponsor-Zuordnung gefunden.</p></section> : displayedTab === "benefits" ? <SponsorBenefits benefits={activePartnership?.benefits ?? []}/> : displayedTab === "tasks" ? <section className="panel sponsor-portal-detail-panel sponsor-portal-benefits sponsor-portal-task-list"><div className="sponsor-portal-tab-heading"><h2>Aufgaben</h2><p>Hier siehst du für dich angelegte Aufgaben und Aufgaben zu vereinbarten Leistungen.</p></div>{hasActiveTasks && <div className="sponsor-portal-task-content">{activeManualTasksToShow.length > 0 && <div className="sponsor-portal-task-card-grid">{activeManualTasksToShow.map((task) => {
            const isApproval = task.completion_type === "sponsor_approval" || task.requires_sponsor_approval;
            if (task.completion_type === "sponsor_upload") return <SponsorUploadTaskCard key={task.id} task={task} busy={busyId === task.id} disabled={demoMode || Boolean(busyId)} onUpload={(file) => void uploadSponsorTask(task, file)} onBrandKitSelect={(id) => void uploadSponsorTask(task, { brandKitFileId: id })}/>;
            const statusClass = task.status === "Erledigt" ? "done" : task.status === "In Bearbeitung" ? "progress" : "open";
            const statusText = task.status === "Erledigt" ? "Abgeschlossen" : task.status === "In Bearbeitung" ? "In Bearbeitung" : "Offen";
            if (isApproval && task.sponsor_approval_status === "approved") return <article className="sponsor-portal-benefit-task sponsor-portal-assigned-task" key={task.id}><span className="sponsor-portal-task-card-icon is-done" aria-hidden="true"><Icon name="check" size={17}/></span><div className="sponsor-portal-review-copy"><b>{task.title}</b><small>{`Freigegeben${task.sponsor_approved_at ? ` am ${formatFeedbackDate(task.sponsor_approved_at)}` : ""}`}</small><SponsorEvidenceHistory files={task.files} disabled={demoMode}/></div><span className="sponsor-benefit-status sponsor-benefit-status-done">Freigegeben</span></article>;
            if (isApproval) {
              const returned = task.sponsor_approval_status === "changes_requested";
              return <article className="sponsor-portal-benefit-task sponsor-portal-approval-card sponsor-portal-manual-approval" key={task.id}><div className="sponsor-portal-approval-placeholder sponsor-portal-manual-approval-placeholder" aria-hidden="true"><Icon name="file" size={25}/><span>Freigabe</span></div><div className="sponsor-portal-approval-content"><header><div className="sponsor-portal-review-copy"><span className="sponsor-portal-approval-eyebrow">Freigabe durch den Sponsor</span><b>{task.title}</b><small>{task.blocked_by ? `Wird nach Abschluss von „${task.blocked_by}“ freigeschaltet.` : task.due_at ? `Rückmeldung bis ${formatPortalDate(task.due_at)}` : task.ready ? "Bitte prüfe den bereitgestellten Nachweis." : "Der Nachweis wird noch bereitgestellt."}</small></div><span className={`sponsor-benefit-status sponsor-benefit-status-${returned || !task.ready ? "open" : "progress"}`}>{returned ? "Änderung angefragt" : task.ready ? "Freigabe offen" : "Wartet auf Nachweis"}</span></header><div className="sponsor-portal-review-footer">{task.files.length ? <SponsorEvidenceHistory files={task.files} disabled={demoMode}/> : <small className="sponsor-portal-unit-wait">{task.blocked_by ? `Wird nach Abschluss von „${task.blocked_by}“ freigeschaltet.` : "Der Veranstalter hat noch keinen Nachweis zur Freigabe bereitgestellt."}</small>}{returned ? <div className="sponsor-portal-returned-status" role="status">Änderung angefragt</div> : task.ready && <div className="sponsor-portal-review-actions"><button className="btn" type="button" disabled={demoMode || Boolean(busyId)} onClick={() => { setError(""); setReturningTaskId(task.id); }}>Änderung anfragen</button><button className="btn btn-primary" type="button" disabled={demoMode || Boolean(busyId)} onClick={() => void respondToTask(task, "approve")}>{busyId === task.id ? "Wird gespeichert …" : "Freigeben"}</button></div>}</div></div></article>;
            }
            return <article className="sponsor-portal-benefit-task sponsor-portal-assigned-task" key={task.id}><span className={`sponsor-portal-task-card-icon${statusClass === "done" ? " is-done" : ""}`} aria-hidden="true"><Icon name={statusClass === "done" ? "check" : "layers"} size={17}/></span><div className="sponsor-portal-review-copy"><b>{task.title}</b><small>{task.due_at ? `Fällig am ${formatPortalDate(task.due_at)}` : "Vom Veranstalter angelegt"}</small></div><span className={`sponsor-benefit-status sponsor-benefit-status-${statusClass}`}>{statusText}</span></article>;
          })}</div>}{activeTaskBenefits.length ? <div className="sponsor-portal-task-card-grid">{activeTaskBenefits.map((benefit) => <article className="sponsor-portal-benefit" key={benefit.id}>
            <header><div><span className="sponsor-benefit-type">{benefit.benefit_type === "in_kind" ? "Sachleistung" : "Geldleistung"}</span><b>{benefit.title}</b><span>{benefit.quantity > 1 ? `Anzahl: ${benefit.quantity}` : ""}{benefit.description ? `${benefit.quantity > 1 ? " · " : ""}${benefit.description}` : ""}</span></div><span className={`sponsor-benefit-status sponsor-benefit-status-${benefit.status === "Abgeschlossen" ? "done" : benefit.status === "In Bearbeitung" ? "progress" : "open"}`}>{benefit.status}</span></header>
            <div className="sponsor-portal-benefit-tasks">{benefit.units.map((unit) => <section className="sponsor-portal-unit" key={unit.instance}><header><b>{benefit.quantity > 1 ? `Leistung ${unit.instance} von ${benefit.quantity}` : "Leistung"}</b>{benefit.quantity > 1 && <span><i className={`sponsor-benefit-status sponsor-benefit-status-${unit.status === "Abgeschlossen" ? "done" : unit.status === "In Bearbeitung" ? "progress" : "open"}`}>{unit.status}</i></span>}</header><div className="sponsor-portal-unit-task-grid">{unit.tasks.slice().sort((a, b) => (a.workflow_order ?? 0) - (b.workflow_order ?? 0)).map((task) => {
              const showTaskStatus = true;
              const approved = task.sponsor_approval_status === "approved";
              const returned = task.sponsor_approval_status === "changes_requested" && !task.ready;
              const fileLinks = <SponsorEvidenceHistory files={task.files} disabled={demoMode}/>;
              if (task.assigned_to_sponsor && task.completion_type === "sponsor_upload") return <SponsorUploadTaskCard key={task.id} task={task} benefitName={benefit.title} busy={busyId === task.id} disabled={demoMode || Boolean(busyId)} onUpload={(file) => void uploadSponsorTask(task, file)} onBrandKitSelect={(id) => void uploadSponsorTask(task, { brandKitFileId: id })}/>;
              if (task.assigned_to_sponsor && task.completion_type !== "sponsor_approval") return <article className="sponsor-portal-benefit-task sponsor-portal-assigned-task" key={task.id}><span className={`sponsor-portal-task-card-icon${task.status === "Erledigt" ? " is-done" : ""}`} aria-hidden="true"><Icon name={task.status === "Erledigt" ? "check" : "layers"} size={17}/></span><div className="sponsor-portal-review-copy"><b>{task.title}</b><small>Dein Beitrag{task.due_at ? ` · Fällig am ${formatPortalDate(task.due_at)}` : ""}</small><small className="sponsor-portal-task-benefit-label">Leistung: {benefit.title}</small></div>{showTaskStatus && <span className={`sponsor-benefit-status sponsor-benefit-status-${task.status === "Erledigt" ? "done" : task.status === "In Bearbeitung" ? "progress" : "open"}`}>{task.status === "Erledigt" ? "Abgeschlossen" : task.status === "In Bearbeitung" ? "In Bearbeitung" : "Offen"}</span>}</article>;
              if (approved) return <details className="sponsor-portal-benefit-task sponsor-portal-benefit-task-completed" key={task.id}><summary className="sponsor-portal-completed-summary"><span className="sponsor-portal-completed-copy"><b>{task.title}</b></span>{showTaskStatus && <span className="sponsor-benefit-status sponsor-benefit-status-done">Abgeschlossen</span>}<Icon name="chevron" size={15}/></summary><div className="sponsor-portal-completed-content"><small>{`Freigegeben${task.sponsor_approved_at ? ` am ${formatFeedbackDate(task.sponsor_approved_at)}` : ""}.`}</small><small className="sponsor-portal-task-benefit-label">Leistung: {benefit.title}</small>{fileLinks}</div></details>;
              return <article className="sponsor-portal-benefit-task sponsor-portal-approval-card sponsor-portal-manual-approval" key={task.id}>
                <div className="sponsor-portal-approval-placeholder sponsor-portal-manual-approval-placeholder" aria-hidden="true"><Icon name="file" size={25}/><span>Freigabe</span></div>
                <div className="sponsor-portal-approval-content"><header><div className="sponsor-portal-review-copy"><span className="sponsor-portal-approval-eyebrow">Freigabe durch den Sponsor</span><b>{task.title}</b><small>{returned ? "Änderungen wurden angefragt." : task.blocked_by ? `Wird nach Abschluss von „${task.blocked_by}“ freigeschaltet.` : task.ready ? "Entwurf bereitgestellt · wartet auf deine Rückmeldung." : "Der Nachweis wird noch bereitgestellt."}</small></div><span className={`sponsor-benefit-status ${returned || !task.ready ? "sponsor-benefit-status-open" : "sponsor-benefit-status-progress"}`}>{returned ? "Änderungen angefragt" : task.ready ? "Freigabe offen" : "Wartet auf Nachweis"}</span></header>
                  {task.due_at && <p className="sponsor-portal-approval-due">Rückmeldung bis {formatPortalDate(task.due_at)}</p>}
                  <small className="sponsor-portal-task-benefit-label">Leistung: {benefit.title}</small>
                  <div className="sponsor-portal-review-footer">{fileLinks}{!task.ready && <small className="sponsor-portal-unit-wait">{task.blocked_by ? `Wird nach Abschluss von „${task.blocked_by}“ freigeschaltet.` : "Der Veranstalter hat noch keinen Nachweis zur Freigabe bereitgestellt."}</small>}{returned ? <div className="sponsor-portal-returned-status" role="status">Änderung angefragt</div> : task.ready && <div className="sponsor-portal-review-actions"><button className="btn" type="button" disabled={demoMode || Boolean(busyId)} onClick={() => { setError(""); setReturningTaskId(task.id); }}>Änderung anfragen</button><button className="btn btn-primary" type="button" disabled={demoMode || Boolean(busyId)} onClick={() => void respondToTask(task, "approve")}>{busyId === task.id ? "Wird gespeichert …" : "Freigeben"}</button></div>}</div>
                </div>
              </article>;
            })}</div></section>)}</div></article>)}</div> : null}</div>}
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
      </> : view === "events" ? <>
        <div className="sponsor-portal-welcome"><div><div className="eyebrow">DEINE PARTNERSCHAFTEN</div><h1>Events</h1><p className="subtitle">Behalte laufende und abgeschlossene Event-Partnerschaften im Blick.</p></div><button className="btn btn-primary sponsor-portal-welcome-action" type="button" onClick={openEventInvite}><Icon name="plus" size={15}/>Event hinzufügen</button></div>
        {error && <p className="field-message error" role="alert">{error}</p>}{message && <p className="field-message success" role="status">{message}</p>}
        {loading ? <section className="panel"><p className="task-empty">Deine Events werden geladen …</p></section> : <SponsorEventsList events={visibleSummaryEvents} ongoingCount={ongoingSummaryEvents.length} completedCount={completedSummaryEvents.length} selectedTab={eventListTab} onSelectTab={setEventListTab}/>}
      </> : <>
        <div className="sponsor-portal-welcome"><div><div className="eyebrow">DEIN SPONSORPORTAL</div><h1>Übersicht</h1><p className="subtitle">Dein Sponsoring auf einen Blick – alle wichtigen Zahlen und Zugänge an einem Ort.</p></div><button className="btn btn-primary sponsor-portal-welcome-action" type="button" onClick={openEventInvite}><Icon name="plus" size={15}/>Event hinzufügen</button></div>
        <FirstLoginWalkthrough audience="sponsor" />
        {error && <p className="field-message error" role="alert">{error}</p>}{message && <p className="field-message success" role="status">{message}</p>}
        <div className="sponsor-portal-shortcut-grid" aria-label="Schnellzugriff"><Link className="sponsor-portal-shortcut-card" href="/sponsor/events#sponsor-events"><span className="sponsor-portal-dashboard-metric-icon"><Icon name="calendar" size={17}/></span><span><b>Events</b><small>Laufende und abgeschlossene Partnerschaften</small></span><Icon name="arrow" size={15}/></Link><Link className="sponsor-portal-shortcut-card" href="/sponsor/brand-kit"><span className="sponsor-portal-dashboard-metric-icon"><Icon name="file" size={17}/></span><span><b>Brand-Kit</b><small>Logos und Materialien verwalten</small></span><Icon name="arrow" size={15}/></Link></div>
        {loading ? <section className="panel"><p className="task-empty">Dein Dashboard wird geladen …</p></section> : eventSummaries.length ? <section className="sponsor-portal-dashboard" id="dashboard" aria-label="Dein Sponsor-Dashboard">
          <div className="sponsor-portal-dashboard-heading"><div><span>DEIN ÜBERBLICK</span><h2>Dein Sponsoring auf einen Blick</h2></div><p>Alle verbundenen Event-Partnerschaften an einem Ort.</p></div>
          <div className="sponsor-portal-dashboard-metrics">
            <article><span className="sponsor-portal-dashboard-metric-icon"><Icon name="calendar" size={16}/></span><div><small>Laufende Events</small><strong>{ongoingSummaryEvents.length}</strong></div></article>
            <article><span className="sponsor-portal-dashboard-metric-icon"><Icon name="check" size={16}/></span><div><small>Vereinbarte Leistungen</small><strong>{totalBenefitCount}</strong></div></article>
            <article><span className="sponsor-portal-dashboard-metric-icon"><Icon name="spark" size={16}/></span><div><small>Gezeichnetes Volumen</small><strong>{new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(totalSignedVolume / 100)}</strong></div></article>
          </div>
        </section> : <section className="panel sponsor-portal-empty"><div className="metric-icon"><Icon name="file" size={18}/></div><h2>Noch keine verknüpften Events</h2><p>Füge mit dem Einladungscode deines Veranstalters dein erstes Event hinzu.</p><Link className="btn" href="/login/sponsor">Zum Sponsor-Login</Link></section>}
      </>}
    </section>
    {showEventInvite && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !redeeming) setShowEventInvite(false); }} onKeyDown={(event) => { if (event.key === "Escape" && !redeeming) setShowEventInvite(false); }}><section className="create-modal sponsor-invite-dialog" role="dialog" aria-modal="true" aria-labelledby="sponsor-invite-title"><div className="create-modal-head"><div><h2 id="sponsor-invite-title">Event hinzufügen</h2><p>Gib den Einladungscode deines Veranstalters ein, um eine Partnerschaft freizuschalten.</p></div><button className="icon-button" type="button" aria-label="Dialog schließen" disabled={redeeming} onClick={() => setShowEventInvite(false)}><Icon name="close" size={16}/></button></div><form onSubmit={(event) => void redeemInvite(event)}><label className="settings-field"><span>Einladungscode</span><input autoFocus autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={96} value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} placeholder="Einladungscode eingeben" required/></label><div className="create-modal-actions"><button className="btn" type="button" disabled={redeeming} onClick={() => setShowEventInvite(false)}>Abbrechen</button><button className="btn btn-primary" type="submit" disabled={redeeming || !inviteCode.trim()}>{redeeming ? "Wird verknüpft …" : "Event hinzufügen"}</button></div></form></section></div>}
    <footer className="sponsor-portal-footer"><span>© {new Date().getFullYear()} pacct</span><nav aria-label="Rechtliche Hinweise"><Link href="/impressum">Impressum</Link><Link href="/agb">AGB</Link><Link href="/datenschutz">Datenschutzerklärung</Link><Link href="/kontakt">Kontakt</Link></nav></footer>
    {returningTaskId && <div className="modal-backdrop sponsor-return-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busyId) { setReturningTaskId(""); setError(""); } }}><section className="create-modal sponsor-return-modal" role="dialog" aria-modal="true" aria-labelledby="sponsor-return-title"><div className="create-modal-head"><div><h2 id="sponsor-return-title">Aufgabe ablehnen</h2><p>{returningTaskHasBenefit ? "Dein Kommentar wird dem Veranstalter angezeigt. Die Unteraufgaben werden zurückgesetzt." : "Dein Kommentar wird dem Veranstalter angezeigt, damit die Aufgabe überarbeitet werden kann."}</p></div><button className="icon-button" type="button" aria-label="Dialog schließen" disabled={Boolean(busyId)} onClick={() => { setReturningTaskId(""); setError(""); }}><Icon name="close" size={16}/></button></div>{error && <p className="field-message error" role="alert">{error}</p>}<label className="sponsor-portal-comment"><span>Kommentar zu den gewünschten Änderungen *</span><textarea autoFocus required rows={4} maxLength={2000} value={approvalComments[returningTaskId] ?? ""} onChange={(event) => setApprovalComments((current) => ({ ...current, [returningTaskId]: event.target.value }))} placeholder="Was soll geändert werden?" /></label><div className="create-modal-actions"><button className="btn" type="button" disabled={Boolean(busyId)} onClick={() => { setReturningTaskId(""); setError(""); }}>Abbrechen</button><button className="btn btn-primary" type="button" disabled={Boolean(busyId) || !(approvalComments[returningTaskId] ?? "").trim()} onClick={() => void submitReturn()}>{busyId === returningTaskId ? "Wird gespeichert …" : "Ablehnen und zurückgeben"}</button></div></section></div>}
  </main>;
}
