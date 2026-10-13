"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { createStoredEventInDatabase, deleteStoredEventFromDatabase, fetchStoredEventsFromDatabase, formatEventDateRange, readStoredEvents, storedEventsKey, type StoredEvent } from "@/lib/events-storage";
import { EmptyState, Icon } from "@/components/ui";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { eventLifecycleStage, useEventMetrics } from "@/lib/event-metrics";

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
  const [showCompletedEvents, setShowCompletedEvents] = useState(false);
  const [draft, setDraft] = useState<EventDraft>(emptyDraft);
  const [message, setMessage] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadEvents() {
      try {
        if (isSupabaseConfigured) {
          const { data, error } = await fetchStoredEventsFromDatabase();
          if (error || !data) {
            setCreatedEvents(readStoredEvents());
            setMessage("Events konnten nicht aus Supabase geladen werden. Bitte prüfe, ob die Datenbankmigration ausgeführt wurde.");
          } else {
            setCreatedEvents(data);
          }
        } else {
          setCreatedEvents(readStoredEvents());
        }
        const storedIds: unknown = JSON.parse(localStorage.getItem(deletedEventsKey) ?? "[]");
        if (Array.isArray(storedIds)) setDeletedEventIds(storedIds.filter((id): id is string => typeof id === "string"));
      } catch {
        setCreatedEvents(readStoredEvents());
        setMessage("Gespeicherte Events konnten nicht vollständig geladen werden.");
      } finally {
        setReady(true);
      }
    }
    void loadEvents();
  }, []);

  const visibleEvents = createdEvents.filter((event) => !deletedEventIds.includes(event.id)).sort((a, b) => (a.startDate || "").localeCompare(b.startDate || ""));
  const eventMetrics = useEventMetrics(visibleEvents.map((event) => event.id));
  const activeEvents = visibleEvents.map((event) => {
    const metrics = eventMetrics.byEvent[event.id];
    const values = metrics ?? { sponsorship: 0, sponsors: 0, benefits: 0, completed: 0, contracts: 0, contractsCreated: 0, contractsSigned: 0, reportsCreated: 0, evidenceTasks: 0, completedEvidenceTasks: 0 };
    return { ...event, date: formatEventDateRange(event.startDate, event.endDate), sponsorship: values.sponsorship, sponsors: values.sponsors, completed: values.completed, benefits: values.benefits, metricsLoading: eventMetrics.loading || eventMetrics.error, stage: eventLifecycleStage(values) };
  });
  const displayedEvents = activeEvents.filter((event) => showCompletedEvents || event.stage.label !== "Abgeschlossen");
  async function createEvent(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    if (saving) return;
    const title = draft.title.trim();
    const eventDetails = { ...draft, title, location: draft.location.trim(), responsible: draft.responsible.trim() };
    setSaving(true);
    setFormError("");
    try {
      let event: StoredEvent;
      if (isSupabaseConfigured) {
        const { data, error } = await createStoredEventInDatabase(eventDetails);
        if (error || !data) {
          const code = error && "code" in error ? error.code : undefined;
          if (code === "42P01" || code === "PGRST205") {
            setFormError("Die Events-Tabelle fehlt in Supabase noch. Bitte führe zuerst die Datenbankmigration aus und versuche es danach erneut.");
          } else if (code === "42501") {
            setFormError("Supabase hat das Speichern wegen fehlender Berechtigung abgelehnt. Bitte melde dich erneut an und prüfe die Datenbankmigration.");
          } else {
            const detail = error && "message" in error ? error.message : "Bitte versuche es erneut.";
            setFormError(`Das Event konnte nicht gespeichert werden. ${detail}`);
          }
          return;
        }
        event = data;
      } else {
        event = { ...eventDetails, id: `${eventSlug(title) || "event"}-${Date.now()}`, createdAt: new Date().toISOString() };
        const updated = [...createdEvents, event];
        localStorage.setItem(storedEventsKey, JSON.stringify(updated));
      }
      const updated = [...createdEvents, event];
      setCreatedEvents(updated);
      setDraft(emptyDraft);
      setCreating(false);
      setMessage("");
    } catch {
      setFormError("Das Event konnte nicht gespeichert werden. Bitte prüfe deine Verbindung und versuche es erneut.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteEvent() {
    if (!eventToDelete || deleteConfirmation.trim() !== "löschen") return;
    const isCreatedEvent = createdEvents.some((event) => event.id === eventToDelete.id);
    try {
      const details = JSON.parse(localStorage.getItem("sponsorproof.event-details.v1") ?? "{}") as Record<string, unknown>;
      delete details[eventToDelete.id];
      if (isCreatedEvent) {
        const updated = createdEvents.filter((event) => event.id !== eventToDelete.id);
        if (isSupabaseConfigured) {
          const { error } = await deleteStoredEventFromDatabase(eventToDelete.id);
          if (error) {
            setMessage("Das Event konnte nicht aus Supabase gelöscht werden.");
            return;
          }
        } else {
          localStorage.setItem(storedEventsKey, JSON.stringify(updated));
        }
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
    <div className="page-heading"><div><div className="eyebrow">WORKSPACE</div><h1>Events</h1><p className="subtitle">Alle Veranstaltungen und ihren aktuellen Fortschritt im Überblick.</p></div><button className="btn btn-primary" type="button" onClick={() => { setMessage(""); setCreating(true); }}><Icon name="plus" size={16}/> Event erstellen</button></div>
    <section>
      <div className="panel-heading event-overview-list-heading"><div><h2>Events</h2><p>Veranstaltungen und ihr aktueller Sponsoringfortschritt</p></div><div className="event-overview-heading-actions"><label className="event-completed-filter"><input type="checkbox" checked={showCompletedEvents} onChange={(event) => setShowCompletedEvents(event.target.checked)} /> Abgeschlossene Events anzeigen</label><span className="status status-progress">{displayedEvents.length} {displayedEvents.length === 1 ? "Event" : "Events"}</span></div></div>
      <div className="event-overview-list">
        {displayedEvents.map((event) => <article className="event-overview-row" key={event.id}>
          <Link href={`/events/${event.id}`} className="event-overview-row-link">
            <div className="event-overview-identity"><div className="event-overview-title"><h3>{event.title}</h3></div><div className="event-overview-meta"><span>{event.date}</span><span className="event-location"><Icon name="pin" size={13} />{event.location}</span></div></div>
            <div className="event-overview-metrics"><div><small>Vertragsvolumen netto</small><b>{event.metricsLoading ? "—" : new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(event.sponsorship)}</b></div><div><small>Sponsoren</small><b>{event.metricsLoading ? "—" : event.sponsors}</b></div><div><small>Leistungen</small><b>{event.metricsLoading ? "—" : event.benefits}</b></div><div><small>Erledigt</small><b>{event.metricsLoading ? "—" : `${event.benefits ? Math.round(event.completed / event.benefits * 100) : 0} %`}</b></div></div>
            <span className={`event-lifecycle-status event-lifecycle-${event.stage.color}`}>{eventMetrics.loading ? "Status wird geladen …" : eventMetrics.error ? "Status nicht verfügbar" : event.stage.label}</span>
            <div className="event-overview-progress"><div><small>Leistungsfortschritt</small><span>{event.metricsLoading ? "Wird geladen …" : `${event.completed} von ${event.benefits} Leistungen erledigt`}</span></div><div className="event-overview-progress-bar"><div className="progress-track"><div className="progress-fill" style={{ width: `${event.benefits ? Math.round(event.completed / event.benefits * 100) : 0}%` }} /></div><b>{event.metricsLoading ? "—" : `${event.benefits ? Math.round(event.completed / event.benefits * 100) : 0} %`}</b></div></div>
            <Icon name="chevron" size={16} />
          </Link>
          <button className="btn event-delete-button event-overview-delete" type="button" onClick={() => { setDeleteConfirmation(""); setEventToDelete({ id: event.id, title: event.title }); }}><Icon name="close" size={14}/> Event löschen</button>
        </article>)}
      </div>
      {ready && activeEvents.length === 0 && <EmptyState title="Noch keine Events" description="Lege deine erste Veranstaltung an, um Sponsoren und Leistungen zu verwalten." action={<button className="btn btn-primary" type="button" onClick={() => setCreating(true)}><Icon name="plus" size={14}/> Event erstellen</button>} />}
      {ready && activeEvents.length > 0 && displayedEvents.length === 0 && <EmptyState title="Alle Events abgeschlossen" description="Die abgeschlossenen Events sind ausgeblendet." action={<button className="btn" type="button" onClick={() => setShowCompletedEvents(true)}>Abgeschlossene Events anzeigen</button>} />}
      {ready && message && <p className="event-details-message" role="status">{message}</p>}
    </section>
    {creating && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setCreating(false); }}><section className="create-modal" role="dialog" aria-modal="true" aria-labelledby="create-event-title"><div className="create-modal-head"><div><h2 id="create-event-title">Event erstellen</h2><p>Trage die Stammdaten der Veranstaltung ein.</p></div><button className="icon-button" type="button" aria-label="Dialog schließen" disabled={saving} onClick={() => setCreating(false)}><Icon name="close" size={16}/></button></div><form onSubmit={createEvent}><div className="settings-grid"><label className="settings-field settings-field-full"><span>Bezeichnung *</span><input autoFocus required maxLength={100} value={draft.title} onChange={(event) => { setDraft({ ...draft, title: event.target.value }); setFormError(""); }} placeholder="z. B. Stadtfest 2027" /></label><label className="settings-field"><span>Beginn *</span><input type="date" required value={draft.startDate} onChange={(event) => { setDraft({ ...draft, startDate: event.target.value, endDate: draft.endDate && draft.endDate < event.target.value ? "" : draft.endDate }); setFormError(""); }} /></label><label className="settings-field"><span>Ende *</span><input type="date" required min={draft.startDate || undefined} value={draft.endDate} onChange={(event) => { setDraft({ ...draft, endDate: event.target.value }); setFormError(""); }} /></label><label className="settings-field settings-field-full"><span>Veranstaltungsort *</span><input required maxLength={160} value={draft.location} onChange={(event) => { setDraft({ ...draft, location: event.target.value }); setFormError(""); }} placeholder="Straße, Ort" /></label><label className="settings-field settings-field-full"><span>Verantwortliche Person *</span><input required maxLength={100} value={draft.responsible} onChange={(event) => { setDraft({ ...draft, responsible: event.target.value }); setFormError(""); }} placeholder="Vor- und Nachname" /></label></div>{formError && <p className="field-message error" role="alert" style={{ marginTop: 14 }}>{formError}</p>}<div className="create-modal-actions"><button className="btn" type="button" disabled={saving} onClick={() => setCreating(false)}>Abbrechen</button><button className="btn btn-primary" type="submit" disabled={saving}>{saving ? "Wird gespeichert …" : "Event speichern"}</button></div></form></section></div>}
    {eventToDelete && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) { setEventToDelete(null); setDeleteConfirmation(""); } }}><section className="create-modal delete-event-modal" role="dialog" aria-modal="true" aria-labelledby="delete-event-title"><div className="create-modal-head"><div><h2 id="delete-event-title">Event löschen?</h2><p>„{eventToDelete.title}“ wird gelöscht. Gib zur Bestätigung <b>löschen</b> ein.</p></div><button className="icon-button" type="button" aria-label="Dialog schließen" onClick={() => { setEventToDelete(null); setDeleteConfirmation(""); }}><Icon name="close" size={16}/></button></div><label className="settings-field"><span>Bestätigung</span><input autoFocus value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} placeholder="löschen" /></label><div className="create-modal-actions"><button className="btn" type="button" onClick={() => { setEventToDelete(null); setDeleteConfirmation(""); }}>Abbrechen</button><button className="btn btn-primary delete-event-confirm" type="button" onClick={deleteEvent} disabled={deleteConfirmation.trim() !== "löschen"}>Event löschen</button></div></section></div>}
  </main>;
}
