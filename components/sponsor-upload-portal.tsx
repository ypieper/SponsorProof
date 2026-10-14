"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

type PortalDetails = {
  eventTitle: string;
  sponsorName: string;
  contactFirstName: string;
  contactLastName: string;
  organizerLogoUrl: string | null;
  benefits: Array<{ id: string; title: string; description: string; category: string }>;
  uploadedDocuments: Array<{ id: string; file_name: string; size_bytes: number; uploaded_at: string | null }>;
};
type PreparedUpload = { documentId: string; storagePath: string; uploadToken: string; contentType: string };
const accept = ".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp";

export function SponsorUploadPortal({ token }: { token: string }) {
  const [details, setDetails] = useState<PortalDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const greetingName = details?.contactFirstName && details.contactLastName
    ? `${details.contactFirstName} ${details.contactLastName}`
    : details?.sponsorName;

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/public/sponsor-upload/${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Der Upload-Link ist ungültig.");
        return result as PortalDetails;
      })
      .then((result) => { if (!cancelled) setDetails(result); })
      .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Der Upload-Link konnte nicht geladen werden."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token]);

  async function uploadFiles(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!files.length || uploading) return;
    setUploading(true); setError(""); setMessage("");
    try {
      const supabase = createClient();
      for (const file of files) {
        if (file.size > 25 * 1024 * 1024) throw new Error(`${file.name} ist größer als 25 MB.`);
        const prepareResponse = await fetch(`/api/public/sponsor-upload/${encodeURIComponent(token)}`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "prepare", fileName: file.name, contentType: file.type, size: file.size }),
        });
        const prepared = await prepareResponse.json() as PreparedUpload & { error?: string };
        if (!prepareResponse.ok) throw new Error(prepared.error ?? `Der Upload von ${file.name} konnte nicht vorbereitet werden.`);
        const { error: uploadError } = await supabase.storage.from("sponsorproof-files").uploadToSignedUrl(prepared.storagePath, prepared.uploadToken, file, { contentType: prepared.contentType, upsert: false });
        if (uploadError) throw new Error(`${file.name} konnte nicht hochgeladen werden.`);
        const completeResponse = await fetch(`/api/public/sponsor-upload/${encodeURIComponent(token)}`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "complete", documentId: prepared.documentId }),
        });
        const completed = await completeResponse.json() as { fileName?: string; error?: string };
        if (!completeResponse.ok) throw new Error(completed.error ?? `${file.name} konnte nicht bestätigt werden.`);
      }
      const refreshResponse = await fetch(`/api/public/sponsor-upload/${encodeURIComponent(token)}`, { cache: "no-store" });
      const refreshedDetails = await refreshResponse.json() as PortalDetails & { error?: string };
      if (refreshResponse.ok) setDetails(refreshedDetails);
      setFiles([]);
      setMessage(files.length === 1 ? "Die Datei wurde an den Veranstalter übermittelt." : `${files.length} Dateien wurden an den Veranstalter übermittelt.`);
      const input = document.getElementById("sponsor-upload-files") as HTMLInputElement | null;
      if (input) input.value = "";
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Die Dateien konnten nicht hochgeladen werden.");
    } finally {
      setUploading(false);
    }
  }

  return <section className="sponsor-upload-card panel">
    {(!details || loading) && <span className="sponsor-upload-icon"><Icon name={error && !details && !loading ? "close" : "file"} size={20}/></span>}
    {loading ? <><h2>Upload-Link wird geprüft …</h2><p>Bitte einen Moment warten.</p></> : error && !details ? <><h1>Upload nicht verfügbar</h1><p role="alert">{error}</p></> : details ? <>
      <div className="eyebrow">DATEIEN SICHER ÜBERMITTELN</div>
      <h1>Hallo, {greetingName}</h1>
      <p className="sponsor-upload-context">Veranstaltung: <b>{details.eventTitle}</b></p>
      <p>Hier kannst du angeforderte Vertragsunterlagen, Logos und weitere Dateien direkt an den Veranstalter übermitteln.</p>
      <section className="sponsor-upload-benefits" aria-labelledby="sponsor-upload-benefits-title">
        <h2 id="sponsor-upload-benefits-title">Für dein Sponsoring vereinbart</h2>
        {details.benefits.length ? <ul>{details.benefits.map((benefit) => <li key={benefit.id}><div><b>{benefit.title}</b>{benefit.description && <p>{benefit.description}</p>}</div><span>{benefit.category}</span></li>)}</ul> : <p>Für dieses Event sind noch keine Leistungen hinterlegt.</p>}
      </section>
      <section className="sponsor-upload-benefits" aria-labelledby="sponsor-upload-existing-title">
        <h2 id="sponsor-upload-existing-title">Bereits von dir hochgeladen</h2>
        {details.uploadedDocuments.length ? <ul>{details.uploadedDocuments.map((file) => <li key={file.id}><div><b>{file.file_name}</b><p>{(Number(file.size_bytes) / (1024 * 1024)).toLocaleString("de-DE", { maximumFractionDigits: 1 })} MB{file.uploaded_at ? ` · ${new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(file.uploaded_at))}` : ""}</p></div></li>)}</ul> : <p>Du hast für dieses Event noch keine Dateien hochgeladen.</p>}
      </section>
      <form onSubmit={(event) => void uploadFiles(event)}>
        <label className="sponsor-upload-dropzone" htmlFor="sponsor-upload-files"><Icon name="file" size={22}/><b>{files.length ? "Weitere Dateien auswählen" : "Dateien auswählen"}</b><span>{files.length ? `${files.length} ${files.length === 1 ? "Datei ausgewählt" : "Dateien ausgewählt"} · PDF, Word oder Bild · maximal 25 MB pro Datei` : "PDF, Word oder Bild · maximal 25 MB pro Datei"}</span><input id="sponsor-upload-files" type="file" accept={accept} multiple disabled={uploading} onChange={(event) => { const selected = Array.from(event.currentTarget.files ?? []); setFiles((current) => [...current, ...selected]); event.currentTarget.value = ""; }}/></label>
        {files.length > 0 && <ul className="sponsor-upload-selected-files">{files.map((file, index) => <li key={`${file.name}-${file.size}-${file.lastModified}-${index}`}>{file.name}<span>{(file.size / (1024 * 1024)).toLocaleString("de-DE", { maximumFractionDigits: 1 })} MB</span></li>)}</ul>}
        {error && <p className="field-message error" role="alert">{error}</p>}
        {message && <p className="field-message success" role="status">{message}</p>}
        <button className="btn btn-primary" type="submit" disabled={!files.length || uploading}>{uploading ? "Dateien werden übermittelt …" : "Dateien übermitteln"}</button>
      </form>
      <small>Die Dateien werden nur mit dem Veranstalter dieses Events geteilt.</small>
    </> : null}
  </section>;
}
