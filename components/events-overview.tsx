"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { createStoredEventInDatabase, deleteStoredEventFromDatabase, fetchStoredEventsFromDatabase, formatEventDateRange, type StoredEvent } from "@/lib/events-storage";
import { EmptyState, Icon } from "@/components/ui";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/client";
import { eventPlanLabel } from "@/lib/event-plan-labels";
import { eventLifecycleStage, useEventMetrics } from "@/lib/event-metrics";
import { useEventEntitlements } from "@/components/event-entitlements";

type EventDraft = Omit<StoredEvent, "id" | "createdAt" | "planCode" | "bookedPlanCode" | "entitlementStatus" | "hasPaidEventLicense" | "organizerLogoPath" | "organizerLogoUrl">;
const emptyDraft: EventDraft = { title: "", startDate: "", endDate: "", location: "", responsible: "" };

export function EventsOverview() {
  const { requestUpgrade } = useEventEntitlements();
  const [createdEvents, setCreatedEvents] = useState<StoredEvent[]>([]);
  const [ready, setReady] = useState(false);
  const [creating, setCreating] = useState(false);
  const [eventToDelete, setEventToDelete] = useState<{ id: string; title: string; hasPaidEventLicense: boolean } | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [showCompletedEvents, setShowCompletedEvents] = useState(true);
  const [completedEventsPreferenceReady, setCompletedEventsPreferenceReady] = useState(false);
  const [savingCompletedEventsPreference, setSavingCompletedEventsPreference] = useState(false);
  const [completedEventsPreferenceMessage, setCompletedEventsPreferenceMessage] = useState("");
  const [draft, setDraft] = useState<EventDraft>(emptyDraft);
  const [message, setMessage] = useState("");
  const [formError, setFormError] = useState("");
  const [freeLimitHit, setFreeLimitHit] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadEvents() {
      try {
        if (isSupabaseConfigured) {
          const { data, error } = await fetchStoredEventsFromDatabase();
          if (error || !data) {
            setMessage("Events konnten nicht aus Supabase geladen werden. Bitte prüfe, ob die Datenbankmigration ausgeführt wurde.");
          } else {
            setCreatedEvents(data);
          }
        } else setMessage("Supabase ist nicht eingerichtet. Events können derzeit nicht gespeichert werden.");
      } catch {
        setMessage("Gespeicherte Events konnten nicht vollständig geladen werden.");
      } finally {
        setReady(true);
      }
    }
    void loadEvents();
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setCompletedEventsPreferenceReady(true);
      return;
    }
    let cancelled = false;
    void createClient().auth.getUser().then(({ data, error }) => {
      if (cancelled) return;
      if (error || !data.user) {
        setCompletedEventsPreferenceMessage("Deine Anzeigeauswahl konnte nicht geladen werden.");
      } else {
        const savedPreference = data.user.user_metadata?.show_completed_events;
        if (typeof savedPreference === "boolean") setShowCompletedEvents(savedPreference);
      }
      setCompletedEventsPreferenceReady(true);
    }).catch(() => {
      if (cancelled) return;
      setCompletedEventsPreferenceMessage("Deine Anzeigeauswahl konnte nicht geladen werden.");
      setCompletedEventsPreferenceReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  async function updateCompletedEventsPreference(showCompleted: boolean) {
    const previous = showCompletedEvents;
    setShowCompletedEvents(showCompleted);
    setCompletedEventsPreferenceMessage("");
    if (!isSupabaseConfigured) return;
    setSavingCompletedEventsPreference(true);
    try {
      const supabase = createClient();
      const { data, error: userError } = await supabase.auth.getUser();
      if (userError || !data.user) throw userError ?? new Error("Nutzerkonto nicht gefunden.");
      const { error } = await supabase.auth.updateUser({
        data: { ...data.user.user_metadata, show_completed_events: showCompleted },
      });
      if (error) throw error;
    } catch {
      setShowCompletedEvents(previous);
      setCompletedEventsPreferenceMessage("Die Auswahl konnte nicht gespeichert werden. Bitte versuche es erneut.");
    } finally {
      setSavingCompletedEventsPreference(false);
    }
  }

  const visibleEvents = createdEvents.sort((a, b) => (a.startDate || "").localeCompare(b.startDate || ""));
  const eventMetrics = useEventMetrics(visibleEvents.map((event) => event.id));
  const activeEvents = visibleEvents.map((event) => {
    const metrics = eventMetrics.byEvent[event.id];
    const values = metrics ?? { sponsorship: 0, sponsors: 0, benefits: 0, completed: 0, contracts: 0, contractsCreated: 0, contractsSigned: 0, reportsCreated: 0, reportsSent: 0, evidenceTasks: 0, completedEvidenceTasks: 0 };
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
    setFreeLimitHit(false);
    try {
      let event: StoredEvent;
      if (isSupabaseConfigured) {
        const { data, error } = await createStoredEventInDatabase(eventDetails);
        if (error || !data) {
          const code = error && "code" in error ? error.code : undefined;
          const errorMessage = error && "message" in error ? error.message : "";
          if (errorMessage.includes("FREE_EVENT_LIMIT_REACHED")) {
            setFreeLimitHit(true);
            setFormError("Dein Free-Tarif enthält ein Event. Schalte dein bestehendes Event frei, bevor du ein weiteres erstellst.");
          } else if (code === "42P01" || code === "PGRST205") {
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
      } else throw new Error("Supabase ist nicht eingerichtet.");
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
      if (isCreatedEvent) {
        const updated = createdEvents.filter((event) => event.id !== eventToDelete.id);
        if (isSupabaseConfigured) {
          const { error } = await deleteStoredEventFromDatabase(eventToDelete.id);
          if (error) {
            setMessage("Das Event konnte nicht aus Supabase gelöscht werden.");
            return;
          }
        } else throw new Error("Supabase ist nicht eingerichtet.");
        setCreatedEvents(updated);
      } else {
        throw new Error("Das Event ist nicht in Supabase gespeichert und kann deshalb nicht gelöscht werden.");
      }
      setEventToDelete(null);
      setDeleteConfirmation("");
      setMessage("");
    } catch {
      setMessage("Das Event konnte nicht gelöscht werden.");
    }
  }

  return <main className="content">
    <div className="page-heading"><div><div className="eyebrow">VERANSTALTERBEREICH</div><h1>Events</h1><p className="subtitle">Alle Veranstaltungen und ihren aktuellen Fortschritt im Überblick.</p></div><button className="btn btn-primary" type="button" onClick={() => { setMessage(""); setCreating(true); }}><Icon name="plus" size={16}/> Event erstellen</button></div>
    <section>
      <div className="panel-heading event-overview-list-heading"><div><h2>Events</h2><p>Veranstaltungen und ihr aktueller Sponsoringfortschritt</p></div><div className="event-overview-heading-actions"><label className="event-completed-filter"><input type="checkbox" checked={showCompletedEvents} disabled={!completedEventsPreferenceReady || savingCompletedEventsPreference} onChange={(event) => void updateCompletedEventsPreference(event.target.checked)} /> Abgeschlossene Events anzeigen</label><span className="status status-progress">{displayedEvents.length} {displayedEvents.length === 1 ? "Event" : "Events"}</span></div></div>
      {completedEventsPreferenceMessage && <p className="event-details-message" role="status">{completedEventsPreferenceMessage}</p>}
      <div className="event-overview-list">
        {displayedEvents.map((event) => <article className="event-overview-row" key={event.id}>
          <Link href={`/events/${event.id}`} className="event-overview-row-link">
            <div className="event-overview-identity"><div className="event-overview-title"><h3>{event.title}</h3><span className={`event-plan-badge event-plan-${event.planCode === "enterprise" ? "enterprise" : event.bookedPlanCode}`}>Tarif: {eventPlanLabel(event.planCode === "enterprise" ? "enterprise" : event.bookedPlanCode)}</span></div><div className="event-overview-meta"><span>{event.date}</span><span className="event-location"><Icon name="pin" size={13} />{event.location}</span></div></div>
            <div className="event-overview-metrics"><div><small>Vertragsvolumen netto</small><b>{event.metricsLoading ? "—" : new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(event.sponsorship)}</b></div><div><small>Sponsoren</small><b>{event.metricsLoading ? "—" : event.sponsors}</b></div><div><small>Leistungen</small><b>{event.metricsLoading ? "—" : event.benefits}</b></div><div><small>Erledigt</small><b>{event.metricsLoading ? "—" : `${event.benefits ? Math.round(event.completed / event.benefits * 100) : 0} %`}</b></div></div>
            <span className={`event-lifecycle-status event-lifecycle-${event.stage.color}`}>Event Status: {eventMetrics.loading ? "Status wird geladen …" : eventMetrics.error ? "Status nicht verfügbar" : event.stage.label}</span>
            <div className="event-overview-progress"><div><small>Leistungsfortschritt</small><span>{event.metricsLoading ? "Wird geladen …" : `${event.completed} von ${event.benefits} Leistungen erledigt`}</span></div><div className="event-overview-progress-bar"><div className="progress-track"><div className="progress-fill" style={{ width: `${event.benefits ? Math.round(event.completed / event.benefits * 100) : 0}%` }} /></div><b>{event.metricsLoading ? "—" : `${event.benefits ? Math.round(event.completed / event.benefits * 100) : 0} %`}</b></div></div>
            <Icon name="chevron" size={16} />
          </Link>
          <button className="btn event-delete-button event-overview-delete" type="button" onClick={() => { setDeleteConfirmation(""); setEventToDelete({ id: event.id, title: event.title, hasPaidEventLicense: event.hasPaidEventLicense }); }}><Icon name="close" size={14}/> Event löschen</button>
        </article>)}
      </div>
      {ready && activeEvents.length === 0 && <EmptyState title="Noch keine Events" description="Lege deine erste Veranstaltung an, um Sponsoren und Leistungen zu verwalten." action={<button className="btn btn-primary" type="button" onClick={() => setCreating(true)}><Icon name="plus" size={14}/> Event erstellen</button>} />}
      {ready && activeEvents.length > 0 && displayedEvents.length === 0 && <EmptyState title="Alle Events abgeschlossen" description="Die abgeschlossenen Events sind ausgeblendet." action={<button className="btn" type="button" onClick={() => setShowCompletedEvents(true)}>Abgeschlossene Events anzeigen</button>} />}
      {ready && message && <p className="event-details-message" role="status">{message}</p>}
    </section>
    {creating && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setCreating(false); }}><section className="create-modal" role="dialog" aria-modal="true" aria-labelledby="create-event-title"><div className="create-modal-head"><div><h2 id="create-event-title">Event erstellen</h2><p>Trage die Stammdaten der Veranstaltung ein.</p></div><button className="icon-button" type="button" aria-label="Dialog schließen" disabled={saving} onClick={() => setCreating(false)}><Icon name="close" size={16}/></button></div><form onSubmit={createEvent}><div className="settings-grid"><label className="settings-field settings-field-full"><span>Bezeichnung *</span><input autoFocus required maxLength={100} value={draft.title} onChange={(event) => { setDraft({ ...draft, title: event.target.value }); setFormError(""); }} placeholder="z. B. Stadtfest 2027" /></label><label className="settings-field"><span>Beginn *</span><input type="date" required value={draft.startDate} onChange={(event) => { setDraft({ ...draft, startDate: event.target.value, endDate: draft.endDate && draft.endDate < event.target.value ? "" : draft.endDate }); setFormError(""); }} /></label><label className="settings-field"><span>Ende *</span><input type="date" required min={draft.startDate || undefined} value={draft.endDate} onChange={(event) => { setDraft({ ...draft, endDate: event.target.value }); setFormError(""); }} /></label><label className="settings-field settings-field-full"><span>Veranstaltungsort *</span><input required maxLength={160} value={draft.location} onChange={(event) => { setDraft({ ...draft, location: event.target.value }); setFormError(""); }} placeholder="Straße, Ort" /></label><label className="settings-field settings-field-full"><span>Verantwortliche Person *</span><input required maxLength={100} value={draft.responsible} onChange={(event) => { setDraft({ ...draft, responsible: event.target.value }); setFormError(""); }} placeholder="Vor- und Nachname" /></label></div>{formError && <p className="field-message error" role="alert" style={{ marginTop: 14 }}>{formError}</p>}{freeLimitHit && createdEvents[0] && <button className="btn" type="button" onClick={() => { setCreating(false); requestUpgrade(createdEvents[0].id, createdEvents[0].title, "Schalte dein bestehendes Event frei, um einen weiteren Veranstaltungsplatz zu nutzen."); }}>Bestehendes Event freischalten</button>}<div className="create-modal-actions"><button className="btn" type="button" disabled={saving} onClick={() => setCreating(false)}>Abbrechen</button><button className="btn btn-primary" type="submit" disabled={saving}>{saving ? "Wird gespeichert …" : "Event speichern"}</button></div></form></section></div>}
    {eventToDelete && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) { setEventToDelete(null); setDeleteConfirmation(""); } }}><section className="create-modal delete-event-modal" role="dialog" aria-modal="true" aria-labelledby="delete-event-title"><div className="create-modal-head"><div><h2 id="delete-event-title">Event endgültig löschen?</h2><p>Du löschst „{eventToDelete.title}“ und alle zugehörigen Daten im Veranstalterbereich.</p></div><button className="icon-button" type="button" aria-label="Dialog schließen" onClick={() => { setEventToDelete(null); setDeleteConfirmation(""); }}><Icon name="close" size={16}/></button></div><div className="delete-event-consequences"><strong>Das wird entfernt</strong><ul><li>Sponsorenzuordnungen und Verträge</li><li>Leistungen, Aufgaben und Nachweiseinträge</li><li>Reports und der Eventfortschritt</li></ul><p>Hochgeladene Fotos und Vertragsdateien bleiben zunächst im Dateispeicher, sind nach dem Löschen aber nicht mehr über dieses Event erreichbar.</p></div>{eventToDelete.hasPaidEventLicense && <div className="delete-event-license-warning" role="alert"><strong>Die Event-Lizenz geht verloren</strong><p>Die kostenpflichtige Freischaltung wird mit dem Event gelöscht und kann nicht auf ein anderes Event übertragen werden.</p></div>}<label className="settings-field"><span>Gib <b>löschen</b> ein, um fortzufahren</span><input autoFocus value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} placeholder="löschen" /></label><div className="create-modal-actions"><button className="btn" type="button" onClick={() => { setEventToDelete(null); setDeleteConfirmation(""); }}>Abbrechen</button><button className="btn btn-primary delete-event-confirm" type="button" onClick={deleteEvent} disabled={deleteConfirmation.trim() !== "löschen"}>Event endgültig löschen</button></div></section></div>}
  </main>;
}
