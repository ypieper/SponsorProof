"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Sponsor, SponsorContract } from "@/lib/sponsor-types";
import { EmptyState, Icon, Metric, Progress, Status } from "@/components/ui";
import { eventContractValuesKey, formatContractValue, parseContractValue, type EventContractValues } from "@/lib/event-contract-values";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { fetchStoredBenefits, syncLegacyBenefitsToSupabase } from "@/lib/benefits-storage";

type TaskProof = { taskId: string; name: string; type: string; blob: Blob };
type ManualTask = { id: string; title: string; sponsor: string; sponsorId?: string; eventId?: string; eventTitle?: string };
type ExtraBenefit = { id: string; title: string; sponsorId: string; eventId: string; evidence?: string };
type ReportTask = { id: string; title: string; evidence: string };
type SponsorReport = { sponsor: Sponsor; contract: SponsorContract; tasks: ReportTask[]; completed: number; ready: boolean; sent: boolean };

const evidenceDatabase = "sponsorproof-evidence";
const evidenceStore = "proofs";
const manualStorageKey = "sponsorproof.manual-tasks.v1";
const additionalBenefitsKey = "sponsorproof.additional-benefits.v1";
const sentReportsKey = "sponsorproof.sent-reports.v1";
const createdReportsKey = "sponsorproof.created-reports.v1";

function taskIdForBenefit(eventId: string, benefit: { id?: string; title: string }) {
  return benefit.id ? `benefit-${benefit.id}` : `benefit-${eventId}-${benefit.title.toLocaleLowerCase("de-DE").replace(/[^a-z0-9]+/g, "-")}`;
}

function readAllEvidence(): Promise<TaskProof[]> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(evidenceDatabase, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(evidenceStore, { keyPath: "taskId" });
    request.onsuccess = () => {
      const database = request.result;
      const read = database.transaction(evidenceStore, "readonly").objectStore(evidenceStore).getAll();
      read.onsuccess = () => { resolve(read.result as TaskProof[]); database.close(); };
      read.onerror = () => { reject(read.error); database.close(); };
    };
    request.onerror = () => reject(request.error);
  });
}

