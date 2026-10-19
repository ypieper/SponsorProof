"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui";
import { CurrencyField } from "@/components/currency-field";
import { parseEInvoiceXml, type ExtractedInvoiceFields } from "@/lib/e-invoice-extraction";
import { parseContractValueInput } from "@/lib/event-contract-values";
import { createClient } from "@/lib/supabase/client";

type Invoice = {
  id: string;
  invoice_number: string;
  invoice_date: string | null;
  due_date: string | null;
  sent_date: string | null;
  net_amount: number | null;
  gross_amount: number | null;
  file_name: string | null;
  file_available: boolean;
  sponsor_visible: boolean;
  paid_at: string | null;
  updated_at: string;
};
type Draft = { invoiceNumber: string; invoiceDate: string; dueDate: string; sentDate: string; netAmount: string; grossAmount: string };
type StagedInvoiceFile = { storagePath: string; fileName: string; contentType: string };
type Props = { eventId: string; sponsorId: string; sponsorName: string; endpointBase?: string; mode?: "sponsor" | "organizer"; demoMode?: boolean };

const emptyDraft: Draft = { invoiceNumber: "", invoiceDate: "", dueDate: "", sentDate: "", netAmount: "", grossAmount: "" };
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const germanDatePattern = /^(\d{2})\.(\d{2})\.(\d{4})$/;

function displayDate(value: string | null | undefined) {
  if (!value) return "";
  const match = isoDatePattern.exec(value);
  return match ? `${match[0].slice(8, 10)}.${match[0].slice(5, 7)}.${match[0].slice(0, 4)}` : "";
}

function isoDate(value: string) {
  const match = germanDatePattern.exec(value.trim());
  if (!match) return null;
  const [, day, month, year] = match;
  const date = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === `${year}-${month}-${day}` ? `${year}-${month}-${day}` : null;
}

function invoiceDraft(invoice: Invoice): Draft {
  return {
    invoiceNumber: invoice.invoice_number ?? "",
    invoiceDate: displayDate(invoice.invoice_date),
    dueDate: displayDate(invoice.due_date),
    sentDate: displayDate(invoice.sent_date),
    netAmount: invoice.net_amount === null ? invoice.gross_amount === null ? "" : (invoice.gross_amount / 1.19).toFixed(2) : String(invoice.net_amount),
    grossAmount: invoice.gross_amount === null ? "" : String(invoice.gross_amount),
  };
}

function invoiceFields(draft: Draft) {
  const invoiceDate = draft.invoiceDate.trim() ? isoDate(draft.invoiceDate) : null;
  const dueDate = draft.dueDate.trim() ? isoDate(draft.dueDate) : null;
  const sentDate = draft.sentDate.trim() ? isoDate(draft.sentDate) : null;
  if (draft.invoiceDate.trim() && !invoiceDate) throw new Error("Bitte gib das Rechnungsdatum im Format TT.MM.JJJJ ein.");
  if (draft.dueDate.trim() && !dueDate) throw new Error("Bitte gib die Fälligkeit im Format TT.MM.JJJJ ein.");
  if (draft.sentDate.trim() && !sentDate) throw new Error("Bitte gib das Versanddatum im Format TT.MM.JJJJ ein.");
  const netAmount = draft.netAmount.trim() ? parseContractValueInput(draft.netAmount) : null;
  if (netAmount !== null && (!Number.isFinite(netAmount) || netAmount < 0)) throw new Error("Bitte gib einen gültigen Nettobetrag ein.");
  const enteredGrossAmount = draft.grossAmount.trim() ? parseContractValueInput(draft.grossAmount) : null;
  if (enteredGrossAmount !== null && (!Number.isFinite(enteredGrossAmount) || enteredGrossAmount < 0)) throw new Error("Bitte gib einen gültigen Bruttobetrag ein.");
  const grossAmount = enteredGrossAmount ?? (netAmount === null ? null : Math.round((netAmount * 1.19 + Number.EPSILON) * 100) / 100);
  return { invoiceNumber: draft.invoiceNumber, invoiceDate, dueDate, sentDate, netAmount, grossAmount };
}

