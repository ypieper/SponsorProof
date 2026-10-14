"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { EmptyState, Icon, PageHeading, Status } from "@/components/ui";
import { fetchSponsorRecords } from "@/lib/sponsors-storage";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { fetchStoredEventsFromDatabase } from "@/lib/events-storage";
import { fetchStoredBenefits, updateStoredBenefit } from "@/lib/benefits-storage";
import { createStoredTask, deleteStoredTask, fetchStoredTasks, updateStoredTask } from "@/lib/tasks-storage";
import { deleteStoredEvidenceRecord, downloadStoredEvidence, fetchStoredEvidence, uploadStoredEvidence, type StoredEvidence } from "@/lib/evidence-storage";
import { useEventEntitlements } from "@/components/event-entitlements";

type Task = { id: string; title: string; sponsor: string; sponsorId: string; due: string; dueAt?: string; status: "Offen" | "Erledigt"; eventId: string; eventTitle: string; source: "Leistung" | "Manuell" };
type Evidence = StoredEvidence;
const emptyDraft = { title: "", sponsor: "", due: "", eventId: "" };
function formatDue(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  return new Intl.DateTimeFormat("de-DE").format(new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function TaskProofControl({ task, evidence, disabled, mobileMode = false, onProofAdded, onProofDeleted }: { task: Task; evidence?: Evidence; disabled: boolean; mobileMode?: boolean; onProofAdded: (task: Task, file: File) => Promise<boolean>; onProofDeleted: (task: Task) => Promise<void> }) {
  const uploadRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [proofSaved, setProofSaved] = useState(false);

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError("Dateien dürfen höchstens 10 MB groß sein.");
      return;
    }
    setSaving(true);
    setError("");
    setProofSaved(false);
    try {
      if (await onProofAdded(task, file)) setProofSaved(true);
    } catch {
      setError("Der Nachweis konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  }

  async function downloadEvidence() {
    if (!evidence) return;
    const { data, error } = await downloadStoredEvidence(evidence);
    if (error || !data) { setError("Der Nachweis konnte nicht geladen werden."); return; }
    const url = URL.createObjectURL(data);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = evidence.name;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function removeEvidence() {
    if (!evidence || !window.confirm(`Möchtest du den Nachweis „${evidence.name}“ wirklich löschen?`)) return;
    setSaving(true);
    setError("");
    setProofSaved(false);
    try {
      await onProofDeleted(task);
    } catch {
      setError("Der Nachweis konnte nicht gelöscht werden.");
    } finally {
      setSaving(false);
    }
  }

  return <div className={`task-proof-control ${evidence ? "has-evidence" : ""} ${mobileMode ? "mobile-proof-control" : ""}`}>
    <input ref={uploadRef} type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" hidden onChange={handleFile} />
    <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={handleFile} />
    {evidence && <span className="task-proof-file" title={evidence.name}><Icon name="check" size={13}/>{evidence.name}</span>}
    <div className={`task-proof-actions ${evidence ? "compact" : ""}`}>
      <button className={`btn task-proof-upload ${evidence ? "task-proof-icon-button" : ""}`} type="button" onClick={() => uploadRef.current?.click()} disabled={disabled || saving || !task.eventId} aria-label={evidence ? "Nachweis ersetzen" : undefined} title={evidence ? "Nachweis ersetzen" : undefined}><Icon name="file" size={14}/>{!evidence && "Datei hochladen"}</button>
      <button className={`btn task-proof-camera ${evidence ? "task-proof-icon-button" : ""}`} type="button" onClick={() => cameraRef.current?.click()} disabled={disabled || saving || !task.eventId} aria-label={evidence ? "Foto aufnehmen" : undefined} title={evidence ? "Foto aufnehmen" : undefined}><Icon name="camera" size={14}/>{!evidence && (mobileMode ? "Foto aufnehmen" : "Kamera")}</button>
      {evidence && <><button className="btn task-proof-icon-button" type="button" onClick={downloadEvidence} disabled={saving} aria-label="Nachweis herunterladen" title="Herunterladen"><Icon name="download" size={14}/></button><button className="btn task-proof-delete task-proof-icon-button" type="button" onClick={() => { void removeEvidence(); }} disabled={disabled || saving} aria-label="Nachweis löschen" title="Löschen"><Icon name="trash" size={14}/></button></>}
    </div>
    {!task.eventId && <span className="task-proof-error">Ordne die Aufgabe zuerst einem Event zu, um einen Nachweis hinzuzufügen.</span>}
    {mobileMode && proofSaved && <span className="task-proof-success" role="status"><Icon name="check" size={14}/> Nachweis gespeichert</span>}
    {error && <span className="task-proof-error" role="alert">{error}</span>}
    {saving && <span className="task-proof-saving" role="status">Nachweis wird gespeichert …</span>}
  </div>;
}

export function TasksOverview({ sponsorFilter, sponsorName, eventFilter = "all", embedded = false, mobileMode = false, allowCreate = false }: { sponsorFilter?: string; sponsorName?: string; eventFilter?: string; embedded?: boolean; mobileMode?: boolean; allowCreate?: boolean } = {}) {
  const { ensureFeature } = useEventEntitlements();
  const [items, setItems] = useState<Task[]>([]);
  const [sponsorNames, setSponsorNames] = useState<Record<string, string>>({});
  const [eventNames, setEventNames] = useState<Record<string, string>>({});
  const [events, setEvents] = useState<Array<{ id: string; title: string }>>([]);
  const [evidenceByTask, setEvidenceByTask] = useState<Record<string, Evidence>>({});
  const [ready, setReady] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState(() => ({ ...emptyDraft, sponsor: sponsorName ?? "", eventId: eventFilter !== "all" ? eventFilter : emptyDraft.eventId }));
  const [message, setMessage] = useState("");
  const [selectedEvent, setSelectedEvent] = useState(eventFilter);
  const [selectedSponsor, setSelectedSponsor] = useState(sponsorFilter ?? "all");
  const [selectedStatus, setSelectedStatus] = useState<"all" | Task["status"]>("all");
  const [hideCompleted, setHideCompleted] = useState(false);

  useEffect(() => setSelectedEvent(eventFilter), [eventFilter]);
  useEffect(() => setSelectedSponsor(sponsorFilter ?? "all"), [sponsorFilter]);

  useEffect(() => {
    async function loadTasks() {
      try {
        if (!isSupabaseConfigured) throw new Error("Supabase ist nicht eingerichtet.");
        const [evidenceResult, sponsorResult, eventResult, benefitResult, taskResult] = await Promise.all([
          fetchStoredEvidence(), fetchSponsorRecords(), fetchStoredEventsFromDatabase(), fetchStoredBenefits(), fetchStoredTasks(),
        ]);
        if (evidenceResult.error || sponsorResult.error || eventResult.error || benefitResult.error || taskResult.error) throw new Error("Supabase-Daten konnten nicht vollständig geladen werden.");
        const sponsorNameMap = Object.fromEntries((sponsorResult.data ?? []).map(({ sponsor }) => [sponsor.id, sponsor.name]));
        const eventNameMap = Object.fromEntries((eventResult.data ?? []).map((event) => [event.id, event.title]));
        setSponsorNames(sponsorNameMap);
        setEventNames(eventNameMap);
        setEvents((eventResult.data ?? []).map((event) => ({ id: event.id, title: event.title })));
        const evidenceMap = Object.fromEntries((evidenceResult.data ?? []).map((entry) => [entry.taskId, entry]));
        setEvidenceByTask(evidenceMap);
        const benefitTasks: Task[] = (benefitResult.data ?? []).map((benefit) => ({ id: `benefit-${benefit.id}`, title: benefit.title, sponsor: sponsorNameMap[benefit.sponsorId ?? ""] ?? "—", sponsorId: benefit.sponsorId ?? "", due: benefit.dueAt ? formatDue(benefit.dueAt) : "—", dueAt: benefit.dueAt, status: (evidenceMap[`benefit-${benefit.id}`] || benefit.status === "Erfüllt" || benefit.status === "Erledigt" ? "Erledigt" : "Offen"), eventId: benefit.eventId, eventTitle: eventNameMap[benefit.eventId] ?? "Event nicht gefunden", source: "Leistung" }));
        const manualTasks: Task[] = (taskResult.data ?? []).filter((task) => task.source === "Manuell").map((task) => ({ id: task.id, title: task.title, sponsor: sponsorNameMap[task.sponsor_id ?? ""] ?? task.sponsor_name ?? "—", sponsorId: task.sponsor_id ?? "", due: task.due_at ? formatDue(task.due_at) : "—", dueAt: task.due_at ?? undefined, status: (evidenceMap[task.id] || task.status === "Erledigt" ? "Erledigt" : "Offen"), eventId: task.event_id ?? "", eventTitle: eventNameMap[task.event_id ?? ""] ?? "Keinem Event zugeordnet", source: "Manuell" }));
        setItems([...benefitTasks, ...manualTasks]);
      } catch {
        setMessage("Gespeicherte Aufgaben konnten nicht geladen werden.");
      } finally {
        setReady(true);
      }
    }
    void loadTasks();
  }, []);

  async function addProof(task: Task, file: File): Promise<boolean> {
    if (!task.eventId) {
      setMessage("Ordne die Aufgabe zuerst einem Event zu, um einen Nachweis hinzuzufügen.");
      return false;
    }
    if (!(await ensureFeature(task.eventId, task.eventTitle, "evidence"))) return false;
    const benefitId = task.source === "Leistung" ? task.id.slice("benefit-".length) : undefined;
    const { data, error } = await uploadStoredEvidence({ file, eventId: task.eventId || undefined, taskId: task.id, benefitId });
    if (error || !data) throw error ?? new Error("Nachweis konnte nicht gespeichert werden.");
    if (task.source === "Leistung") {
      const { error } = await updateStoredBenefit(task.id.slice("benefit-".length), { status: "Erfüllt", evidence: file.name });
      if (error) throw error;
    } else { const { error } = await updateStoredTask(task.id, { status: "Erledigt" }); if (error) throw error; }
    window.dispatchEvent(new Event("sponso:event-timeline-updated"));
    setEvidenceByTask((current) => ({ ...current, [task.id]: data }));
    setItems((current) => current.map((item) => item.id === task.id ? { ...item, status: "Erledigt" as Task["status"] } : item));
    if (!mobileMode) setMessage(`Nachweis für „${task.title}“ gespeichert. Aufgabe abgeschlossen.`);
    return true;
  }

  async function deleteProof(task: Task) {
    const evidence = evidenceByTask[task.id];
    if (evidence) { const { error } = await deleteStoredEvidenceRecord(evidence); if (error) throw error; }
    const benefitId = task.source === "Leistung" ? task.id.slice("benefit-".length) : undefined;
    if (task.source === "Leistung") {
      const { error } = await updateStoredBenefit(task.id.slice("benefit-".length), { status: "Offen", evidence: "Noch kein Nachweis" });
      if (error) throw error;
    } else { const { error } = await updateStoredTask(task.id, { status: "Offen" }); if (error) throw error; }
    window.dispatchEvent(new Event("sponso:event-timeline-updated"));
    setEvidenceByTask((current) => {
      const updated = { ...current };
      delete updated[task.id];
      return updated;
    });
    setItems((current) => current.map((item) => item.id === task.id ? { ...item, status: "Offen" as const } : item));
    setMessage(`Nachweis für „${task.title}“ gelöscht. Die Aufgabe ist wieder offen.`);
  }

  async function updateTaskDueDate(task: Task, dueAt: string) {
    try {
      if (task.source === "Leistung") {
        if (!(await ensureFeature(task.eventId, task.eventTitle, "benefits"))) return;
        const benefitId = task.id.slice("benefit-".length);
        const { error } = await updateStoredBenefit(benefitId, { dueAt: dueAt || null });
        if (error) throw error;
      } else {
        const { error } = await updateStoredTask(task.id, { dueAt: dueAt || null });
        if (error) throw error;
      }
      setItems((current) => current.map((item) => item.id === task.id ? { ...item, dueAt: dueAt || undefined, due: dueAt ? formatDue(dueAt) : "—" } : item));
      setMessage(dueAt ? "Fälligkeit gespeichert." : "Fälligkeit entfernt.");
    } catch {
      setMessage("Die Fälligkeit konnte nicht gespeichert werden.");
    }
  }

  async function updateTaskEvent(task: Task, eventId: string) {
    if (task.source !== "Manuell" || task.eventId === eventId) return;
    if (evidenceByTask[task.id]) {
      setMessage("Lösche zuerst den vorhandenen Nachweis, bevor du die Aufgabe einem anderen Event zuordnest.");
      return;
    }
    try {
      const { error } = await updateStoredTask(task.id, { eventId: eventId || null });
      if (error) throw error;
      const eventTitle = events.find((item) => item.id === eventId)?.title ?? "Keinem Event zugeordnet";
      setItems((current) => current.map((item) => item.id === task.id ? { ...item, eventId, eventTitle, sponsorId: "" } : item));
      window.dispatchEvent(new Event("sponso:event-timeline-updated"));
      setMessage(eventId ? `Aufgabe „${task.title}“ wurde dem Event „${eventTitle}“ zugeordnet.` : `Aufgabe „${task.title}“ ist keinem Event mehr zugeordnet.`);
    } catch {
      setMessage("Das Event der Aufgabe konnte nicht geändert werden.");
    }
  }

  async function deleteManualTask(task: Task) {
    if (task.source !== "Manuell" || !window.confirm(`Möchtest du die manuelle Aufgabe „${task.title}“ wirklich löschen?`)) return;
    try {
      const proof = evidenceByTask[task.id];
      if (proof) { const { error } = await deleteStoredEvidenceRecord(proof); if (error) throw error; }
      const { error } = await deleteStoredTask(task.id);
      if (error) throw error;
      setItems((current) => current.filter((item) => item.id !== task.id));
      window.dispatchEvent(new Event("sponso:event-timeline-updated"));
      setEvidenceByTask((current) => {
        const updated = { ...current };
        delete updated[task.id];
        return updated;
      });
      setMessage(`Aufgabe „${task.title}“ gelöscht.`);
    } catch {
      setMessage("Die Aufgabe konnte nicht gelöscht werden.");
    }
  }

  async function createTask(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    const eventId = draft.eventId || (eventFilter !== "all" ? eventFilter : "");
    const selectedSponsorRecord = items.find((task) => task.sponsorId === selectedSponsor && (!eventId || task.eventId === eventId));
    try {
      const sponsorId = selectedSponsorRecord?.sponsorId ?? "";
      const sponsor = selectedSponsorRecord?.sponsor || sponsorName || draft.sponsor.trim() || "—";
      const { data, error } = await createStoredTask({ title: draft.title.trim(), eventId: eventId && eventId !== "all" ? eventId : undefined, sponsorId, sponsorName: sponsor, dueAt: draft.due.trim() || undefined });
      if (error || !data) throw error ?? new Error("Aufgabe konnte nicht gespeichert werden.");
      const manualTask: Task = { id: data.id, title: data.title, sponsor, sponsorId, due: data.due_at ? formatDue(data.due_at) : "—", dueAt: data.due_at ?? undefined, status: "Offen", eventId: data.event_id ?? "", eventTitle: eventNames[data.event_id ?? ""] ?? "Keinem Event zugeordnet", source: "Manuell" };
      setItems((current) => [...current, manualTask]);
      window.dispatchEvent(new Event("sponso:event-timeline-updated"));
      setDraft(emptyDraft);
      setShowCreate(false);
      setMessage("Aufgabe hinzugefügt.");
    } catch {
      setMessage("Die Aufgabe konnte nicht gespeichert werden.");
    }
  }

  const filteredItems = items.filter((task) => (selectedSponsor === "all" || task.sponsorId === selectedSponsor) && (selectedEvent === "all" || task.eventId === selectedEvent) && (selectedStatus === "all" || task.status === selectedStatus));
  const visibleItems = filteredItems.filter((task) => !hideCompleted || task.status !== "Erledigt");
  const visibleCompleted = filteredItems.filter((task) => task.status === "Erledigt").length;
  const sponsorOptions = [...new Map(items.filter((task) => task.sponsorId).map((task) => [task.sponsorId, { id: task.sponsorId, name: sponsorNames[task.sponsorId] ?? (task.sponsor === task.sponsorId ? "Sponsor" : task.sponsor) }])).values()];
  const eventOptions = events.length ? events : [...new Map([...items.filter((task) => task.eventId && task.eventId !== "all").map((task) => [task.eventId, { id: task.eventId, title: eventNames[task.eventId] ?? task.eventTitle }] as const), ...(eventFilter !== "all" ? [[eventFilter, { id: eventFilter, title: eventNames[eventFilter] ?? "Dieses Event" }] as const] : [])]).values()];
  const selectedSponsorName = sponsorOptions.find((sponsor) => sponsor.id === selectedSponsor)?.name;
  const completionSummary = `${visibleCompleted} von ${filteredItems.length} abgeschlossen`;
  const noTasksYet = !embedded && ready && items.length === 0 && selectedStatus === "all" && selectedEvent === eventFilter;

  return <>
    {!sponsorFilter && !embedded && <PageHeading eyebrow="VERANSTALTERBEREICH" title="Aufgaben" subtitle="Hier siehst du Aufgaben aus vereinbarten Leistungen und dokumentierst ihre Nachweise." />}
    {sponsorFilter && !embedded && <div className="sponsor-task-heading"><div><h2>Aufgaben & Nachweise</h2><p>Nachweise schließen Aufgaben ab.</p></div></div>}
    {noTasksYet ? <EmptyState title="Noch keine Aufgaben" description="Aufgaben erscheinen hier, sobald du Leistungen vereinbart oder im Event Aufgaben ergänzt hast." action={allowCreate ? <button className="btn btn-primary" type="button" onClick={() => { setMessage(""); setShowCreate(true); }}><Icon name="plus" size={14}/> Aufgabe anlegen</button> : undefined} /> : <section className={`panel table-panel ${embedded ? "event-task-panel" : ""}`}>
      <div className="table-head tasks-table-head"><div>{mobileMode ? <><h2>Aufgaben im Überblick</h2><p className="subtitle" style={{ fontSize: 11, marginTop: 4 }}>{completionSummary}</p></> : embedded ? <><h2>Aufgaben im Überblick</h2><p className="subtitle" style={{ fontSize: 11, marginTop: 4 }}>Verwalte Aufgaben und dokumentiere Nachweise zu vereinbarten Leistungen.</p><p className="subtitle" style={{ fontSize: 10, marginTop: 4 }}>{completionSummary}</p></> : <><h2>{selectedSponsorName ? `${selectedSponsorName} · Aufgaben` : "Alle Aufgaben"}</h2><p className="subtitle" style={{ fontSize: 11, marginTop: 4 }}>{completionSummary}</p></>}</div>{mobileMode ? <label className="mobile-open-tasks-filter"><input type="checkbox" checked={hideCompleted} onChange={(event) => setHideCompleted(event.target.checked)}/>Nur offene</label> : <div className="task-filters"><label className="task-event-filter"><span>Sponsor</span><select value={selectedSponsor} onChange={(event) => setSelectedSponsor(event.target.value)}><option value="all">Alle Sponsoren</option>{sponsorOptions.map((sponsor) => <option key={sponsor.id} value={sponsor.id}>{sponsor.name}</option>)}</select></label>{!embedded && <label className="task-event-filter"><span>Event</span><select value={selectedEvent} onChange={(event) => setSelectedEvent(event.target.value)}><option value="all">Alle Events</option>{eventOptions.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}</select></label>}<label className="task-event-filter"><span>Status</span><select value={selectedStatus} onChange={(event) => setSelectedStatus(event.target.value as "all" | Task["status"])}><option value="all">Alle Status</option><option value="Offen">Offen</option><option value="Erledigt">Erledigt</option></select></label>{allowCreate && <button className="btn btn-primary" type="button" onClick={() => { setMessage(""); setShowCreate(true); }}><Icon name="plus" size={15}/> Aufgabe anlegen</button>}</div>}</div>
      {mobileMode && visibleItems.length > 0 && <div className="mobile-proof-list">{visibleItems.map((task) => <article className="mobile-task" key={task.id}>
        <div className="mobile-task-top"><div className="mobile-task-heading"><h3>{task.title}</h3><p>{sponsorNames[task.sponsorId] ?? task.sponsor}{task.dueAt || task.due !== "—" ? ` · Fällig ${formatDue(task.dueAt ?? task.due)}` : ""}</p></div><Status value={task.status} /></div>
        <TaskProofControl task={task} evidence={evidenceByTask[task.id]} disabled={!ready} mobileMode={mobileMode} onProofAdded={addProof} onProofDeleted={deleteProof}/>
      </article>)}</div>}
      {!mobileMode && visibleItems.length > 0 && <table className="table tasks-table"><thead><tr><th>AUFGABE</th><th>SPONSOR</th><th>EVENT</th><th>FÄLLIG</th><th>QUELLE</th><th>STATUS</th><th>NACHWEIS</th><th>AKTION</th></tr></thead><tbody>{visibleItems.map((task) => <tr key={task.id} className={task.status === "Erledigt" ? "task-completed-row" : undefined}>
        <td><b style={{ color: "#3d4c5b" }}>{task.title}</b></td><td>{sponsorFilter && task.sponsorId === sponsorFilter ? sponsorName ?? sponsorNames[task.sponsorId] ?? "Sponsor" : sponsorNames[task.sponsorId] ?? (task.sponsor === task.sponsorId ? "Sponsor" : task.sponsor)}</td><td className="task-event-cell">{task.source === "Manuell" ? <select className="task-event-name task-event-select" aria-label={`Event für ${task.title}`} value={task.eventId} onChange={(event) => { void updateTaskEvent(task, event.target.value); }} disabled={!ready}><option value="">Keinem Event zugeordnet</option>{events.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}</select> : <span className="task-event-name" title={task.eventTitle}>{task.eventTitle}</span>}</td><td><input className="task-due-input" aria-label={`Fälligkeit für ${task.title}`} type="date" value={task.dueAt ?? (/^\d{4}-\d{2}-\d{2}$/.test(task.due) ? task.due : "")} onChange={(event) => updateTaskDueDate(task, event.target.value)} disabled={!ready} /></td><td><span className={`task-source ${task.source === "Leistung" ? "derived" : "manual"}`}>{task.source === "Leistung" ? "Aus Vertrag" : "Manuell"}</span></td><td><Status value={task.status} /></td><td><TaskProofControl task={task} evidence={evidenceByTask[task.id]} disabled={!ready} onProofAdded={addProof} onProofDeleted={deleteProof}/></td><td>{task.source === "Manuell" && <button className="btn task-delete-button" type="button" onClick={() => deleteManualTask(task)} aria-label={`Aufgabe ${task.title} löschen`} title="Aufgabe löschen"><Icon name="trash" size={14}/></button>}</td>
      </tr>)}</tbody></table>}
      {ready && visibleItems.length === 0 && (items.length === 0 ? <EmptyState className="empty-state-compact" title="Noch keine Aufgaben" description="Aufgaben erscheinen hier, sobald du Leistungen vereinbart oder Aufgaben ergänzt hast." /> : mobileMode && hideCompleted && filteredItems.length > 0 ? <EmptyState className="empty-state-compact" title="Keine offenen Aufgaben" description="Alle Aufgaben für dieses Event haben bereits einen Nachweis." action={<button className="btn" type="button" onClick={() => setHideCompleted(false)}>Erledigte Aufgaben anzeigen</button>} /> : <EmptyState className="empty-state-compact" title="Keine passenden Aufgaben" description="Passe die Filter an, um andere Aufgaben zu sehen." action={<button className="btn" type="button" onClick={() => { setSelectedSponsor("all"); setSelectedEvent(eventFilter); setSelectedStatus("all"); setHideCompleted(false); }}>Filter zurücksetzen</button>} />)}
      {message && <p className="task-feedback" role="status">{message}</p>}
    </section>}
    {allowCreate && showCreate && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowCreate(false); }}><section className="create-modal" role="dialog" aria-modal="true" aria-labelledby="create-task-title"><div className="create-modal-head"><div><h2 id="create-task-title">Aufgabe anlegen</h2><p>Ordne die Aufgabe einem Event zu, damit du dort Nachweise hinzufügen kannst.</p></div><button className="icon-button" type="button" aria-label="Dialog schließen" onClick={() => setShowCreate(false)}><Icon name="close" size={16}/></button></div><form onSubmit={createTask}><div className="settings-grid"><label className="settings-field settings-field-full"><span>Aufgabe *</span><input autoFocus required maxLength={100} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Was muss erledigt werden?" /></label><label className="settings-field settings-field-full"><span>Event</span><select value={draft.eventId || (eventFilter !== "all" ? eventFilter : "")} disabled={eventFilter !== "all"} onChange={(event) => setDraft({ ...draft, eventId: event.target.value })}><option value="">Keinem Event zugeordnet</option>{eventOptions.map((option) => <option key={option.id} value={option.id}>{option.title}</option>)}</select></label><label className="settings-field"><span>Sponsor</span><input value={draft.sponsor} onChange={(event) => setDraft({ ...draft, sponsor: event.target.value })} placeholder="Optional" /></label><label className="settings-field"><span>Fällig</span><input type="date" lang="de" value={draft.due} onChange={(event) => setDraft({ ...draft, due: event.target.value })} /></label></div><div className="create-modal-actions"><button className="btn" type="button" onClick={() => setShowCreate(false)}>Abbrechen</button><button className="btn btn-primary" type="submit" disabled={!ready}>Aufgabe speichern</button></div></form></section></div>}
  </>;
}
