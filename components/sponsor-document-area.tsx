"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

type DocumentCategory = "tickets" | "event_info" | "other";
type SponsorDocument = { id: string; storage_path?: string; file_name: string; content_type: string; size_bytes: number; uploaded_at: string; uploaded_by_type: "sponsor" | "organizer"; uploaded_by_name: string; document_role?: "general" | "signed_contract"; document_category?: DocumentCategory; published_to_sponsor?: boolean; contract_id?: string | null; can_delete?: boolean };
type PreparedUpload = { documentId: string; storagePath: string; uploadToken: string; contentType: string };
const acceptedFiles = ".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp";
const categoryLabels: Record<DocumentCategory, string> = { tickets: "Tickets", event_info: "Veranstaltungsinfos", other: "Sonstiges" };

function formatSize(value: number) {
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toLocaleString("de-DE", { maximumFractionDigits: 1 })} MB`;
}

export function SponsorDocumentArea({ eventId, sponsorId, sponsorName, mode = "organizer" }: { eventId: string; sponsorId: string; sponsorName: string; mode?: "organizer" | "sponsor" }) {
  const baseUrl = mode === "sponsor" ? `/api/sponsor/events/${eventId}/sponsors/${sponsorId}` : `/api/events/${eventId}/sponsors/${sponsorId}`;
  const [documents, setDocuments] = useState<SponsorDocument[]>([]);
  const [organizerFiles, setOrganizerFiles] = useState<File[]>([]);
  const [category, setCategory] = useState<DocumentCategory>("tickets");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const documentsResponse = await fetch(`${baseUrl}/documents`, { cache: "no-store" });
      const documentsResult = await documentsResponse.json();
      if (!documentsResponse.ok) throw new Error(documentsResult.error ?? "Dateien konnten nicht geladen werden.");
      setDocuments((documentsResult.documents ?? []) as SponsorDocument[]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Dokumente konnten nicht geladen werden.");
    } finally { setLoading(false); }
  }, [baseUrl]);

  useEffect(() => { void load(); }, [load]);

  async function downloadDocument(fileRecord: SponsorDocument) {
    setBusy(true); setError("");
    if (mode === "sponsor") {
      try {
        const response = await fetch(`${baseUrl}/documents?download=${encodeURIComponent(fileRecord.id)}`, { cache: "no-store" });
        if (!response.ok) {
          const result = await response.json().catch(() => ({})) as { error?: string };
          throw new Error(result.error ?? "Die Datei konnte nicht heruntergeladen werden.");
        }
        const url = URL.createObjectURL(await response.blob());
        const anchor = window.document.createElement("a");
        anchor.href = url; anchor.download = fileRecord.file_name; anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Die Datei konnte nicht heruntergeladen werden.");
      } finally { setBusy(false); }
      return;
    }
    const { data, error: downloadError } = fileRecord.storage_path
      ? await createClient().storage.from("sponsorproof-files").download(fileRecord.storage_path)
      : { data: null, error: new Error("Dateipfad fehlt") };
    if (downloadError || !data) { setError("Die Datei konnte nicht heruntergeladen werden."); setBusy(false); return; }
    const url = URL.createObjectURL(data);
    const anchor = window.document.createElement("a");
    anchor.href = url; anchor.download = fileRecord.file_name; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setBusy(false);
  }

  function openDocument(fileRecord: SponsorDocument) {
    const url = `${baseUrl}/documents?view=${encodeURIComponent(fileRecord.id)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function uploadFiles() {
    if (!organizerFiles.length || busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const supabase = createClient();
      for (const file of organizerFiles) {
        const prepareResponse = await fetch(`${baseUrl}/documents`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "prepare", fileName: file.name, contentType: file.type, size: file.size, category }),
        });
        const prepared = await prepareResponse.json() as PreparedUpload & { error?: string };
        if (!prepareResponse.ok) throw new Error(prepared.error ?? `Der Upload von ${file.name} konnte nicht vorbereitet werden.`);
        const { error: uploadError } = await supabase.storage.from("sponsorproof-files").uploadToSignedUrl(prepared.storagePath, prepared.uploadToken, file, { contentType: prepared.contentType, upsert: false });
        if (uploadError) throw new Error(`${file.name} konnte nicht hochgeladen werden.`);
        const completeResponse = await fetch(`${baseUrl}/documents`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "complete", documentId: prepared.documentId }),
        });
        const completed = await completeResponse.json() as { error?: string };
        if (!completeResponse.ok) throw new Error(completed.error ?? `${file.name} konnte nicht bestätigt werden.`);
      }
      const uploadedCount = organizerFiles.length;
      setOrganizerFiles([]);
      const input = window.document.getElementById(`${mode}-document-${sponsorId}`) as HTMLInputElement | null;
      if (input) input.value = "";
      await load();
      setMessage(uploadedCount === 1 ? "Die Datei wurde dem Dokumentenarchiv hinzugefügt." : `${uploadedCount} Dateien wurden dem Dokumentenarchiv hinzugefügt.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Die Dateien konnten nicht hochgeladen werden.");
    } finally { setBusy(false); }
  }

  async function deleteDocument(document: SponsorDocument) {
    if (!window.confirm(`„${document.file_name}“ endgültig löschen?`)) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`${baseUrl}/documents`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentId: document.id }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Die Datei konnte nicht gelöscht werden.");
      setDocuments((current) => current.filter((item) => item.id !== document.id));
      setMessage("Die Datei wurde gelöscht.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Die Datei konnte nicht gelöscht werden.");
    } finally { setBusy(false); }
  }

  async function setPublication(document: SponsorDocument, published: boolean) {
    if (published && !window.confirm(`„${document.file_name}“ im Sponsorenbereich veröffentlichen?`)) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`${baseUrl}/documents`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "publication", documentId: document.id, published }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Der Veröffentlichungsstatus konnte nicht gespeichert werden.");
      setDocuments((current) => current.map((item) => item.id === document.id ? { ...item, published_to_sponsor: published } : item));
      setMessage(published ? "Das Dokument wurde im Sponsorenbereich veröffentlicht." : "Das Dokument wird im Sponsorenbereich nicht mehr angezeigt.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Der Veröffentlichungsstatus konnte nicht gespeichert werden.");
    } finally { setBusy(false); }
  }

  return <section className="panel sponsor-document-area">
    <div className="table-head"><div><h2>{mode === "sponsor" ? "Dokumente" : `Dokumente von ${sponsorName}`}</h2><p className="subtitle" style={{ fontSize: 11, marginTop: 4 }}>{mode === "sponsor" ? "Deine Uploads und die vom Veranstalter für dich bereitgestellten Unterlagen." : "Lade Dateien für diesen Sponsor hoch und entscheide, welche im Sponsorenbereich erscheinen."}</p></div></div>
    {error && <p className="field-message error" role="alert">{error}</p>}{message && <p className="field-message success" role="status">{message}</p>}
    <div className="sponsor-document-list-heading"><div><b>Hochgeladene Dateien</b><span>{documents.length} {documents.length === 1 ? "Datei" : "Dateien"}</span></div><button className="btn sponsor-document-refresh" type="button" disabled={loading || busy} onClick={() => void load()}>Aktualisieren</button></div>
    <div className="sponsor-organizer-upload sponsor-document-upload-controls">
      <label className="btn" htmlFor={`${mode}-document-${sponsorId}`}><Icon name="plus" size={14}/> Dateien auswählen<input id={`${mode}-document-${sponsorId}`} type="file" accept={acceptedFiles} multiple disabled={busy || loading} onChange={(event) => { const selected = Array.from(event.currentTarget.files ?? []); setOrganizerFiles((current) => [...current, ...selected]); event.currentTarget.value = ""; }}/></label>
      {mode === "organizer" && <label className="sponsor-document-category-select">Kategorie<select value={category} onChange={(event) => setCategory(event.currentTarget.value as DocumentCategory)} disabled={busy || loading}><option value="tickets">Tickets</option><option value="event_info">Veranstaltungsinfos</option><option value="other">Sonstiges</option></select></label>}
      <span>{organizerFiles.length ? `${organizerFiles.length} ${organizerFiles.length === 1 ? "Datei ausgewählt" : "Dateien ausgewählt"}` : "PDF, Word oder Bild · max. 25 MB je Datei"}</span>
      {organizerFiles.length > 0 && <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void uploadFiles()}>{busy ? "Wird hochgeladen …" : "In Archiv hochladen"}</button>}
    </div>
    {loading ? <p className="task-empty">Dateien werden geladen …</p> : documents.length ? <div className="sponsor-document-list"><div className="sponsor-document-table-header"><span>DATEI</span><span>KATEGORIE</span><span>HERKUNFT</span><span>HOCHGELADEN</span><span>AKTION</span></div>{documents.map((document) => <article className="sponsor-document-row" key={document.id}><div className="sponsor-document-meta"><b>{document.file_name}</b><span>{formatSize(Number(document.size_bytes))}</span></div><div className="sponsor-document-category"><span className="sponsor-document-origin">{categoryLabels[document.document_category ?? "other"]}</span>{mode === "organizer" && document.uploaded_by_type === "organizer" && document.document_role !== "signed_contract" && <small className={`sponsor-document-publication ${document.published_to_sponsor ? "is-published" : ""}`}>{document.published_to_sponsor ? "Im Sponsorenbereich veröffentlicht" : "Nur intern"}</small>}</div><span className="sponsor-document-origin">{document.document_role === "signed_contract" ? "Gezeichneter Vertrag" : document.uploaded_by_type === "sponsor" ? "Sponsor" : `Veranstalter · ${document.uploaded_by_name}`}</span><time className="sponsor-document-date" dateTime={document.uploaded_at}>{new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(document.uploaded_at))}</time><div className="sponsor-document-actions">{mode === "organizer" && document.uploaded_by_type === "organizer" && document.document_role !== "signed_contract" && <button className={`btn ${document.published_to_sponsor ? "sponsor-document-unpublish" : "btn-primary"}`} type="button" disabled={busy} onClick={() => void setPublication(document, !document.published_to_sponsor)}>{document.published_to_sponsor ? "Veröffentlichung zurücknehmen" : "Im Sponsorenbereich veröffentlichen"}</button>}{mode === "sponsor" && <button className="btn" type="button" onClick={() => openDocument(document)}>Öffnen</button>}<button className="btn" type="button" disabled={busy} onClick={() => void downloadDocument(document)}>Herunterladen</button>{(mode === "organizer" || document.can_delete) && <button className="btn signed-contract-delete" type="button" disabled={busy} onClick={() => void deleteDocument(document)}>Löschen</button>}</div></article>)}</div> : <p className="task-empty">Für dieses Event und diesen Sponsor wurden noch keine Dateien hochgeladen.</p>}
  </section>;
}
