"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { Icon } from "@/components/ui";
import { updateStoredEventDetails } from "@/lib/events-storage";
import { createClient } from "@/lib/supabase/client";

type EventDetails = { title: string; startDate: string; endDate: string; location: string; responsible: string; organizerLogoPath: string | null; organizerLogoUrl?: string | null };
const maxLogoSize = 5 * 1024 * 1024;

function formatDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : value;
}

export function EventOverviewDetails({ eventId, initialDetails, onDetailsSaved }: { eventId: string; initialDetails: EventDetails; onDetailsSaved: (details: EventDetails) => void }) {
  const [details, setDetails] = useState(initialDetails);
  const [draft, setDraft] = useState(initialDetails);
  const [editing, setEditing] = useState(false);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoFilePreview, setLogoFilePreview] = useState("");
  const [removeLogo, setRemoveLogo] = useState(false);

  useEffect(() => {
    setDetails(initialDetails);
    setDraft(initialDetails);
    setLogoFile(null);
    setRemoveLogo(false);
    setReady(true);
  }, [eventId, initialDetails.title, initialDetails.startDate, initialDetails.endDate, initialDetails.location, initialDetails.responsible, initialDetails.organizerLogoPath, initialDetails.organizerLogoUrl]);

  useEffect(() => {
    if (!logoFile) { setLogoFilePreview(""); return; }
    const previewUrl = URL.createObjectURL(logoFile);
    setLogoFilePreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [logoFile]);

  function chooseLogo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setLogoFile(null);
      setMessage("Bitte wähle ein PNG-, JPG- oder WebP-Bild aus.");
      return;
    }
    if (file.size > maxLogoSize) {
      setLogoFile(null);
      setMessage("Das Logo darf höchstens 5 MB groß sein.");
      return;
    }
    setLogoFile(file);
    setRemoveLogo(false);
    setMessage("");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    let uploadedLogoPath = "";
    try {
      const title = draft.title.trim();
      const supabase = createClient();
      const previousLogoPath = details.organizerLogoPath;
      let organizerLogoPath = removeLogo ? null : draft.organizerLogoPath;
      if (logoFile) {
        const { data: organizationId, error: organizationError } = await supabase.rpc("current_organization_id");
        if (organizationError || typeof organizationId !== "string") throw organizationError ?? new Error("Der Veranstalterbereich konnte nicht ermittelt werden.");
        const extension = logoFile.type === "image/png" ? "png" : logoFile.type === "image/webp" ? "webp" : "jpg";
        uploadedLogoPath = `${organizationId}/events/${eventId}/branding/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage.from("sponsorproof-files").upload(uploadedLogoPath, logoFile, { contentType: logoFile.type, upsert: false });
        if (uploadError) throw uploadError;
        organizerLogoPath = uploadedLogoPath;
      }
      const savedDraft = { ...draft, title, location: draft.location.trim(), responsible: draft.responsible.trim(), organizerLogoPath };
      const { error } = await updateStoredEventDetails(eventId, savedDraft);
      if (error) throw error;
      let organizerLogoUrl: string | null = removeLogo ? null : draft.organizerLogoUrl ?? null;
      if (organizerLogoPath) {
        const { data: signedLogo } = await supabase.storage.from("sponsorproof-files").createSignedUrl(organizerLogoPath, 60 * 60 * 24);
        organizerLogoUrl = signedLogo?.signedUrl ?? null;
      }
      const updatedDetails = { ...savedDraft, organizerLogoUrl };
      setDetails(updatedDetails);
      setDraft(updatedDetails);
      setLogoFile(null);
      setRemoveLogo(false);
      onDetailsSaved(updatedDetails);
      if (previousLogoPath && previousLogoPath !== organizerLogoPath) await supabase.storage.from("sponsorproof-files").remove([previousLogoPath]);
      setEditing(false);
      setMessage("Event-Details gespeichert.");
    } catch (error) {
      if (uploadedLogoPath) await createClient().storage.from("sponsorproof-files").remove([uploadedLogoPath]);
      const errorMessage = error instanceof Error ? error.message : "";
      setMessage(errorMessage ? `Die Änderungen konnten nicht gespeichert werden: ${errorMessage}` : "Die Änderungen konnten nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  }

  return <>
    <section className="panel event-overview-details">
      <div className="event-details-heading"><div><div className="eyebrow">VERANSTALTUNG</div><h2>Event-Details</h2><p>Zeitraum, Veranstaltungsort, verantwortliche Person und Logo.</p></div><button className="btn btn-primary" type="button" onClick={() => { setDraft(details); setLogoFile(null); setRemoveLogo(false); setEditing(true); }}><Icon name="settings" size={15}/> Details bearbeiten</button></div>
      <div className="event-details-grid"><div><span>Zeitraum</span><b>{formatDate(details.startDate)} – {formatDate(details.endDate)}</b></div><div><span>Veranstaltungsort</span><b>{details.location || "Noch nicht hinterlegt"}</b></div><div><span>Verantwortlich</span><b>{details.responsible || "Noch nicht hinterlegt"}</b></div></div>
      {message && <p className="event-details-message" role="status">{message}</p>}
    </section>
    {editing && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setEditing(false); }}><section className="create-modal" role="dialog" aria-modal="true" aria-labelledby="event-details-title"><div className="create-modal-head"><div><h2 id="event-details-title">Event-Stammdaten bearbeiten</h2><p>Eventname und Veranstaltungsdetails aktualisieren.</p></div><button className="icon-button" type="button" aria-label="Dialog schließen" disabled={saving} onClick={() => setEditing(false)}><Icon name="close" size={16}/></button></div><form onSubmit={save}><div className="settings-grid"><label className="settings-field settings-field-full"><span>Event-Name *</span><input autoFocus required maxLength={100} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label><label className="settings-field"><span>Beginn</span><input type="date" value={draft.startDate} onChange={(event) => setDraft({ ...draft, startDate: event.target.value })} required /></label><label className="settings-field"><span>Ende</span><input type="date" value={draft.endDate} onChange={(event) => setDraft({ ...draft, endDate: event.target.value })} required /></label><label className="settings-field settings-field-full"><span>Veranstaltungsort</span><input value={draft.location} onChange={(event) => setDraft({ ...draft, location: event.target.value })} required /></label><label className="settings-field settings-field-full"><span>Verantwortlich</span><input value={draft.responsible} onChange={(event) => setDraft({ ...draft, responsible: event.target.value })} required /></label><div className="settings-field settings-field-full event-logo-editor"><span>Veranstalter-Logo</span><div className="event-logo-editor-body"><div className="event-logo-preview">{!removeLogo && (logoFilePreview || draft.organizerLogoUrl) ? <img src={logoFilePreview || draft.organizerLogoUrl || ""} alt="Vorschau Veranstalter-Logo"/> : <Icon name="file" size={22}/>}</div><div className="event-logo-controls"><label className="btn" htmlFor={`event-logo-${eventId}`}>{logoFile || (!removeLogo && draft.organizerLogoPath) ? "Logo ersetzen" : "Logo auswählen"}<input id={`event-logo-${eventId}`} type="file" accept="image/png,image/jpeg,image/webp" disabled={saving} onChange={chooseLogo}/></label>{(logoFile || (!removeLogo && draft.organizerLogoPath)) && <button className="btn" type="button" disabled={saving} onClick={() => { setLogoFile(null); setRemoveLogo(true); }}>Logo entfernen</button>}<small>Empfohlen: 1200 × 400 Pixel im Querformat. PNG, JPG oder WebP · maximal 5 MB.</small></div></div></div></div>{message && <p className="field-message error" role="alert" style={{ marginTop: 12 }}>{message}</p>}<div className="create-modal-actions"><button className="btn" type="button" disabled={saving} onClick={() => setEditing(false)}>Abbrechen</button><button className="btn btn-primary" type="submit" disabled={!ready || saving}>{saving ? "Wird gespeichert …" : "Speichern"}</button></div></form></section></div>}
  </>;
}
