"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

type SponsorDocument = { id: string; storage_path: string; file_name: string; content_type: string; size_bytes: number; uploaded_at: string; uploaded_by_type: "sponsor" | "organizer"; uploaded_by_name: string };
type ActiveLink = { id: string; created_at: string; expires_at: string; last_used_at: string | null };
type PreparedUpload = { documentId: string; storagePath: string; uploadToken: string; contentType: string };
const acceptedFiles = ".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp";

function formatSize(value: number) {
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toLocaleString("de-DE", { maximumFractionDigits: 1 })} MB`;
}

export function SponsorDocumentArea({ eventId, sponsorId, sponsorName }: { eventId: string; sponsorId: string; sponsorName: string }) {
  const baseUrl = `/api/events/${eventId}/sponsors/${sponsorId}`;
  const [documents, setDocuments] = useState<SponsorDocument[]>([]);
  const [activeLink, setActiveLink] = useState<ActiveLink | null>(null);
  const [shareUrl, setShareUrl] = useState("");
  const [organizerFiles, setOrganizerFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const linkExpired = Boolean(activeLink && new Date(activeLink.expires_at).getTime() <= Date.now());

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [documentsResponse, linkResponse] = await Promise.all([
        fetch(`${baseUrl}/documents`, { cache: "no-store" }),
        fetch(`${baseUrl}/upload-link`, { cache: "no-store" }),
      ]);
      const [documentsResult, linkResult] = await Promise.all([documentsResponse.json(), linkResponse.json()]);
      if (!documentsResponse.ok) throw new Error(documentsResult.error ?? "Dateien konnten nicht geladen werden.");
      if (!linkResponse.ok) throw new Error(linkResult.error ?? "Upload-Link konnte nicht geladen werden.");
      setDocuments((documentsResult.documents ?? []) as SponsorDocument[]);
      const restoredLink = (linkResult.activeLink ?? null) as ActiveLink | null;
      setActiveLink(restoredLink);
      setShareUrl(linkResult.token && restoredLink && new Date(restoredLink.expires_at).getTime() > Date.now()
        ? `${window.location.origin}/sponsor-upload/${linkResult.token}`
        : "");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Dokumente konnten nicht geladen werden.");
    } finally { setLoading(false); }
  }, [baseUrl]);

  useEffect(() => { void load(); }, [load]);

  async function createLink() {
    if (activeLink && !linkExpired && !window.confirm("Der bisherige Upload-Link wird ungültig. Soll ein neuer Link erzeugt werden?")) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`${baseUrl}/upload-link`, { method: "POST" });
      const result = await response.json() as { token?: string; createdAt?: string; expiresAt?: string; error?: string };
      if (!response.ok || !result.token) throw new Error(result.error ?? "Der Upload-Link konnte nicht erstellt werden.");
      setShareUrl(`${window.location.origin}/sponsor-upload/${result.token}`);
      const createdAt = result.createdAt ?? new Date().toISOString();
      setActiveLink({ id: "current", created_at: createdAt, expires_at: result.expiresAt ?? new Date(new Date(createdAt).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(), last_used_at: null });
      setMessage("Upload-Link erstellt. Kopiere ihn und sende ihn an den Sponsor.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Der Upload-Link konnte nicht erstellt werden.");
    } finally { setBusy(false); }
  }

  async function copyLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setMessage("Upload-Link kopiert. Du kannst ihn jetzt versenden.");
    } catch {
      setError("Der Link konnte nicht automatisch kopiert werden. Markiere die Adresse und kopiere sie manuell.");
    }
  }

  async function shareLink() {
    if (!shareUrl || !navigator.share) return;
    try {
      await navigator.share({ title: `Dateien für ${sponsorName}`, text: "Bitte lade deine Dateien über diesen sicheren Link hoch.", url: shareUrl });
      setMessage("Der Upload-Link wurde geteilt.");
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      setError("Der Upload-Link konnte nicht geteilt werden.");
    }
  }

  async function deactivateLink() {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`${baseUrl}/upload-link`, { method: "DELETE" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Der Upload-Link konnte nicht deaktiviert werden.");
      setActiveLink(null); setShareUrl(""); setMessage("Der Upload-Link wurde deaktiviert.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Der Upload-Link konnte nicht deaktiviert werden.");
    } finally { setBusy(false); }
  }

  async function downloadDocument(fileRecord: SponsorDocument) {
    setBusy(true); setError("");
    const { data, error: downloadError } = await createClient().storage.from("sponsorproof-files").download(fileRecord.storage_path);
    if (downloadError || !data) {
      setError("Die Datei konnte nicht heruntergeladen werden."); setBusy(false); return;
    }
    const url = URL.createObjectURL(data);
    const anchor = window.document.createElement("a");
    anchor.href = url; anchor.download = fileRecord.file_name; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setBusy(false);
  }

  async function uploadOrganizerFiles() {
    if (!organizerFiles.length || busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const supabase = createClient();
      for (const file of organizerFiles) {
        const prepareResponse = await fetch(`${baseUrl}/documents`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "prepare", fileName: file.name, contentType: file.type, size: file.size }),
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
      const input = window.document.getElementById(`organizer-document-${sponsorId}`) as HTMLInputElement | null;
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

  return <section className="panel sponsor-document-area">
    <div className="table-head"><div><h2>Dokumente von {sponsorName}</h2><p className="subtitle" style={{ fontSize: 11, marginTop: 4 }}>Lade Dateien selbst hoch oder sende dem Sponsor einen sicheren Upload-Link.</p></div></div>
    <div className="sponsor-upload-link-panel">
      <div className="sponsor-upload-link-copy"><div><b>{linkExpired ? "Sponsor-Link abgelaufen" : activeLink ? "Sponsor-Link aktiv" : "Sponsor-Upload-Link"}</b><p>{activeLink ? `${linkExpired ? "Abgelaufen" : "Gültig bis"} ${new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(new Date(activeLink.expires_at))}` : "30 Tage gültig · Dateien ohne Sponsor-Konto anfordern."}{activeLink && !linkExpired && !shareUrl ? " Bitte erzeuge einmalig einen neuen Link, damit er dauerhaft angezeigt werden kann." : ""}</p></div></div>
      <div className="sponsor-upload-link-actions">{activeLink && !linkExpired && <button className="btn" type="button" disabled={busy} onClick={() => void deactivateLink()}>Deaktivieren</button>}<button className="btn btn-primary" type="button" disabled={busy || loading} onClick={() => void createLink()}><Icon name="plus" size={14}/>{busy ? "Wird erstellt …" : activeLink ? "Neuen Link erzeugen" : "Upload-Link erzeugen"}</button></div>
    </div>
    {shareUrl && <div className="sponsor-upload-share-field"><label className="settings-field"><span>Upload-Link zum Versenden</span><input readOnly value={shareUrl} onFocus={(event) => event.currentTarget.select()} /></label>{typeof navigator !== "undefined" && "share" in navigator && <button className="btn" type="button" onClick={() => void shareLink()}>Teilen</button>}<button className="btn" type="button" onClick={() => void copyLink()}><Icon name="file" size={14}/> Link kopieren</button></div>}
    {error && <p className="field-message error" role="alert">{error}</p>}{message && <p className="field-message success" role="status">{message}</p>}
    <div className="sponsor-document-list-heading"><div><b>Hochgeladene Dateien</b><span>{documents.length} {documents.length === 1 ? "Datei" : "Dateien"}</span></div><button className="btn sponsor-document-refresh" type="button" disabled={loading || busy} onClick={() => void load()}>Aktualisieren</button></div>
    <div className="sponsor-organizer-upload">
      <label className="btn" htmlFor={`organizer-document-${sponsorId}`}><Icon name="plus" size={14}/> Dateien auswählen<input id={`organizer-document-${sponsorId}`} type="file" accept={acceptedFiles} multiple disabled={busy || loading} onChange={(event) => { const selected = Array.from(event.currentTarget.files ?? []); setOrganizerFiles((current) => [...current, ...selected]); event.currentTarget.value = ""; }}/></label>
      <span>{organizerFiles.length ? `${organizerFiles.length} ${organizerFiles.length === 1 ? "Datei ausgewählt" : "Dateien ausgewählt"}` : "Eigene Dateien hochladen · PDF, Word oder Bild · max. 25 MB je Datei"}</span>
      {organizerFiles.length > 0 && <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void uploadOrganizerFiles()}>{busy ? "Wird hochgeladen …" : "In Archiv hochladen"}</button>}
    </div>
    {loading ? <p className="task-empty">Dateien werden geladen …</p> : documents.length ? <div className="sponsor-document-list"><div className="sponsor-document-table-header"><span>DATEI</span><span>HERKUNFT</span><span>HOCHGELADEN</span><span>AKTION</span></div>{documents.map((document) => <article className="sponsor-document-row" key={document.id}><div className="sponsor-document-meta"><b>{document.file_name}</b><span>{formatSize(Number(document.size_bytes))}</span></div><span className="sponsor-document-origin">{document.uploaded_by_type === "sponsor" ? "Sponsor" : `Veranstalter · ${document.uploaded_by_name}`}</span><time className="sponsor-document-date" dateTime={document.uploaded_at}>{new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(document.uploaded_at))}</time><div className="sponsor-document-actions"><button className="btn" type="button" disabled={busy} onClick={() => void downloadDocument(document)}>Herunterladen</button><button className="btn signed-contract-delete" type="button" disabled={busy} onClick={() => void deleteDocument(document)}>Löschen</button></div></article>)}</div> : <p className="task-empty">Für dieses Event und diesen Sponsor wurden noch keine Dateien hochgeladen.</p>}
  </section>;
}