export function EventSponsorInvoice({ eventId, sponsorId, sponsorName, endpointBase, mode = "sponsor", demoMode = false }: Props) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [stagedFiles, setStagedFiles] = useState<Record<string, StagedInvoiceFile | null>>({});
  const [newInvoiceId, setNewInvoiceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirmPublishId, setConfirmPublishId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const endpoint = endpointBase ?? `/api/events/${eventId}/sponsors/${sponsorId}/invoice`;

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      const result = await response.json() as { invoices?: Invoice[]; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Die Rechnungsdaten konnten nicht geladen werden.");
      const saved = result.invoices ?? [];
      setInvoices(saved);
      setDrafts(Object.fromEntries(saved.map((invoice) => [invoice.id, invoiceDraft(invoice)])));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Die Rechnungsdaten konnten nicht geladen werden.");
    } finally { setLoading(false); }
  }

  useEffect(() => {
    if (!demoMode) { void load(); return; }
    const demoAmount = sponsorName === "Elspass Autoland GmbH" ? 5000 : sponsorName === "Hellmich Baugesellschaft" ? 2500 : 1500;
    const demoInvoice: Invoice = {
      id: `demo-${sponsorId}-invoice`, invoice_number: "RE-2027-014", invoice_date: "2027-06-14", due_date: "2027-07-14", sent_date: "2027-06-14",
      net_amount: demoAmount, gross_amount: Math.round(demoAmount * 1.19 * 100) / 100,
      file_name: `Rechnung-${sponsorName.replaceAll(" ", "-")}.pdf`, file_available: true, sponsor_visible: true, paid_at: null, updated_at: "2027-06-14T09:55:00.000Z",
    };
    setInvoices([demoInvoice]);
    setDrafts({ [demoInvoice.id]: invoiceDraft(demoInvoice) });
    setLoading(false);
  }, [endpoint, demoMode, sponsorId, sponsorName]);

  function updateDraft(invoiceId: string, key: keyof Draft, value: string) {
    setDrafts((current) => ({ ...current, [invoiceId]: { ...(current[invoiceId] ?? emptyDraft), [key]: value } }));
  }

  function updateNetAmount(invoiceId: string, value: string) {
    const amount = value.trim() ? parseContractValueInput(value) : null;
    const gross = amount === null || !Number.isFinite(amount) ? "" : (Math.round((amount * 1.19 + Number.EPSILON) * 100) / 100).toFixed(2);
    setDrafts((current) => ({ ...current, [invoiceId]: { ...(current[invoiceId] ?? emptyDraft), netAmount: value, grossAmount: gross } }));
  }

  async function uploadInvoiceFile(invoiceId: string, file: File) {
    const extension = file.name.split(".").pop()?.toLowerCase();
    const contentType = extension === "xml" ? "application/xml" : "application/pdf";
    const preparedResponse = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "prepare", invoiceId, fileName: file.name, contentType, size: file.size }) });
    const prepared = await preparedResponse.json() as { storagePath?: string; uploadToken?: string; error?: string };
    if (!preparedResponse.ok || !prepared.storagePath || !prepared.uploadToken) throw new Error(prepared.error ?? "Der Upload konnte nicht vorbereitet werden.");
    const { error: uploadError } = await createClient().storage.from("sponsorproof-files").uploadToSignedUrl(prepared.storagePath, prepared.uploadToken, file, { contentType, upsert: false });
    if (uploadError) throw new Error("Die Rechnungsdatei konnte nicht hochgeladen werden.");
    return { storagePath: prepared.storagePath, fileName: file.name, contentType } satisfies StagedInvoiceFile;
  }

  async function discardStagedFile(staged: StagedInvoiceFile | null | undefined) {
    if (!staged) return;
    await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "discard", storagePath: staged.storagePath }) }).catch(() => undefined);
  }

  async function selectInvoiceFile(invoiceId: string, file: File | null) {
    setError("");
    setMessage("");
    if (!file) return;
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!(["pdf", "xml"].includes(extension ?? "")) || file.size <= 0 || file.size > 25 * 1024 * 1024) {
      setError("Bitte wähle ein PDF oder eine XML-Rechnung bis 25 MB aus.");
      return;
    }
    if (invoiceId !== newInvoiceId) {
      setFiles((current) => ({ ...current, [invoiceId]: file }));
      setMessage("Beim Ersetzen der Datei bleiben die bereits gespeicherten Rechnungsangaben erhalten.");
      return;
    }
    setAnalyzingId(invoiceId);
    try {
      setMessage("Rechnungsdatei wird hochgeladen …");
      const staged = await uploadInvoiceFile(invoiceId, file);
      const previousStaged = stagedFiles[invoiceId];
      setStagedFiles((current) => ({ ...current, [invoiceId]: staged }));
      setFiles((current) => ({ ...current, [invoiceId]: file }));
      setDrafts((current) => ({ ...current, [invoiceId]: emptyDraft }));
      if (previousStaged) void discardStagedFile(previousStaged);
      setMessage("Datei ist hochgeladen. Rechnungsdaten werden ausgelesen …");
      let fields: ExtractedInvoiceFields | null = null;
      let extractionError = "";
      try {
        const extractionResponse = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "extract", storagePath: staged.storagePath }) });
        const extractionResult = await extractionResponse.json() as { xml?: string | null; error?: string };
        if (!extractionResponse.ok) extractionError = extractionResult.error ?? "Die Datei konnte nicht ausgelesen werden.";
        else if (extractionResult.xml) fields = parseEInvoiceXml(extractionResult.xml);
      } catch {
        extractionError = "Die Datei konnte nicht ausgelesen werden.";
      }
      setDrafts((current) => ({ ...current, [invoiceId]: fields ? {
        invoiceNumber: fields.invoiceNumber ?? "",
        invoiceDate: fields.invoiceDate ? displayDate(fields.invoiceDate) : "",
        dueDate: fields.dueDate ? displayDate(fields.dueDate) : "",
        sentDate: "",
        netAmount: fields.netAmount ?? "",
        grossAmount: fields.grossAmount ?? "",
      } : emptyDraft }));
      if (!fields) {
        setMessage(extractionError
          ? `Datei wurde hochgeladen, aber ${extractionError} Du kannst die Felder manuell ausfüllen.`
          : extension === "pdf"
            ? "Die Datei wurde hochgeladen. Es wurden keine eingebetteten XRechnungs-/ZUGFeRD-Daten gefunden. Du kannst die Felder jetzt manuell ausfüllen."
            : "Die Datei wurde hochgeladen, enthält aber kein unterstütztes Rechnungsformat. Du kannst die Felder jetzt manuell ausfüllen.");
        return;
      }
      setMessage(fields.currency && fields.currency !== "EUR"
        ? `Datei hochgeladen und ausgelesen. Beträge in ${fields.currency} wurden nicht übernommen; bitte erfasse die Euro-Beträge manuell.`
        : "Datei hochgeladen und ausgelesen. Prüfe die erkannten Angaben und ergänze das Versanddatum.");
    } catch (reason) {
      const detail = reason instanceof Error ? reason.message : "Unbekannter Fehler";
      setError(`Die Rechnungsdatei konnte nicht verarbeitet werden: ${detail}`);
    } finally {
      setAnalyzingId((current) => current === invoiceId ? null : current);
    }
  }

  async function saveInvoice(invoiceId: string, isNew = false) {
    if (busyId) return;
    const file = files[invoiceId] ?? null;
    const staged = stagedFiles[invoiceId] ?? null;
    setBusyId(invoiceId); setError(""); setMessage("");
    try {
      const fields = invoiceFields(drafts[invoiceId] ?? emptyDraft);
      if (isNew && (!file || !staged)) throw new Error("Lade zuerst eine Rechnungsdatei hoch.");
      let response: Response;
      if (isNew && staged) {
        response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "complete", invoiceId, ...fields, storagePath: staged.storagePath, fileName: staged.fileName, contentType: staged.contentType }) });
      } else if (file) {
        const extension = file.name.split(".").pop()?.toLowerCase();
        const contentType = extension === "xml" ? "application/xml" : "application/pdf";
        if (!(["pdf", "xml"].includes(extension ?? "")) || file.size <= 0 || file.size > 25 * 1024 * 1024) throw new Error("Bitte wähle ein PDF oder eine XML-Rechnung bis 25 MB aus.");
        const preparedResponse = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "prepare", invoiceId, fileName: file.name, contentType, size: file.size }) });
        const prepared = await preparedResponse.json() as { storagePath?: string; uploadToken?: string; error?: string };
        if (!preparedResponse.ok || !prepared.storagePath || !prepared.uploadToken) throw new Error(prepared.error ?? "Der Upload konnte nicht vorbereitet werden.");
        const { error: uploadError } = await createClient().storage.from("sponsorproof-files").uploadToSignedUrl(prepared.storagePath, prepared.uploadToken, file, { contentType, upsert: false });
        if (uploadError) throw new Error("Die Rechnungsdatei konnte nicht hochgeladen werden.");
        response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "complete", invoiceId, ...fields, storagePath: prepared.storagePath, fileName: file.name, contentType }) });
      } else {
        response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save", invoiceId, ...fields }) });
      }
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Die Rechnungsdaten konnten nicht gespeichert werden.");
      setFiles((current) => ({ ...current, [invoiceId]: null }));
      setStagedFiles((current) => ({ ...current, [invoiceId]: null }));
      if (isNew) setNewInvoiceId(null);
      await load();
      setMessage(isNew ? "Rechnung wurde hinzugefügt." : file ? "Rechnung und Angaben wurden gespeichert." : "Rechnungsangaben wurden gespeichert.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Die Rechnung konnte nicht gespeichert werden.");
    } finally { setBusyId(null); }
  }

  async function download(invoice: Invoice) {
    setBusyId(invoice.id); setError(""); setMessage("");
    try {
      const response = await fetch(`${endpoint}?download=1&invoiceId=${encodeURIComponent(invoice.id)}`, { cache: "no-store" });
      if (!response.ok) {
        const result = await response.json() as { error?: string };
        throw new Error(result.error ?? "Die Rechnungsdatei konnte nicht heruntergeladen werden.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = invoice.file_name ?? "Rechnung.pdf"; anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Die Rechnungsdatei konnte nicht heruntergeladen werden.");
    } finally { setBusyId(null); }
  }

  async function setPublication(invoiceId: string, published: boolean) {
    if (busyId) return;
    setBusyId(invoiceId); setError(""); setMessage("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "publish", invoiceId, published }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Die Veröffentlichung konnte nicht gespeichert werden.");
      setConfirmPublishId(null);
      await load();
      setMessage(published ? "Die Rechnung wurde für den Sponsor veröffentlicht." : "Die Rechnung ist für den Sponsor nicht mehr sichtbar.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Die Veröffentlichung konnte nicht gespeichert werden.");
    } finally { setBusyId(null); }
  }

  async function setPaid(invoiceId: string, paid: boolean) {
    if (busyId) return;
    setBusyId(invoiceId); setError(""); setMessage("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "payment_status", invoiceId, paid }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Der Zahlungsstatus konnte nicht gespeichert werden.");
      await load();
      setMessage(paid ? "Die Rechnung wurde als bezahlt markiert." : "Die Rechnung wurde wieder als offen markiert.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Der Zahlungsstatus konnte nicht gespeichert werden.");
    } finally { setBusyId(null); }
  }

  async function deleteInvoice(invoiceId: string) {
    if (busyId) return;
    setBusyId(invoiceId); setError(""); setMessage("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", invoiceId }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Die Rechnung konnte nicht gelöscht werden.");
      setConfirmDeleteId(null);
      await load();
      setMessage("Die Rechnung und ihre Datei wurden gelöscht.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Die Rechnung konnte nicht gelöscht werden.");
    } finally { setBusyId(null); }
  }

  const dateField = (invoiceId: string, draft: Draft, key: "invoiceDate" | "dueDate" | "sentDate", label: string) => <label className="settings-field"><span>{label}</span><input type="text" inputMode="numeric" placeholder="TT.MM.JJJJ" maxLength={10} disabled={mode === "sponsor" || demoMode} value={draft[key]} onChange={(event) => updateDraft(invoiceId, key, event.target.value)} /></label>;
  const editableInvoices = invoices;
  const visibleInvoices = mode === "sponsor" ? invoices.filter((invoice) => invoice.sponsor_visible && invoice.file_available) : editableInvoices;
  const totalNetAmount = visibleInvoices.reduce((total, invoice) => {
    const netAmount = invoice.net_amount ?? (invoice.gross_amount === null ? 0 : invoice.gross_amount / 1.19);
    return total + Number(netAmount || 0);
  }, 0);

  function invoiceCard(invoice: Invoice, index: number) {
    const draft = drafts[invoice.id] ?? invoiceDraft(invoice);
    const saving = busyId === invoice.id;
    const netAmount = invoice.net_amount ?? (invoice.gross_amount === null ? null : invoice.gross_amount / 1.19);
    const formattedNetAmount = netAmount === null ? "Nicht angegeben" : new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(netAmount);
    return <details className="sponsor-invoice-card" key={invoice.id}>
      <summary className="sponsor-invoice-summary"><span className="sponsor-invoice-summary-total"><small>Rechnungssumme (netto)</small><strong>{formattedNetAmount}</strong></span><span className="sponsor-invoice-card-statuses"><span className={`sponsor-invoice-payment-status ${invoice.paid_at ? "paid" : "unpaid"}`}>{invoice.paid_at ? "Bezahlt" : "Nicht bezahlt"}</span>{mode === "organizer" && <span className={`sponsor-invoice-publication-status ${invoice.sponsor_visible ? "published" : "private"}`} title={invoice.sponsor_visible ? "Im Sponsorbereich veröffentlicht" : "Nur für Veranstalter sichtbar"}>{invoice.sponsor_visible ? "Veröffentlicht" : "Intern"}</span>}</span><span className="sponsor-invoice-summary-chevron"><Icon name="chevron" size={15}/></span></summary>
      <div className="sponsor-invoice-expanded"><header className="sponsor-invoice-card-head"><div><span className="sponsor-invoice-card-label">Rechnung {index + 1}</span><b>{invoice.file_name || draft.invoiceNumber || "Rechnungsdatei"}</b></div></header>
      <div className="sponsor-invoice-grid">
        <label className="settings-field"><span>Rechnungsnummer</span><input type="text" maxLength={120} disabled={mode === "sponsor" || demoMode} value={draft.invoiceNumber} onChange={(event) => updateDraft(invoice.id, "invoiceNumber", event.target.value)} placeholder="z. B. RE-2026-014" /></label>
        {dateField(invoice.id, draft, "invoiceDate", "Rechnungsdatum")}
        {dateField(invoice.id, draft, "dueDate", "Fällig am")}
        {dateField(invoice.id, draft, "sentDate", "Versanddatum")}
        <label className="settings-field"><span>Nettobetrag</span><CurrencyField value={draft.netAmount} onChange={(value) => updateNetAmount(invoice.id, value)} ariaLabel="Rechnungsbetrag netto in Euro" readOnly={mode === "sponsor" || demoMode}/></label>
        <label className="settings-field"><span>Bruttobetrag</span><CurrencyField value={draft.grossAmount} onChange={() => undefined} ariaLabel="Rechnungsbetrag brutto in Euro" readOnly/></label>
      </div>
      <div className="sponsor-invoice-file-row">
        {mode === "organizer" && !demoMode && <label className="btn" htmlFor={`sponsor-invoice-file-${invoice.id}`}><Icon name="plus" size={14}/>{files[invoice.id] ? "Datei ausgewählt" : "Rechnungsdatei ersetzen"}<input id={`sponsor-invoice-file-${invoice.id}`} type="file" accept="application/pdf,.pdf,application/xml,text/xml,.xml" disabled={Boolean(busyId) || analyzingId === invoice.id} onChange={(event) => void selectInvoiceFile(invoice.id, event.currentTarget.files?.[0] ?? null)} /></label>}
        <span>{files[invoice.id]?.name ?? invoice.file_name ?? "Rechnungsdatei fehlt"}</span>
        {invoice.file_available && <button className="btn" type="button" disabled={Boolean(busyId) || demoMode} onClick={() => void download(invoice)}><Icon name="file" size={14}/> Rechnung herunterladen</button>}
        {mode === "organizer" && !demoMode && invoice.file_available && <label className="sponsor-invoice-publish-toggle"><input type="checkbox" checked={invoice.sponsor_visible} disabled={Boolean(busyId)} onChange={(event) => event.target.checked ? setConfirmPublishId(invoice.id) : void setPublication(invoice.id, false)}/><span>Im Sponsorenbereich veröffentlichen</span></label>}
      </div>
      {mode === "organizer" && !demoMode && <p className="sponsor-invoice-vat-note">XRechnung und ZUGFeRD werden lokal im Browser ausgelesen. Das Versanddatum wird manuell erfasst.</p>}
      {mode === "organizer" && !demoMode && <>{analyzingId === invoice.id && <p className="sponsor-invoice-vat-note">Rechnungsdaten werden lokal ausgelesen …</p>}<div className="sponsor-invoice-card-actions"><button className="btn sponsor-invoice-delete-button" type="button" disabled={Boolean(busyId) || Boolean(analyzingId)} onClick={() => setConfirmDeleteId(invoice.id)}>Rechnung löschen</button><button className="btn" type="button" disabled={Boolean(busyId)} onClick={() => void setPaid(invoice.id, !invoice.paid_at)}>{saving ? "Wird gespeichert …" : invoice.paid_at ? "Zahlung als offen markieren" : "Als bezahlt markieren"}</button><button className="btn btn-primary" type="button" disabled={Boolean(busyId) || Boolean(analyzingId)} onClick={() => void saveInvoice(invoice.id)}>{saving ? "Wird gespeichert …" : "Änderungen speichern"}</button></div></>}
      </div>
    </details>;
  }

  function newInvoiceCard() {
    if (!newInvoiceId) return null;
    const draft = drafts[newInvoiceId] ?? emptyDraft;
    const staged = analyzingId === newInvoiceId ? null : stagedFiles[newInvoiceId];
    return <article className="sponsor-invoice-card sponsor-invoice-card-new" key={newInvoiceId}>
      <header className="sponsor-invoice-card-head"><div><span className="sponsor-invoice-card-label">Neue Rechnung</span><b>Rechnungsangaben erfassen</b></div></header>
      <div className="sponsor-invoice-file-row"><label className="btn" htmlFor={`sponsor-invoice-file-${newInvoiceId}`}><Icon name="plus" size={14}/>{staged ? "Andere Rechnungsdatei hochladen" : "Rechnung hochladen und auslesen"}<input id={`sponsor-invoice-file-${newInvoiceId}`} type="file" accept="application/pdf,.pdf,application/xml,text/xml,.xml" disabled={Boolean(busyId) || analyzingId === newInvoiceId} onChange={(event) => void selectInvoiceFile(newInvoiceId, event.currentTarget.files?.[0] ?? null)} /></label><span>{files[newInvoiceId]?.name ?? "PDF (auch ZUGFeRD) oder XML (XRechnung) · maximal 25 MB"}</span></div>
      {!staged && <p className="sponsor-invoice-vat-note">Lade zuerst die Rechnung hoch. Erkannte Rechnungsdaten werden anschließend hier angezeigt. Versanddatum bitte ergänzen.</p>}
      {analyzingId === newInvoiceId && <p className="sponsor-invoice-vat-note">{message || "Rechnung wird hochgeladen und ausgelesen …"}</p>}
      {staged && <>
      <div className="sponsor-invoice-grid">
        <label className="settings-field"><span>Rechnungsnummer</span><input type="text" maxLength={120} value={draft.invoiceNumber} onChange={(event) => updateDraft(newInvoiceId, "invoiceNumber", event.target.value)} placeholder="z. B. RE-2026-014" /></label>
        {dateField(newInvoiceId, draft, "invoiceDate", "Rechnungsdatum")}
        {dateField(newInvoiceId, draft, "dueDate", "Fällig am")}
        {dateField(newInvoiceId, draft, "sentDate", "Versanddatum")}
        <label className="settings-field"><span>Nettobetrag</span><CurrencyField value={draft.netAmount} onChange={(value) => updateNetAmount(newInvoiceId, value)} ariaLabel="Rechnungsbetrag netto in Euro" /></label>
        <label className="settings-field"><span>Bruttobetrag</span><CurrencyField value={draft.grossAmount} onChange={() => undefined} ariaLabel="Rechnungsbetrag brutto in Euro" readOnly/></label>
      </div>
      <p className="sponsor-invoice-vat-note">Strukturierte Daten aus XRechnung und ZUGFeRD werden nach dem Upload lokal im Browser ausgelesen. Das Versanddatum steht nicht in der Rechnung und wird manuell erfasst.</p>
      </>}
      <div className="sponsor-invoice-card-actions"><button className="btn" type="button" disabled={Boolean(busyId) || Boolean(analyzingId)} onClick={() => { void discardStagedFile(staged); setNewInvoiceId(null); setFiles((current) => { const next = { ...current }; delete next[newInvoiceId]; return next; }); setStagedFiles((current) => { const next = { ...current }; delete next[newInvoiceId]; return next; }); }}>Abbrechen</button>{staged && <button className="btn btn-primary" type="button" disabled={Boolean(busyId) || Boolean(analyzingId)} onClick={() => void saveInvoice(newInvoiceId, true)}>{busyId === newInvoiceId ? "Wird gespeichert …" : "Rechnung hinzufügen"}</button>}</div>
    </article>;
  }

  return <section className="panel sponsor-invoice-area">
    <div className="table-head"><div><h2>Rechnung</h2><p className="subtitle" style={{ fontSize: 11, marginTop: 4 }}>{mode === "organizer" ? `Rechnungen und Angaben für ${sponsorName} in diesem Event.` : `Veröffentlichte Rechnungen für ${sponsorName} in diesem Event.`}</p></div>{mode === "organizer" && !demoMode && !newInvoiceId && <button className="btn btn-primary" type="button" onClick={() => { const id = globalThis.crypto.randomUUID(); setDrafts((current) => ({ ...current, [id]: emptyDraft })); setNewInvoiceId(id); }}><Icon name="plus" size={14}/> Rechnung hinzufügen</button>}</div>
    {error && <p className="field-message error" role="alert">{error}</p>}{message && <p className="field-message success" role="status">{message}</p>}
    {loading ? <p className="task-empty">Rechnungen werden geladen …</p> : <><article className="sponsor-invoice-total-card"><span>Gesamtrechnungswert (netto)</span><strong>{new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(totalNetAmount)}</strong></article><div className="sponsor-invoice-list">{visibleInvoices.map(invoiceCard)}{mode === "organizer" && newInvoiceCard()}{mode === "organizer" && !invoices.length && !newInvoiceId && <p className="task-empty">Für diesen Sponsor wurden noch keine Rechnungen erfasst.</p>}{mode === "sponsor" && !visibleInvoices.length && <p className="task-empty">Der Veranstalter hat noch keine Rechnungen veröffentlicht.</p>}</div></>}
    {confirmPublishId && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busyId) setConfirmPublishId(null); }}><section className="create-modal" role="dialog" aria-modal="true" aria-labelledby="publish-invoice-title"><div className="create-modal-head"><div><h2 id="publish-invoice-title">Rechnung veröffentlichen?</h2><p>Der Sponsor kann diese Rechnungsdatei anschließend im Rechnungs-Tab dieses Events herunterladen.</p></div><button className="icon-button" type="button" aria-label="Dialog schließen" disabled={Boolean(busyId)} onClick={() => setConfirmPublishId(null)}><Icon name="close" size={16}/></button></div><div className="create-modal-actions"><button className="btn" type="button" disabled={Boolean(busyId)} onClick={() => setConfirmPublishId(null)}>Abbrechen</button><button className="btn btn-primary" type="button" disabled={Boolean(busyId)} onClick={() => void setPublication(confirmPublishId, true)}>{busyId === confirmPublishId ? "Wird veröffentlicht …" : "Veröffentlichung bestätigen"}</button></div></section></div>}
    {confirmDeleteId && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busyId) setConfirmDeleteId(null); }}><section className="create-modal" role="dialog" aria-modal="true" aria-labelledby="delete-invoice-title"><div className="create-modal-head"><div><h2 id="delete-invoice-title">Rechnung löschen?</h2><p>Die Rechnungsangaben und die zugehörige PDF-Datei werden gelöscht. Eine veröffentlichte Rechnung ist danach auch im Sponsorbereich nicht mehr verfügbar.</p></div><button className="icon-button" type="button" aria-label="Dialog schließen" disabled={Boolean(busyId)} onClick={() => setConfirmDeleteId(null)}><Icon name="close" size={16}/></button></div><div className="create-modal-actions"><button className="btn" type="button" disabled={Boolean(busyId)} onClick={() => setConfirmDeleteId(null)}>Abbrechen</button><button className="btn btn-danger" type="button" disabled={Boolean(busyId)} onClick={() => void deleteInvoice(confirmDeleteId)}>{busyId === confirmDeleteId ? "Wird gelöscht …" : "Rechnung löschen"}</button></div></section></div>}
  </section>;
}
