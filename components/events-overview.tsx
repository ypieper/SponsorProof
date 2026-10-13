"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { events } from "@/lib/demo-data";
import { formatEventDateRange, readStoredEvents, storedEventsKey, type StoredEvent } from "@/lib/events-storage";
import { Icon, Metric, Progress } from "@/components/ui";

type EventDraft = Omit<StoredEvent, "id" | "createdAt">;
const emptyDraft: EventDraft = { title: "", startDate: "", endDate: "", location: "", responsible: "" };
const deletedEventsKey = "sponsorproof.deleted-events.v1";

function eventSlug(title: string) {
  return title.toLocaleLowerCase("de-DE").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function EventsOverview() {
  const [createdEvents, setCreatedEvents] = useState<StoredEvent[]>([]);
  const [ready, setReady] = useState(false);
  const [creating, setCreating] = useState(false);
  const [eventToDelete, setEventToDelete] = useState<{ id: string; title: string } | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deletedEventIds, setDeletedEventIds] = useState<string[]>([]);
  const [draft, setDraft] = useState<EventDraft>(emptyDraft);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setCreatedEvents(readStoredEvents());
    try {
      const storedIds: unknown = JSON.parse(localStorage.getItem(deletedEventsKey) ?? "[]");
      if (Array.isArray(storedIds)) setDeletedEventIds(storedIds.filter((id): id is string => typeof id === "string"));
    } catch {
      setMessage("Gespeicherte Events konnten nicht vollständig geladen werden.");
    }
    setReady(true);
  }, []);

  const activeEvents = [
    ...events.map((event) => ({ ...event, date: event.date, sponsors: event.sponsors, sponsorship: event.sponsorship, completed: event.completed, benefits: event.benefits })),
    ...createdEvents.map((event) => ({ ...event, date: formatEventDateRange(event.startDate, event.endDate), status: "In Vorbereitung", active: true, sponsorship: 0, sponsors: 0, completed: 0, benefits: 0 })),
  ].filter((event) => event.active && !deletedEventIds.includes(event.id));
  const sponsorship = activeEvents.reduce((total, event) => total + event.sponsorship, 0);
  const completed = activeEvents.reduce((total, event) => total + event.completed, 0);
  const benefits = activeEvents.reduce((total, event) => total + event.benefits, 0);
  const progress = benefits ? Math.round((completed / benefits) * 100) : 0;

  function createEvent(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    const title = draft.title.trim();
    const id = `${eventSlug(title) || "event"}-${Date.now()}`;
    const event: StoredEvent = { ...draft, title, id, location: draft.location.trim(), responsible: draft.responsible.trim(), createdAt: new Date().toISOString() };
    try {
      const updated = [...createdEvents, event];
      localStorage.setItem(storedEventsKey, JSON.stringify(updated));
      setCreatedEvents(updated);
      setDraft(emptyDraft);
      setCreating(false);
      setMessage("");
    } catch {
      setMessage("Das Event konnte nicht gespeichert werden.");
    }
  }

  function deleteEvent() {
    if (!eventToDelete || deleteConfirmation.trim() !== "löschen") return;
    const isCreatedEvent = createdEvents.some((event) => event.id === eventToDelete.id);
    try {
      const details = JSON.parse(localStorage.getItem("sponsorproof.event-details.v1") ?? "{}") as Record<string, unknown>;
      delete details[eventToDelete.id];
      if (isCreatedEvent) {
        const updated = createdEvents.filter((event) => event.id !== eventToDelete.id);
        localStorage.setItem(storedEventsKey, JSON.stringify(updated));
        setCreatedEvents(updated);
      } else {
        const updated = [...new Set([...deletedEventIds, eventToDelete.id])];
        localStorage.setItem(deletedEventsKey, JSON.stringify(updated));
        setDeletedEventIds(updated);
      }
      localStorage.setItem("sponsorproof.event-details.v1", JSON.stringify(details));
      setEventToDelete(null);
      setDeleteConfirmation("");
      setMessage("");
    } catch {
      setMessage("Das Event konnte nicht gelöscht werden.");
    }
  }

  return <main className="content">
    <div className="page-heading"><div><div className="eyebrow">WORKSPACE</div><h1>Events</h1><p className="subtitle">Alle aktiven Veranstaltungen im Überblick.</p></div><button className="btn btn-primary" type="button" onClick={() => { setMessage(""); setCreating(true); }}><Icon name="plus" size={16}/> Event erstellen</button></div>
    <section className="metric-grid">
      <Metric label="Aktive Events" value={`${activeEvents.length}`} icon="calendar" />
      <Metric label="Sponsoringvolumen" value={`${sponsorship.toLocaleString("de-DE")} €`} icon="spark" />
      <Metric label="Leistungen erfüllt" value={`${completed} von ${benefits}`} icon="check" />
      <Metric label="Erfüllungsgrad" value={`${progress} %`} icon="layers" />
    </section>
    <section>
      <div className="panel-heading"><div><h2>Aktive Events</h2><p>Veranstaltungen, die gerade vorbereitet oder durchgeführt werden</p></div><span className="status status-progress">{activeEvents.length} {activeEvents.length === 1 ? "Event" : "Events"}</span></div>
      <div className="event-grid">
        {activeEvents.map((event) => <article className="event-card" key={event.id}>
          <Link href={`/events/${event.id}`} className="event-card-main">
            <div className="event-art"><div className="event-art-copy"><span>{event.date} · {event.location.split(",").at(-1)?.trim()}</span><h3>{event.title}</h3></div></div>
            <div className="event-info">
              <div className="event-meta"><span className="event-location"><Icon name="pin" size={13} />{event.location}</span><span className="status status-progress">{event.status}</span></div>
              <div className="event-stats">
                <div className="event-stat"><small>Sponsoringvolumen</small><b>{event.sponsorship.toLocaleString("de-DE")} €</b></div>
                <div className="event-stat"><small>Sponsoren</small><b>{event.sponsors}</b></div>
                <div className="event-stat"><small>Leistungen erfüllt</small><b>{event.completed} von {event.benefits}</b></div>
              </div>
              <div className="event-progress"><span>Fortschritt</span><Progress value={event.benefits ? Math.round((event.completed / event.benefits) * 100) : 0} /></div>
            </div>
          </Link>
          <div className="event-card-actions"><button className="btn event-delete-button" type="button" onClick={() => { setDeleteConfirmation(""); setEventToDelete({ id: event.id, title: event.title }); }}><Icon name="close" size={14}/> Event löschen</button></div>
        </article>)}
      </div>
      {activeEvents.length === 0 && <div className="panel"><p className="subtitle" style={{ margin: 0 }}>Aktuell gibt es keine aktiven Events.</p></div>}
      {ready && message && <p className="event-details-message" role="status">{message}</p>}
    </section>
    {creating && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setCreating(false); }}><section className="create-modal" role="dialog" aria-modal="true" aria-labelledby="create-event-title"><div className="create-modal-head"><div><h2 id="create-event-title">Event erstellen</h2><p>Trage die Stammdaten der Veranstaltung ein.</p></div><button className="icon-button" type="button" aria-label="Dialog schließen" onClick={() => setCreating(false)}><Icon name="close" size={16}/></button></div><form onSubmit={createEvent}><div className="settings-grid"><label className="settings-field settings-field-full"><span>Bezeichnung *</span><input autoFocus required maxLength={100} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="z. B. Stadtfest 2027" /></label><label className="settings-field"><span>Beginn *</span><input type="date" required value={draft.startDate} onChange={(event) => setDraft({ ...draft, startDate: event.target.value, endDate: draft.endDate && draft.endDate < event.target.value ? "" : draft.endDate })} /></label><label className="settings-field"><span>Ende *</span><input type="date" required min={draft.startDate || undefined} value={draft.endDate} onChange={(event) => setDraft({ ...draft, endDate: event.target.value })} /></label><label className="settings-field settings-field-full"><span>Veranstaltungsort *</span><input required maxLength={160} value={draft.location} onChange={(event) => setDraft({ ...draft, location: event.target.value })} placeholder="Straße, Ort" /></label><label className="settings-field settings-field-full"><span>Verantwortliche Person *</span><input required maxLength={100} value={draft.responsible} onChange={(event) => setDraft({ ...draft, responsible: event.target.value })} placeholder="Vor- und Nachname" /></label></div><div className="create-modal-actions"><button className="btn" type="button" onClick={() => setCreating(false)}>Abbrechen</button><button className="btn btn-primary" type="submit">Event speichern</button></div></form></section></div>}
    {eventToDelete && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) { setEventToDelete(null); setDeleteConfirmation(""); } }}><section className="create-modal delete-event-modal" role="dialog" aria-modal="true" aria-labelledby="delete-event-title"><div className="create-modal-head"><div><h2 id="delete-event-title">Event löschen?</h2><p>„{eventToDelete.title}“ wird gelöscht. Gib zur Bestätigung <b>löschen</b> ein.</p></div><button className="icon-button" type="button" aria-label="Dialog schließen" onClick={() => { setEventToDelete(null); setDeleteConfirmation(""); }}><Icon name="close" size={16}/></button></div><label className="settings-field"><span>Bestätigung</span><input autoFocus value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} placeholder="löschen" /></label><div className="create-modal-actions"><button className="btn" type="button" onClick={() => { setEventToDelete(null); setDeleteConfirmation(""); }}>Abbrechen</button><button className="btn btn-primary delete-event-confirm" type="button" onClick={deleteEvent} disabled={deleteConfirmation.trim() !== "löschen"}>Event löschen</button></div></section></div>}
  </main>;
}