export function EventReports({ eventId, eventTitle, sponsors, contracts, benefits }: {
  eventId: string;
  eventTitle: string;
  sponsors: Sponsor[];
  contracts: SponsorContract[];
  benefits: { id?: string; title: string; sponsorId: string; eventId: string }[];
}) {
  const [reports, setReports] = useState<SponsorReport[]>([]);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedReport, setSelectedReport] = useState<SponsorReport | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadProgress() {
      try {
        const evidence = await readAllEvidence();
        const evidenceById = new Map(evidence.map((item) => [item.taskId, item]));
        const extraBenefits = JSON.parse(localStorage.getItem(additionalBenefitsKey) ?? "[]") as ExtraBenefit[];
        if (isSupabaseConfigured) {
          const syncResult = await syncLegacyBenefitsToSupabase(extraBenefits.filter((benefit) => benefit.eventId === eventId));
          if (syncResult.error) throw syncResult.error;
        }
        const storedBenefitResult = isSupabaseConfigured ? await fetchStoredBenefits(eventId) : null;
        if (storedBenefitResult?.error) throw storedBenefitResult.error;
        const databaseBenefits: ExtraBenefit[] = (storedBenefitResult?.data ?? []).flatMap((benefit) => benefit.sponsorId ? [{ id: benefit.id, title: benefit.title, sponsorId: benefit.sponsorId, eventId: benefit.eventId, evidence: benefit.evidence }] : []);
        const databaseBenefitKeys = new Set(databaseBenefits.map((benefit) => `${benefit.eventId}:${benefit.sponsorId}:${benefit.title.trim().replace(/\s+/g, " ").toLocaleLowerCase("de-DE")}`));
        const allExtraBenefits = [...databaseBenefits, ...extraBenefits.filter((benefit) => !databaseBenefitKeys.has(`${benefit.eventId}:${benefit.sponsorId}:${benefit.title.trim().replace(/\s+/g, " ").toLocaleLowerCase("de-DE")}`))];
        const manualTasks = JSON.parse(localStorage.getItem(manualStorageKey) ?? "[]") as ManualTask[];
        const sentReportIds = JSON.parse(localStorage.getItem(sentReportsKey) ?? "[]") as string[];
        const contractAmounts = JSON.parse(localStorage.getItem(eventContractValuesKey) ?? "{}") as EventContractValues;
        const eventContracts = contracts.filter((contract) => contract.eventId === eventId);
        const data = eventContracts.flatMap((contract) => {
          const sponsor = sponsors.find((item) => item.id === contract.sponsorId);
          if (!sponsor) return [];
          const contractedBenefits = [
            ...benefits.filter((benefit) => benefit.eventId === eventId && benefit.sponsorId === sponsor.id),
            ...allExtraBenefits.filter((benefit) => benefit.eventId === eventId && benefit.sponsorId === sponsor.id),
          ];
          const benefitTasks: ReportTask[] = contractedBenefits.map((benefit) => {
            const id = taskIdForBenefit(eventId, benefit);
            return { id, title: benefit.title, evidence: evidenceById.get(id)?.name ?? ("evidence" in benefit && typeof benefit.evidence === "string" && benefit.evidence !== "Noch kein Nachweis" ? benefit.evidence : "") };
          });
          const sponsorManualTasks: ReportTask[] = manualTasks.filter((task) => task.eventId === eventId && (task.sponsorId === sponsor.id || (!task.sponsorId && task.sponsor === sponsor.name))).map((task) => ({ id: task.id, title: task.title, evidence: evidenceById.get(task.id)?.name ?? "" }));
          const tasks = [...benefitTasks, ...sponsorManualTasks];
          const completed = tasks.filter((task) => evidenceById.has(task.id) || Boolean(task.evidence)).length;
          return [{ sponsor, contract: { ...contract, title: "Sponsoringvertrag", value: formatContractValue(contractAmounts[contract.id] ?? parseContractValue(contract.value)) }, tasks, completed, ready: tasks.length > 0 && completed === tasks.length, sent: sentReportIds.includes(contract.id) }];
        });
        if (!cancelled) setReports(data);
      } catch {
        if (!cancelled) setMessage("Der Aufgabenfortschritt konnte nicht geladen werden.");
      } finally {
        if (!cancelled) setReady(true);
      }
    }
    void loadProgress();
    return () => { cancelled = true; };
  }, [eventId, contracts, sponsors, benefits]);

  function printReport() {
    if (!selectedReport) return;
    try {
      const createdReports = JSON.parse(localStorage.getItem(createdReportsKey) ?? "{}") as Record<string, string>;
      createdReports[selectedReport.contract.id] = new Date().toISOString();
      localStorage.setItem(createdReportsKey, JSON.stringify(createdReports));
      window.dispatchEvent(new Event("sponso:event-timeline-updated"));
    } catch {
      setMessage("Der Report wird erstellt, der Fortschritt konnte aber nicht gespeichert werden.");
    }
    window.print();
  }

  function markReportAsSent(report: SponsorReport) {
    try {
      const sentReportIds = JSON.parse(localStorage.getItem(sentReportsKey) ?? "[]") as string[];
      const updated = [...new Set([...sentReportIds, report.contract.id])];
      localStorage.setItem(sentReportsKey, JSON.stringify(updated));
      window.dispatchEvent(new Event("sponso:event-timeline-updated"));
      setReports((current) => current.map((item) => item.contract.id === report.contract.id ? { ...item, sent: true } : item));
      setMessage(`Abschlussreport für ${report.sponsor.name} als versendet markiert.`);
    } catch {
      setMessage("Der Versandstatus konnte nicht gespeichert werden.");
    }
  }

  const totalTasks = reports.reduce((sum, report) => sum + report.tasks.length, 0);
  const totalCompleted = reports.reduce((sum, report) => sum + report.completed, 0);
  const progress = totalTasks ? Math.round(totalCompleted / totalTasks * 100) : 0;

  return <>
    <section className="metric-grid"><Metric label="Erfüllte Aufgaben" value={ready ? `${totalCompleted}` : "—"} note={`von ${totalTasks}`} icon="check"/><Metric label="Offene Aufgaben" value={ready ? `${Math.max(0, totalTasks - totalCompleted)}` : "—"} note="Nachweis ausstehend" icon="clock"/><Metric label="Gesamtfortschritt" value={ready ? `${progress} %` : "—"} note="über alle Sponsoren" icon="layers"/><Metric label="Abschlussreports bereit" value={ready ? `${reports.filter((report) => report.ready).length}` : "—"} note={`von ${reports.length} Sponsoren`} icon="file"/></section>
    <section className="panel table-panel event-reports-panel"><div className="table-head"><div><h2>Fortschritt je Sponsor</h2><p className="subtitle" style={{ fontSize: 11, marginTop: 4 }}>Ein Abschlussreport wird verfügbar, sobald alle Aufgaben eines Sponsors durch Nachweise abgeschlossen sind.</p></div></div>{!ready ? <p className="task-empty">Reports werden geladen …</p> : reports.length === 0 ? <EmptyState className="empty-state-compact" title="Noch keine Reports" description="Reports erscheinen, sobald für dieses Event Sponsoren und Verträge angelegt sind." action={<Link className="btn" href={`/events/${eventId}?tab=sponsoren`}>Zu den Sponsoren</Link>} /> : <table className="table"><thead><tr><th>SPONSOR</th><th>AUFGABEN ERFÜLLT</th><th>FORTSCHRITT</th><th>STATUS</th><th>VERSANDSTATUS</th><th>REPORT</th></tr></thead><tbody>{reports.map((report) => <tr key={report.contract.id}><td><b className="report-sponsor-name">{report.sponsor.name}</b><div className="task-caption">{report.contract.title} · {report.contract.value}</div></td><td>{report.completed} von {report.tasks.length}</td><td><Progress value={report.tasks.length ? Math.round(report.completed / report.tasks.length * 100) : 0}/></td><td><Status value={report.ready ? "Erledigt" : "Offen"}/></td><td><span className={`status ${report.sent ? "status-done" : report.ready ? "status-progress" : "status-open"}`}>{report.sent ? "Versendet" : report.ready ? "Bereit" : "Nicht bereit"}</span></td><td><div className="event-report-actions"><button className="btn btn-primary" type="button" onClick={() => setSelectedReport(report)} disabled={!ready || !report.ready}><Icon name="file" size={14}/> Abschlussreport erstellen</button><button className="btn event-report-sent-button" type="button" onClick={() => markReportAsSent(report)} disabled={!ready || !report.ready || report.sent}>{report.sent ? "Versendet" : "Als versendet markieren"}</button></div></td></tr>)}</tbody></table>}{message && <p className="task-feedback" role="status">{message}</p>}</section>
    {selectedReport && <div className="modal-backdrop completion-report-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedReport(null); }}><section className="create-modal completion-report-modal" role="dialog" aria-modal="true" aria-labelledby="completion-report-title"><div className="create-modal-head completion-report-heading"><div><div className="eyebrow">ABSCHLUSSREPORT</div><h2 id="completion-report-title">{selectedReport.sponsor.name}</h2><p>{eventTitle} · {selectedReport.contract.title}</p></div><button className="icon-button completion-report-close" type="button" aria-label="Dialog schließen" onClick={() => setSelectedReport(null)}><Icon name="close" size={16}/></button></div><div className="completion-report-summary"><div><span>Vertragsvolumen</span><b>{selectedReport.contract.value}</b></div><div><span>Aufgaben abgeschlossen</span><b>{selectedReport.completed} von {selectedReport.tasks.length}</b></div><div><span>Erstellt am</span><b>{new Intl.DateTimeFormat("de-DE", { dateStyle: "long" }).format(new Date())}</b></div></div><h3>Erfüllte Leistungen und Nachweise</h3><table className="table"><thead><tr><th>AUFGABE / LEISTUNG</th><th>NACHWEIS</th></tr></thead><tbody>{selectedReport.tasks.map((task) => <tr key={task.id}><td>{task.title}</td><td>{task.evidence || "Nachweis erbracht"}</td></tr>)}</tbody></table><div className="create-modal-actions completion-report-actions"><button className="btn" type="button" onClick={() => setSelectedReport(null)}>Schließen</button><button className="btn btn-primary" type="button" onClick={printReport}><Icon name="file" size={14}/> Drucken / als PDF speichern</button></div></section></div>}
  </>;
}
