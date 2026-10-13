"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui";

type EventDetails = { startDate: string; endDate: string; location: string; responsible: string };
const storageKey = "sponsorproof.event-details.v1";

function formatDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : value;
}

export function EventOverviewDetails({ eventId, initialDetails }: { eventId: string; initialDetails: EventDetails }) {
  const [details, setDetails] = useState(initialDetails);
  const [draft, setDraft] = useState(initialDetails);
  const [editing, setEditing] = useState(false);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? "{}") as Record<string, Partial<EventDetails>>;
      const loaded = { ...initialDetails, ...saved[eventId] };
      setDetails(loaded);
      setDraft(loaded);
    } catch {
      setMessage("Gespeicherte Eventdaten konnten nicht geladen werden.");
    } finally {
      setReady(true);
    }
  }, [eventId, initialDetails.startDate, initialDetails.endDate, initialDetails.location, initialDetails.responsible]);

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const records = JSON.parse(localStorage.getItem(storageKey) ?? "{}") as Record<string, EventDetails>;
      localStorage.setItem(storageKey, JSON.stringify({ ...records, [eventId]: draft }));
      setDetails(draft);
      setEditing(false);
      setMessage("Event-Details gespeichert.");
    } catch {
      setMessage("Die Event-Details konnten nicht gespeichert werden.");
    }
  }

  return <>
    <section className="panel event-overview-details">
      <div className="event-details-heading"><div><div className="eyebrow">VERANSTALTUNG</div><h2>Event-Details</h2><p>Zeitraum, Veranstaltungsort und verantwortliche Person.</p></div><button className="btn btn-primary" type="button" onClick={() => { setDraft(details); setEditing(true); }}><Icon name="settings" size={15}/> Details bearbeiten</button></div>
      <div className="event-details-grid"><div><span>Zeitraum</span><b>{formatDate(details.startDate)} – {formatDate(details.endDate)}</b></div><div><span>Veranstaltungsort</span><b>{details.location || "Noch nicht hinterlegt"}</b></div><div><span>Verantwortlich</span><b>{details.responsible || "Noch nicht hinterlegt"}</b></div></div>
      {message && <p className="event-details-message" role="status">{message}</p>}
    </section>
    {editing && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(false); }}><section className="create-modal" role="dialog" aria-modal="true" aria-labelledby="event-details-title"><div className="create-modal-head"><div><h2 id="event-details-title">Event-Details bearbeiten</h2><p>Änderungen werden in diesem Browser gespeichert.</p></div><button className="icon-button" type="button" aria-label="Dialog schließen" onClick={() => setEditing(false)}><Icon name="close" size={16}/></button></div><form onSubmit={save}><div className="settings-grid"><label className="settings-field"><span>Beginn</span><input type="date" value={draft.startDate} onChange={(event) => setDraft({ ...draft, startDate: event.target.value })} required /></label><label className="settings-field"><span>Ende</span><input type="date" value={draft.endDate} onChange={(event) => setDraft({ ...draft, endDate: event.target.value })} required /></label><label className="settings-field settings-field-full"><span>Veranstaltungsort</span><input value={draft.location} onChange={(event) => setDraft({ ...draft, location: event.target.value })} required /></label><label className="settings-field settings-field-full"><span>Verantwortlich</span><input value={draft.responsible} onChange={(event) => setDraft({ ...draft, responsible: event.target.value })} required /></label></div><div className="create-modal-actions"><button className="btn" type="button" onClick={() => setEditing(false)}>Abbrechen</button><button className="btn btn-primary" type="submit" disabled={!ready}>Speichern</button></div></form></section></div>}
  </>;
}
