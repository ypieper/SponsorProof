"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Sponsor, SponsorContract } from "@/lib/sponsor-types";
import { EmptyState, Icon, Metric, Progress, SponsoLogo, Status } from "@/components/ui";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { fetchStoredBenefits } from "@/lib/benefits-storage";
import { fetchStoredTasks } from "@/lib/tasks-storage";
import { fetchStoredEvidence } from "@/lib/evidence-storage";
import { fetchContractReportStates, saveContractReportState } from "@/lib/contract-documents-storage";
import { formatContractValue, parseContractValue } from "@/lib/event-contract-values";
import { useEventEntitlements } from "@/components/event-entitlements";
import { createCompletionReportPdf } from "@/lib/completion-report-pdf";

type ReportTask = { id: string; title: string; evidence: string };
type SponsorReport = { sponsor: Sponsor; contract: SponsorContract; tasks: ReportTask[]; completed: number; ready: boolean; sent: boolean };

function taskIdForBenefit(eventId: string, benefit: { id?: string; title: string }) {
  return benefit.id ? `benefit-${benefit.id}` : `benefit-${eventId}-${benefit.title.toLocaleLowerCase("de-DE").replace(/[^a-z0-9]+/g, "-")}`;
}

export function EventReports({ eventId, eventTitle, organizerLogoUrl, sponsors, contracts, benefits }: {
  eventId: string;
  eventTitle: string;
  organizerLogoUrl?: string;
  sponsors: Sponsor[];
  contracts: SponsorContract[];
  benefits: { id?: string; title: string; sponsorId: string; eventId: string }[];
}) {
  const { ensureFeature } = useEventEntitlements();
  const [reports, setReports] = useState<SponsorReport[]>([]);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const [message, setMessage] = useState("");
  const [selectedReport, setSelectedReport] = useState<SponsorReport | null>(null);
  const [pendingSentReport, setPendingSentReport] = useState<SponsorReport | null>(null);
  const [updatingReportId, setUpdatingReportId] = useState<string | null>(null);
  const [reportAction, setReportAction] = useState<"download" | "share" | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadProgress() {
      setReady(false);
      setLoadError("");
      try {
        if (!isSupabaseConfigured) throw new Error("Supabase ist nicht eingerichtet.");
        const [evidenceResult, storedBenefitResult, taskResult, reportResult] = await Promise.all([fetchStoredEvidence(), fetchStoredBenefits(eventId), fetchStoredTasks(eventId), fetchContractReportStates(contracts.filter((contract) => contract.eventId === eventId).map((contract) => contract.id))]);
        if (evidenceResult.error || storedBenefitResult.error || taskResult.error || reportResult.error) throw new Error("Reportdaten konnten nicht geladen werden.");
        const evidenceById = new Map((evidenceResult.data ?? []).map((item) => [item.taskId, { name: item.name }]));
        const reportStates = new Map((reportResult.data ?? []).map((row) => [row.contract_id, row]));
        const eventContracts = contracts.filter((contract) => contract.eventId === eventId);
        const data = eventContracts.flatMap((contract) => {
          const sponsor = sponsors.find((item) => item.id === contract.sponsorId);
          if (!sponsor) return [];
          const contractedBenefits = (storedBenefitResult.data ?? []).filter((benefit) => benefit.eventId === eventId && benefit.sponsorId === sponsor.id);
          const sponsorTasks = (taskResult.data ?? []).filter((task) => task.event_id === eventId && (task.sponsor_id === sponsor.id || (!task.sponsor_id && task.sponsor_name === sponsor.name)));
          const benefitsById = new Map(contractedBenefits.map((benefit) => [benefit.id, benefit]));
          const currentSponsorTasks = sponsorTasks.filter((task) => {
            const benefit = task.benefit_id ? benefitsById.get(task.benefit_id) : undefined;
            if (benefit?.completionRequired === false) return false;
            if (task.source !== "Leistung" || !task.benefit_id || !benefit) return true;
            return task.workflow_instance <= (benefit.tasksPerUnit ? benefit.quantity : 1);
          });
          const benefitsWithTasks = new Set(currentSponsorTasks.filter((task) => task.source === "Leistung" && task.benefit_id).map((task) => task.benefit_id));
          const legacyBenefitTasks: ReportTask[] = contractedBenefits.filter((benefit) => benefit.completionRequired !== false && !benefitsWithTasks.has(benefit.id)).map((benefit) => {
            const id = taskIdForBenefit(eventId, benefit);
            return { id, title: benefit.title, evidence: evidenceById.get(id)?.name ?? (benefit.evidence !== "Noch kein Nachweis" ? benefit.evidence : "") };
          });
          const storedTasks: ReportTask[] = currentSponsorTasks.filter((task) => task.source === "Leistung" || task.source === "Manuell").map((task) => ({ id: task.id, title: task.title, evidence: evidenceById.get(task.id)?.name ?? (task.requires_sponsor_approval && task.sponsor_approval_status === "approved" ? "Vom Sponsor freigegeben" : "") }));
          const tasks = [...legacyBenefitTasks, ...storedTasks];
          const completed = tasks.filter((task) => evidenceById.has(task.id) || Boolean(task.evidence)).length;
          const report = reportStates.get(contract.id);
          return [{ sponsor, contract: { ...contract, title: "Sponsoringvertrag", value: formatContractValue(parseContractValue(contract.value)) }, tasks, completed, ready: tasks.length > 0 && completed === tasks.length, sent: Boolean(report?.sent_at) }];
        });
        if (!cancelled) setReports(data);
      } catch {
        if (!cancelled) setLoadError("Der Aufgabenfortschritt konnte nicht geladen werden.");
      } finally {
        if (!cancelled) setReady(true);
      }
    }
    void loadProgress();
    return () => { cancelled = true; };
  }, [eventId, contracts, sponsors, benefits, retryKey]);

  function downloadPdf(file: File) {
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function createPdf(report: SponsorReport) {
    const file = await createCompletionReportPdf({
      sponsorName: report.sponsor.name,
      eventTitle,
      contractValue: report.contract.value,
      tasks: report.tasks,
      organizerLogoUrl,
    });
    const { error } = await saveContractReportState(report.contract.id, { generatedAt: new Date().toISOString() });
    if (!error) {
      window.dispatchEvent(new Event("sponso:event-timeline-updated"));
    }
    return { file, saved: !error };
  }

  async function downloadReportPdf() {
    if (!selectedReport) return;
    if (!(await ensureFeature(eventId, eventTitle, "reports"))) return;
    setReportAction("download");
    try {
      const { file, saved } = await createPdf(selectedReport);
      downloadPdf(file);
      setMessage(saved
        ? `Der Abschlussreport für ${selectedReport.sponsor.name} wurde als PDF heruntergeladen.`
        : "Die PDF wurde heruntergeladen, aber der Erstellungsstatus konnte nicht gespeichert werden.");
    } catch {
      setMessage("Der Abschlussreport konnte nicht als PDF erstellt werden.");
    } finally {
      setReportAction(null);
    }
  }

  async function sendReportToSponsor() {
    if (!selectedReport) return;
    if (!(await ensureFeature(eventId, eventTitle, "reports"))) return;
    setReportAction("share");
    try {
      const report = selectedReport;
      const { file, saved } = await createPdf(report);
      const shareData: ShareData = {
        files: [file],
        title: `Abschlussreport – ${report.sponsor.name}`,
        text: report.sponsor.email
          ? `Bitte sende den Abschlussreport an ${report.sponsor.email}. Veranstaltung: ${eventTitle}.`
          : `Abschlussreport für ${report.sponsor.name}, Veranstaltung ${eventTitle}.`,
      };
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share(shareData);
        setMessage(`${saved ? "Die PDF wurde erstellt" : "Die PDF wurde erstellt, ihr Status konnte aber nicht gespeichert werden"} und zum Teilen übergeben. Schließe den Versand in deiner E-Mail-App ab und bestätige ihn anschließend in der Übersicht.`);
      } else {
        downloadPdf(file);
        if (report.sponsor.email) {
          const subject = encodeURIComponent(`Abschlussreport – ${eventTitle}`);
          const body = encodeURIComponent(`Hallo,\n\nanbei findest du den Abschlussreport für ${eventTitle}.\n\nViele Grüße`);
          window.location.href = `mailto:${encodeURIComponent(report.sponsor.email)}?subject=${subject}&body=${body}`;
          setMessage(`${saved ? "Die PDF wurde erstellt" : "Die PDF wurde erstellt, ihr Status konnte aber nicht gespeichert werden"} und heruntergeladen. Eine E-Mail an ${report.sponsor.email} ist vorbereitet. Hänge die PDF an, sende die Nachricht und bestätige danach den Versand in der Übersicht.`);
        } else {
        setMessage("Die PDF wurde heruntergeladen. Für diesen Sponsor ist keine E-Mail-Adresse hinterlegt. Sende sie manuell und bestätige anschließend den Versand in der Übersicht.");
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        setMessage("Teilen abgebrochen. Der Abschlussreport wurde erstellt und kann als PDF heruntergeladen werden.");
      } else {
        setMessage("Der Abschlussreport konnte nicht geteilt werden. Lade die PDF herunter und versende sie per E-Mail.");
      }
    } finally {
      setReportAction(null);
    }
  }

  async function updateReportSentStatus(report: SponsorReport, sent: boolean) {
    if (!(await ensureFeature(eventId, eventTitle, "reports"))) return;
    setUpdatingReportId(report.contract.id);
    try {
      const { error } = await saveContractReportState(report.contract.id, { sentAt: sent ? new Date().toISOString() : null });
      if (error) throw error;
      window.dispatchEvent(new Event("sponso:event-timeline-updated"));
      setReports((current) => current.map((item) => item.contract.id === report.contract.id ? { ...item, sent } : item));
      setMessage(sent
        ? `Abschlussreport für ${report.sponsor.name} als versendet markiert.`
        : `Versandstatus für ${report.sponsor.name} zurückgenommen.`);
    } catch {
      setMessage("Der Versandstatus konnte nicht gespeichert werden.");
    } finally {
      setUpdatingReportId(null);
    }
  }

  const totalTasks = reports.reduce((sum, report) => sum + report.tasks.length, 0);
  const totalCompleted = reports.reduce((sum, report) => sum + report.completed, 0);
  const progress = totalTasks ? Math.round(totalCompleted / totalTasks * 100) : 0;

  return <>
    <section className="metric-grid"><Metric label="Erfüllte Aufgaben" value={ready ? `${totalCompleted}` : "—"} note={`von ${totalTasks}`} icon="check"/><Metric label="Offene Aufgaben" value={ready ? `${Math.max(0, totalTasks - totalCompleted)}` : "—"} note="Nachweis ausstehend" icon="clock"/><Metric label="Gesamtfortschritt" value={ready ? `${progress} %` : "—"} note="über alle Sponsoren" icon="layers"/><Metric label="Abschlussreports bereit" value={ready ? `${reports.filter((report) => report.ready).length}` : "—"} note={`von ${reports.length} Sponsoren`} icon="file"/></section>
    <section className="panel table-panel event-reports-panel"><div className="table-head"><div><h2>Fortschritt je Sponsor</h2><p className="subtitle" style={{ fontSize: 11, marginTop: 4 }}>Ein Abschlussreport wird verfügbar, sobald alle Aufgaben eines Sponsors durch Nachweise abgeschlossen sind. Teile die PDF und bestätige den Versand anschließend hier.</p></div></div>{!ready ? <p className="task-empty">Reports werden geladen …</p> : loadError ? <EmptyState className="empty-state-compact" title="Reports gerade nicht verfügbar" description={loadError} action={<button className="btn" type="button" onClick={() => setRetryKey((key) => key + 1)}>Erneut laden</button>} /> : reports.length === 0 ? <EmptyState className="empty-state-compact" title="Noch keine Reports" description="Reports erscheinen, sobald für dieses Event Sponsoren und Verträge angelegt sind." action={<Link className="btn" href={`/events/${eventId}?tab=sponsoren`}>Zu den Sponsoren</Link>} /> : <div className="event-report-card-list">{reports.map((report) => <article className="event-report-card" key={report.contract.id}>
      <div className="event-report-card-sponsor"><span>Sponsor</span><b className="report-sponsor-name">{report.sponsor.name}</b><small>{report.contract.title} · {report.contract.value}</small></div>
      <div><span>Aufgaben erfüllt</span><b>{report.completed} von {report.tasks.length}</b></div>
      <div className="event-report-card-progress"><span>Fortschritt</span><Progress value={report.tasks.length ? Math.round(report.completed / report.tasks.length * 100) : 0}/></div>
      <div><span>Status</span><Status value={report.ready ? "Erledigt" : "Offen"}/></div>
      <div><span>Versandstatus</span><span className={`status ${report.sent ? "status-done" : report.ready ? "status-progress" : "status-open"}`}>{report.sent ? "Versendet" : report.ready ? "Bereit" : "Nicht bereit"}</span></div>
      <div className="event-report-card-actions"><span>Report</span><div className="event-report-actions"><button className="btn btn-primary" type="button" onClick={async () => { if (await ensureFeature(eventId, eventTitle, "reports")) setSelectedReport(report); }} disabled={!ready || !report.ready}><Icon name="file" size={14}/> Abschlussreport erstellen</button><button className={`btn event-report-sent-button${report.sent ? " is-sent" : ""}`} type="button" onClick={() => report.sent ? void updateReportSentStatus(report, false) : setPendingSentReport(report)} disabled={!ready || !report.ready || updatingReportId === report.contract.id}>{updatingReportId === report.contract.id ? "Speichert …" : report.sent ? "Versand zurücknehmen" : "Versand bestätigen"}</button></div></div>
    </article>)}</div>}{message && <p className="task-feedback" role="status">{message}</p>}</section>
    {pendingSentReport && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !updatingReportId) setPendingSentReport(null); }}><section className="create-modal" role="dialog" aria-modal="true" aria-labelledby="report-sent-confirm-title"><div className="create-modal-head"><div><h2 id="report-sent-confirm-title">Versand bestätigen?</h2><p>Wurde der Abschlussreport für {pendingSentReport.sponsor.name} tatsächlich an den Sponsor versendet? Der Status wird erst nach deiner Bestätigung aktualisiert.</p></div><button className="icon-button" type="button" aria-label="Dialog schließen" disabled={Boolean(updatingReportId)} onClick={() => setPendingSentReport(null)}><Icon name="close" size={16}/></button></div><div className="create-modal-actions"><button className="btn" type="button" disabled={Boolean(updatingReportId)} onClick={() => setPendingSentReport(null)}>Noch nicht</button><button className="btn btn-primary" type="button" disabled={Boolean(updatingReportId)} onClick={async () => { await updateReportSentStatus(pendingSentReport, true); setPendingSentReport(null); }}>{updatingReportId === pendingSentReport.contract.id ? "Speichert …" : "Versand bestätigen"}</button></div></section></div>}
    {selectedReport && <div className="modal-backdrop completion-report-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedReport(null); }}><section className="create-modal completion-report-modal" role="dialog" aria-modal="true" aria-labelledby="completion-report-title">
      <div className="completion-report-document">
        <header className="completion-report-brand-row">
          <div className="completion-report-pacct-brand"><SponsoLogo markSize={30}/></div>
          {organizerLogoUrl ? <img className="completion-report-logo" src={organizerLogoUrl} alt={`Logo für ${eventTitle}`}/> : <span className="completion-report-organizer-name">{eventTitle}</span>}
        </header>
        <div className="completion-report-overline">LEISTUNGSNACHWEIS · SPONSORING</div>
        <div className="completion-report-title-row"><div><h2 id="completion-report-title">{selectedReport.sponsor.name}</h2><p>Dokumentation der vereinbarten Sponsoringleistungen</p></div><span className="completion-report-seal"><span aria-hidden="true">✓</span> Vollständig erbracht</span></div>
        <div className="completion-report-event"><span>VERANSTALTUNG</span><strong>{eventTitle}</strong></div>
        <div className="completion-report-summary">
          <div><span>Vertragswert netto</span><b>{selectedReport.contract.value}</b></div>
          <div><span>Leistungen nachgewiesen</span><b>{selectedReport.completed} von {selectedReport.tasks.length}</b></div>
          <div><span>Erstellt am</span><b>{new Intl.DateTimeFormat("de-DE", { dateStyle: "long" }).format(new Date())}</b></div>
        </div>
        <div className="completion-report-section-heading"><div><span>LEISTUNGSÜBERSICHT</span><h3>Vereinbarte Leistungen</h3></div><span>{selectedReport.tasks.length} Nachweise</span></div>
        <div className="completion-report-items">{selectedReport.tasks.map((task, index) => <article className="completion-report-item" key={task.id}><span className="completion-report-item-number">{String(index + 1).padStart(2, "0")}</span><div className="completion-report-item-content"><h4>{task.title}</h4><div className="completion-report-evidence"><Icon name="file" size={15}/><span><small>NACHWEIS</small><strong>{task.evidence || "Nachweis erbracht"}</strong></span></div></div><span className="completion-report-item-check" aria-label="Nachgewiesen">✓</span></article>)}</div>
        <footer className="completion-report-footer"><span>Erstellt mit <strong>pacct</strong></span><span>{selectedReport.sponsor.name} · {eventTitle}</span></footer>
      </div>
      <div className="create-modal-actions completion-report-actions"><button className="btn" type="button" onClick={() => setSelectedReport(null)}>Schließen</button><button className="btn" type="button" onClick={downloadReportPdf} disabled={reportAction !== null}>{reportAction === "download" ? "PDF wird erstellt …" : "PDF herunterladen"}</button><button className="btn btn-primary" type="button" onClick={sendReportToSponsor} disabled={reportAction !== null}>{reportAction === "share" ? "Wird vorbereitet …" : "PDF teilen"}</button></div>
      {message && <p className="task-feedback completion-report-feedback" role="status">{message}</p>}
    </section></div>}
  </>;
}
