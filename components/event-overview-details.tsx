"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui";
import { updateStoredEventDetails } from "@/lib/events-storage";

type EventDetails = { title: string; startDate: string; endDate: string; location: string; responsible: string };

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

  useEffect(() => {
    setDetails(initialDetails);
    setDraft(initialDetails);
    setReady(true);
  }, [eventId, initialDetails.title, initialDetails.startDate, initialDetails.endDate, initialDetails.location, initialDetails.responsible]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const title = draft.title.trim();
      const savedDraft = { ...draft, title, location: draft.location.trim(), responsible: draft.responsible.trim() };
      const { error } = await updateStoredEventDetails(eventId, savedDraft);
      if (error) throw error;
      setDetails(savedDraft);
      setDraft(savedDraft);
      onDetailsSaved(savedDraft);
      setEditing(false);
      setMessage("Event-Details gespeichert.");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "";
      setMessage(errorMessage ? `Die Änderungen konnten nicht gespeichert werden: ${errorMessage}` : "Die Änderungen konnten nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  }

  return <>
    <section className="panel event-overview-details">
      <div className="event-details-heading"><div><div className="eyebrow">VERANSTALTUNG</div><h2>Event-Details</h2><p>Zeitraum, Veranstaltungsort und verantwortliche Person.</p></div><button className="btn btn-primary" type="button" onClick={() => { setDraft(details); setEditing(true); }}><Icon name="settings" size={15}/> Details bearbeiten</button></div>
      <div className="event-details-grid"><div><span>Zeitraum</span><b>{formatDate(details.startDate)} – {formatDate(details.endDate)}</b></div><div><span>Veranstaltungsort</span><b>{details.location || "Noch nicht hinterlegt"}</b></div><div><span>Verantwortlich</span><b>{details.responsible || "Noch nicht hinterlegt"}</b></div></div>
      {message && <p className="event-details-message" role="status">{message}</p>}
    </section>
    {editing && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setEditing(false); }}><section className="create-modal" role="dialog" aria-modal="true" aria-labelledby="event-details-title"><div className="create-modal-head"><div><h2 id="event-details-title">Event-Stammdaten bearbeiten</h2><p>Eventname und Veranstaltungsdetails aktualisieren.</p></div><button className="icon-button" type="button" aria-label="Dialog schließen" disabled={saving} onClick={() => setEditing(false)}><Icon name="close" size={16}/></button></div><form onSubmit={save}><div className="settings-grid"><label className="settings-field settings-field-full"><span>Event-Name *</span><input autoFocus required maxLength={100} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label><label className="settings-field"><span>Beginn</span><input type="date" value={draft.startDate} onChange={(event) => setDraft({ ...draft, startDate: event.target.value })} required /></label><label className="settings-field"><span>Ende</span><input type="date" value={draft.endDate} onChange={(event) => setDraft({ ...draft, endDate: event.target.value })} required /></label><label className="settings-field settings-field-full"><span>Veranstaltungsort</span><input value={draft.location} onChange={(event) => setDraft({ ...draft, location: event.target.value })} required /></label><label className="settings-field settings-field-full"><span>Verantwortlich</span><input value={draft.responsible} onChange={(event) => setDraft({ ...draft, responsible: event.target.value })} required /></label></div>{message && <p className="field-message error" role="alert" style={{ marginTop: 12 }}>{message}</p>}<div className="create-modal-actions"><button className="btn" type="button" disabled={saving} onClick={() => setEditing(false)}>Abbrechen</button><button className="btn btn-primary" type="submit" disabled={!ready || saving}>{saving ? "Wird gespeichert …" : "Speichern"}</button></div></form></section></div>}
  </>;
}
