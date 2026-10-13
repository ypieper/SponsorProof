"use client";

import { useEffect, useRef, useState, type FormEvent, type ChangeEvent } from "react";
import { EmptyState, Icon, PageHeading, Status } from "@/components/ui";
import { removeLegacyDemoTasks } from "@/lib/remove-legacy-demo-tasks";
import { fetchSponsorRecords } from "@/lib/sponsors-storage";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { fetchStoredEventsFromDatabase, readStoredEvents } from "@/lib/events-storage";

type Task = { id: string; title: string; sponsor: string; sponsorId: string; due: string; dueAt?: string; status: "Offen" | "Erledigt"; eventId: string; eventTitle: string; source: "Leistung" | "Manuell" };
type Evidence = { taskId: string; name: string; type: string; blob: Blob };
type ExtraBenefit = { id: string; title: string; sponsorId: string; eventId: string; status: string; evidence?: string; dueAt?: string };
const manualStorageKey = "sponsorproof.manual-tasks.v1";
const extraBenefitsStorageKey = "sponsorproof.additional-benefits.v1";
const taskStatusOverridesKey = "sponsorproof.task-status-overrides.v1";
const evidenceDatabase = "sponsorproof-evidence";
const evidenceStore = "proofs";
const emptyDraft = { title: "", sponsor: "", due: "", eventId: "" };

function formatDue(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  return new Intl.DateTimeFormat("de-DE").format(new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function openEvidenceDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(evidenceDatabase, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(evidenceStore, { keyPath: "taskId" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readEvidence(): Promise<Evidence[]> {
  const database = await openEvidenceDatabase();
  return new Promise((resolve, reject) => {
    const request = database.transaction(evidenceStore, "readonly").objectStore(evidenceStore).getAll();
    request.onsuccess = () => { resolve(request.result as Evidence[]); database.close(); };
    request.onerror = () => { reject(request.error); database.close(); };
  });
}

async function storeEvidence(record: Evidence): Promise<void> {
  const database = await openEvidenceDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(evidenceStore, "readwrite");
    transaction.objectStore(evidenceStore).put(record);
    transaction.oncomplete = () => { resolve(); database.close(); };
    transaction.onerror = () => { reject(transaction.error); database.close(); };
    transaction.onabort = () => { reject(transaction.error); database.close(); };
  });
}

async function deleteStoredEvidence(taskId: string): Promise<void> {
  const database = await openEvidenceDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(evidenceStore, "readwrite");
    transaction.objectStore(evidenceStore).delete(taskId);
    transaction.oncomplete = () => { resolve(); database.close(); };
    transaction.onerror = () => { reject(transaction.error); database.close(); };
    transaction.onabort = () => { reject(transaction.error); database.close(); };
  });
}

function contractTasks(extraBenefits: ExtraBenefit[] = [], sponsorNames: Record<string, string> = {}, eventNames: Record<string, string> = {}): Task[] {
  return extraBenefits.map((benefit) => {
    const id = `benefit-${benefit.id}`;
    const status = benefit.evidence && benefit.evidence !== "Noch kein Nachweis" ? "Erledigt" : "Offen";
    return { id, title: benefit.title, sponsor: sponsorNames[benefit.sponsorId] ?? (benefit.sponsorId ? "Sponsor" : "—"), sponsorId: benefit.sponsorId, due: benefit.dueAt ? formatDue(benefit.dueAt) : "—", dueAt: benefit.dueAt, status, eventId: benefit.eventId, eventTitle: eventNames[benefit.eventId] ?? "Event nicht gefunden", source: "Leistung" };
  });
}

function TaskProofControl({ task, evidence, disabled, onProofAdded, onProofDeleted }: { task: Task; evidence?: Evidence; disabled: boolean; onProofAdded: (task: Task, file: File) => Promise<void>; onProofDeleted: (task: Task) => Promise<void> }) {
  const uploadRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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
    try {
      await onProofAdded(task, file);
    } catch {
      setError("Der Nachweis konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  }

  function downloadEvidence() {
    if (!evidence) return;
    const url = URL.createObjectURL(evidence.blob);
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
    try {
      await onProofDeleted(task);
    } catch {
      setError("Der Nachweis konnte nicht gelöscht werden.");
    } finally {
      setSaving(false);
    }
  }

  return <div className={`task-proof-control ${evidence ? "has-evidence" : ""}`}>
    <input ref={uploadRef} type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" hidden onChange={handleFile} />
    <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={handleFile} />
    {evidence && <span className="task-proof-file" title={evidence.name}><Icon name="check" size={13}/>{evidence.name}</span>}
    <div className={`task-proof-actions ${evidence ? "compact" : ""}`}>
      <button className={`btn task-proof-upload ${evidence ? "task-proof-icon-button" : ""}`} type="button" onClick={() => uploadRef.current?.click()} disabled={disabled || saving} aria-label={evidence ? "Nachweis ersetzen" : undefined} title={evidence ? "Nachweis ersetzen" : undefined}><Icon name="file" size={14}/>{!evidence && "Datei hochladen"}</button>
      <button className={`btn task-proof-camera ${evidence ? "task-proof-icon-button" : ""}`} type="button" onClick={() => cameraRef.current?.click()} disabled={disabled || saving} aria-label={evidence ? "Foto aufnehmen" : undefined} title={evidence ? "Foto aufnehmen" : undefined}><Icon name="camera" size={14}/>{!evidence && "Kamera"}</button>
      {evidence && <><button className="btn task-proof-icon-button" type="button" onClick={downloadEvidence} disabled={saving} aria-label="Nachweis herunterladen" title="Herunterladen"><Icon name="download" size={14}/></button><button className="btn task-proof-delete task-proof-icon-button" type="button" onClick={() => { void removeEvidence(); }} disabled={disabled || saving} aria-label="Nachweis löschen" title="Löschen"><Icon name="trash" size={14}/></button></>}
    </div>
    {error && <span className="task-proof-error" role="alert">{error}</span>}
    {saving && <span className="task-proof-error" role="status">Nachweis wird gespeichert …</span>}
  </div>;
}

export function TasksOverview({ sponsorFilter, sponsorName, eventFilter = "all", embedded = false, mobileMode = false }: { sponsorFilter?: string; sponsorName?: string; eventFilter?: string; embedded?: boolean; mobileMode?: boolean } = {}) {
  const [items, setItems] = useState<Task[]>([]);
  const [sponsorNames, setSponsorNames] = useState<Record<string, string>>({});
  const [eventNames, setEventNames] = useState<Record<string, string>>({});
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
        removeLegacyDemoTasks();
        const savedManual = JSON.parse(localStorage.getItem(manualStorageKey) ?? "[]") as Task[];
        const extraBenefits = JSON.parse(localStorage.getItem(extraBenefitsStorageKey) ?? "[]") as ExtraBenefit[];
        const statusOverrides = JSON.parse(localStorage.getItem(taskStatusOverridesKey) ?? "{}") as Partial<Record<string, Task["status"]>>;
        const [evidence, sponsorResult, eventResult] = await Promise.all([
          readEvidence(),
          isSupabaseConfigured ? fetchSponsorRecords().catch(() => null) : Promise.resolve(null),
          isSupabaseConfigured ? fetchStoredEventsFromDatabase().catch(() => null) : Promise.resolve(null),
        ]);
        const sponsorNameMap = Object.fromEntries((sponsorResult?.data ?? []).map(({ sponsor }) => [sponsor.id, sponsor.name]));
        const eventNameMap = Object.fromEntries((eventResult?.data ?? readStoredEvents()).map((event) => [event.id, event.title]));
        setSponsorNames(sponsorNameMap);
        setEventNames(eventNameMap);
        const evidenceMap = Object.fromEntries(evidence.map((entry) => [entry.taskId, entry]));
        setEvidenceByTask(evidenceMap);
        setItems([...contractTasks(extraBenefits, sponsorNameMap, eventNameMap).map((task) => ({ ...task, status: (evidenceMap[task.id] ? "Erledigt" : statusOverrides[task.id] ?? task.status) as Task["status"] })), ...savedManual.map((task) => {
          const sponsorId = task.sponsorId ?? "";
          const eventId = task.eventId ?? eventFilter;
          return { ...task, sponsorId, sponsor: sponsorNameMap[sponsorId] ?? (task.sponsor === sponsorId ? "Sponsor" : task.sponsor), status: (evidenceMap[task.id] ? "Erledigt" : "Offen") as Task["status"], eventId, eventTitle: eventNameMap[eventId] ?? (eventId === "all" ? "Keinem Event zugeordnet" : task.eventTitle && task.eventTitle !== "Event" ? task.eventTitle : "Event nicht gefunden") };
        })]);
      } catch {
        setMessage("Gespeicherte Aufgaben konnten nicht geladen werden.");
      } finally {
        setReady(true);
      }
    }
    void loadTasks();
  }, []);

  async function addProof(task: Task, file: File) {
    const proof = { taskId: task.id, name: file.name, type: file.type, blob: file };
    await storeEvidence(proof);
    window.dispatchEvent(new Event("sponso:event-timeline-updated"));
    setEvidenceByTask((current) => ({ ...current, [task.id]: proof }));
    const statusOverrides = JSON.parse(localStorage.getItem(taskStatusOverridesKey) ?? "{}") as Partial<Record<string, Task["status"]>>;
    delete statusOverrides[task.id];
    localStorage.setItem(taskStatusOverridesKey, JSON.stringify(statusOverrides));
    if (task.source === "Leistung" && task.id.startsWith("benefit-custom-")) {
      const benefitId = task.id.slice("benefit-".length);
      const storedBenefits = JSON.parse(localStorage.getItem(extraBenefitsStorageKey) ?? "[]") as ExtraBenefit[];
      localStorage.setItem(extraBenefitsStorageKey, JSON.stringify(storedBenefits.map((benefit) => benefit.id === benefitId ? { ...benefit, status: "Erledigt", evidence: file.name } : benefit)));
    }
    setItems((current) => {
      const updated = current.map((item) => item.id === task.id ? { ...item, status: "Erledigt" as Task["status"] } : item);
      if (task.source === "Manuell") localStorage.setItem(manualStorageKey, JSON.stringify(updated.filter((item) => item.source === "Manuell")));
      return updated;
    });
    setMessage(`Nachweis für „${task.title}“ gespeichert. Aufgabe abgeschlossen.`);
  }

  async function deleteProof(task: Task) {
    await deleteStoredEvidence(task.id);
    window.dispatchEvent(new Event("sponso:event-timeline-updated"));
    const statusOverrides = JSON.parse(localStorage.getItem(taskStatusOverridesKey) ?? "{}") as Partial<Record<string, Task["status"]>>;
    statusOverrides[task.id] = "Offen";
    localStorage.setItem(taskStatusOverridesKey, JSON.stringify(statusOverrides));
    if (task.source === "Leistung" && task.id.startsWith("benefit-custom-")) {
      const benefitId = task.id.slice("benefit-".length);
      const storedBenefits = JSON.parse(localStorage.getItem(extraBenefitsStorageKey) ?? "[]") as ExtraBenefit[];
      localStorage.setItem(extraBenefitsStorageKey, JSON.stringify(storedBenefits.map((benefit) => benefit.id === benefitId ? { ...benefit, status: "Offen", evidence: "Noch kein Nachweis" } : benefit)));
    }
    setEvidenceByTask((current) => {
      const updated = { ...current };
      delete updated[task.id];
      return updated;
    });
    setItems((current) => {
      const updated = current.map((item) => item.id === task.id ? { ...item, status: "Offen" as const } : item);
      if (task.source === "Manuell") localStorage.setItem(manualStorageKey, JSON.stringify(updated.filter((item) => item.source === "Manuell")));
      return updated;
    });
    setMessage(`Nachweis für „${task.title}“ gelöscht. Die Aufgabe ist wieder offen.`);
  }

  function updateTaskDueDate(task: Task, dueAt: string) {
    try {
      if (task.source === "Leistung") {
        const benefitId = task.id.slice("benefit-".length);
        const savedBenefits = JSON.parse(localStorage.getItem(extraBenefitsStorageKey) ?? "[]") as ExtraBenefit[];
        localStorage.setItem(extraBenefitsStorageKey, JSON.stringify(savedBenefits.map((benefit) => benefit.id === benefitId ? { ...benefit, dueAt: dueAt || undefined } : benefit)));
      } else {
        const savedTasks = JSON.parse(localStorage.getItem(manualStorageKey) ?? "[]") as Task[];
        localStorage.setItem(manualStorageKey, JSON.stringify(savedTasks.map((savedTask) => savedTask.id === task.id ? { ...savedTask, due: dueAt || "—", dueAt: dueAt || undefined } : savedTask)));
      }
      setItems((current) => current.map((item) => item.id === task.id ? { ...item, dueAt: dueAt || undefined, due: dueAt ? formatDue(dueAt) : "—" } : item));
      setMessage(dueAt ? "Fälligkeit gespeichert." : "Fälligkeit entfernt.");
    } catch {
      setMessage("Die Fälligkeit konnte nicht gespeichert werden.");
    }
  }

  function deleteManualTask(task: Task) {
    if (task.source !== "Manuell" || !window.confirm(`Möchtest du die manuelle Aufgabe „${task.title}“ wirklich löschen?`)) return;
    try {
      const savedTasks = JSON.parse(localStorage.getItem(manualStorageKey) ?? "[]") as Task[];
      localStorage.setItem(manualStorageKey, JSON.stringify(savedTasks.filter((savedTask) => savedTask.id !== task.id)));
      const statusOverrides = JSON.parse(localStorage.getItem(taskStatusOverridesKey) ?? "{}") as Partial<Record<string, Task["status"]>>;
      delete statusOverrides[task.id];
      localStorage.setItem(taskStatusOverridesKey, JSON.stringify(statusOverrides));
      setItems((current) => current.filter((item) => item.id !== task.id));
      window.dispatchEvent(new Event("sponso:event-timeline-updated"));
      setEvidenceByTask((current) => {
        const updated = { ...current };
        delete updated[task.id];
        return updated;
      });
      setMessage(`Aufgabe „${task.title}“ gelöscht.`);
      void deleteStoredEvidence(task.id).catch(() => setMessage("Die Aufgabe wurde gelöscht, der zugehörige Nachweis konnte aber nicht entfernt werden."));
    } catch {
      setMessage("Die Aufgabe konnte nicht gelöscht werden.");
    }
  }

  function createTask(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    const eventId = draft.eventId || (eventFilter !== "all" ? eventFilter : "");
    const selectedSponsorRecord = items.find((task) => task.sponsorId === selectedSponsor);
    const selectedEventRecord = items.find((task) => task.eventId === eventId);
    const manualTask: Task = { id: `manual-${Date.now()}`, title: draft.title.trim(), sponsor: selectedSponsorRecord?.sponsor || sponsorName || draft.sponsor.trim() || "—", sponsorId: selectedSponsor !== "all" ? selectedSponsor : "", due: draft.due.trim() || "—", dueAt: draft.due.trim() || undefined, status: "Offen", eventId, eventTitle: eventNames[eventId] ?? selectedEventRecord?.eventTitle ?? (eventId ? "Event nicht gefunden" : "Keinem Event zugeordnet"), source: "Manuell" };
    const updated = [...items, manualTask];
    try {
      localStorage.setItem(manualStorageKey, JSON.stringify(updated.filter((task) => task.source === "Manuell")));
      setItems(updated);
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
  const eventOptions = [...new Map([...items.filter((task) => task.eventId && task.eventId !== "all").map((task) => [task.eventId, { id: task.eventId, title: eventNames[task.eventId] ?? task.eventTitle }] as const), ...(eventFilter !== "all" ? [[eventFilter, { id: eventFilter, title: eventNames[eventFilter] ?? "Dieses Event" }] as const] : [])]).values()];
  const selectedSponsorName = sponsorOptions.find((sponsor) => sponsor.id === selectedSponsor)?.name;
  const completionSummary = `${visibleCompleted} von ${filteredItems.length} abgeschlossen`;
  const noTasksYet = !embedded && ready && items.length === 0 && selectedStatus === "all" && selectedEvent === eventFilter;

  return <>
    {!sponsorFilter && !embedded && <PageHeading eyebrow="WORKSPACE" title="Aufgaben" subtitle="Leite Aufgaben aus vereinbarten Leistungen ab und ergänze sie bei Bedarf." action={<button className="btn btn-primary" type="button" onClick={() => { setMessage(""); setShowCreate(true); }}><Icon name="plus" size={16}/> Aufgabe anlegen</button>} />}
    {sponsorFilter && !embedded && <div className="sponsor-task-heading"><div><h2>Aufgaben & Nachweise</h2><p>Nachweise schließen Aufgaben ab.</p></div><button className="btn btn-primary" type="button" onClick={() => { setDraft((current) => ({ ...current, sponsor: sponsorName ?? "" })); setShowCreate(true); }}><Icon name="plus" size={15}/> Aufgabe anlegen</button></div>}
    {noTasksYet ? <EmptyState title="Noch keine Aufgaben" description="Aufgaben erscheinen hier, sobald du Leistungen vereinbart oder Aufgaben ergänzt hast." action={<button className="btn btn-primary" type="button" onClick={() => { setMessage(""); setShowCreate(true); }}><Icon name="plus" size={14}/> Aufgabe anlegen</button>} /> : <section className={`panel table-panel ${embedded ? "event-task-panel" : ""}`}>
      <div className="table-head tasks-table-head"><div>{mobileMode ? <><h2>Aufgaben im Überblick</h2><p className="subtitle" style={{ fontSize: 11, marginTop: 4 }}>{completionSummary}</p></> : embedded ? <><h2>Aufgaben im Überblick</h2><p className="subtitle" style={{ fontSize: 11, marginTop: 4 }}>Verwalte Aufgaben und dokumentiere Nachweise zu vereinbarten Leistungen.</p><p className="subtitle" style={{ fontSize: 10, marginTop: 4 }}>{completionSummary}</p></> : <><h2>{selectedSponsorName ? `${selectedSponsorName} · Aufgaben` : "Alle Aufgaben"}</h2><p className="subtitle" style={{ fontSize: 11, marginTop: 4 }}>{completionSummary}</p></>}</div>{mobileMode ? <label className="mobile-open-tasks-filter"><input type="checkbox" checked={hideCompleted} onChange={(event) => setHideCompleted(event.target.checked)}/>Nur offene</label> : <div className="task-filters"><label className="task-event-filter"><span>Sponsor</span><select value={selectedSponsor} onChange={(event) => setSelectedSponsor(event.target.value)}><option value="all">Alle Sponsoren</option>{sponsorOptions.map((sponsor) => <option key={sponsor.id} value={sponsor.id}>{sponsor.name}</option>)}</select></label>{!embedded && <label className="task-event-filter"><span>Event</span><select value={selectedEvent} onChange={(event) => setSelectedEvent(event.target.value)}><option value="all">Alle Events</option>{eventOptions.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}</select></label>}<label className="task-event-filter"><span>Status</span><select value={selectedStatus} onChange={(event) => setSelectedStatus(event.target.value as "all" | Task["status"])}><option value="all">Alle Status</option><option value="Offen">Offen</option><option value="Erledigt">Erledigt</option></select></label>{embedded && <button className="btn btn-primary" type="button" onClick={() => { setMessage(""); setShowCreate(true); }}><Icon name="plus" size={15}/> Aufgabe anlegen</button>}</div>}</div>
      {mobileMode && visibleItems.length > 0 && <div className="mobile-proof-list">{visibleItems.map((task) => <article className="mobile-task" key={task.id}>
        <div className="mobile-task-top"><div className="mobile-task-heading"><h3>{task.title}</h3><p>{sponsorNames[task.sponsorId] ?? task.sponsor}{task.dueAt || task.due !== "—" ? ` · Fällig ${formatDue(task.dueAt ?? task.due)}` : ""}</p></div><Status value={task.status} /></div>
        <TaskProofControl task={task} evidence={evidenceByTask[task.id]} disabled={!ready} onProofAdded={addProof} onProofDeleted={deleteProof}/>
      </article>)}</div>}
      {!mobileMode && visibleItems.length > 0 && <table className="table tasks-table"><thead><tr><th>AUFGABE</th><th>SPONSOR</th><th>EVENT</th><th>FÄLLIG</th><th>QUELLE</th><th>STATUS</th><th>NACHWEIS</th><th>AKTION</th></tr></thead><tbody>{visibleItems.map((task) => <tr key={task.id} className={task.status === "Erledigt" ? "task-completed-row" : undefined}>
        <td><b style={{ color: "#3d4c5b" }}>{task.title}</b></td><td>{sponsorFilter && task.sponsorId === sponsorFilter ? sponsorName ?? sponsorNames[task.sponsorId] ?? "Sponsor" : sponsorNames[task.sponsorId] ?? (task.sponsor === task.sponsorId ? "Sponsor" : task.sponsor)}</td><td className="task-event-cell"><span className="task-event-name" title={task.eventTitle}>{task.eventTitle}</span></td><td><input className="task-due-input" aria-label={`Fälligkeit für ${task.title}`} type="date" value={task.dueAt ?? (/^\d{4}-\d{2}-\d{2}$/.test(task.due) ? task.due : "")} onChange={(event) => updateTaskDueDate(task, event.target.value)} disabled={!ready} /></td><td><span className={`task-source ${task.source === "Leistung" ? "derived" : "manual"}`}>{task.source === "Leistung" ? "Aus Vertrag" : "Manuell"}</span></td><td><Status value={task.status} /></td><td><TaskProofControl task={task} evidence={evidenceByTask[task.id]} disabled={!ready} onProofAdded={addProof} onProofDeleted={deleteProof}/></td><td>{task.source === "Manuell" && <button className="btn task-delete-button" type="button" onClick={() => deleteManualTask(task)} aria-label={`Aufgabe ${task.title} löschen`} title="Aufgabe löschen"><Icon name="trash" size={14}/></button>}</td>
      </tr>)}</tbody></table>}
      {ready && visibleItems.length === 0 && (items.length === 0 ? <EmptyState className="empty-state-compact" title="Noch keine Aufgaben" description="Aufgaben erscheinen hier, sobald du Leistungen vereinbart oder Aufgaben ergänzt hast." /> : mobileMode && hideCompleted && filteredItems.length > 0 ? <EmptyState className="empty-state-compact" title="Keine offenen Aufgaben" description="Alle Aufgaben für dieses Event haben bereits einen Nachweis." action={<button className="btn" type="button" onClick={() => setHideCompleted(false)}>Erledigte Aufgaben anzeigen</button>} /> : <EmptyState className="empty-state-compact" title="Keine passenden Aufgaben" description="Passe die Filter an, um andere Aufgaben zu sehen." action={<button className="btn" type="button" onClick={() => { setSelectedSponsor("all"); setSelectedEvent(eventFilter); setSelectedStatus("all"); setHideCompleted(false); }}>Filter zurücksetzen</button>} />)}
      {message && <p className="task-feedback" role="status">{message}</p>}
    </section>}
    {showCreate && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowCreate(false); }}><section className="create-modal" role="dialog" aria-modal="true" aria-labelledby="create-task-title"><div className="create-modal-head"><div><h2 id="create-task-title">Aufgabe anlegen</h2><p>Ergänze eine Aufgabe für dieses Event.</p></div><button className="icon-button" type="button" aria-label="Dialog schließen" onClick={() => setShowCreate(false)}><Icon name="close" size={16}/></button></div><form onSubmit={createTask}><div className="settings-grid"><label className="settings-field settings-field-full"><span>Aufgabe *</span><input autoFocus required maxLength={100} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Was muss erledigt werden?" /></label><label className="settings-field"><span>Sponsor</span><input value={draft.sponsor} onChange={(event) => setDraft({ ...draft, sponsor: event.target.value })} placeholder="Optional" /></label><label className="settings-field"><span>Fällig</span><input type="date" lang="de" value={draft.due} onChange={(event) => setDraft({ ...draft, due: event.target.value })} /></label></div><div className="create-modal-actions"><button className="btn" type="button" onClick={() => setShowCreate(false)}>Abbrechen</button><button className="btn btn-primary" type="submit" disabled={!ready}>Aufgabe speichern</button></div></form></section></div>}
  </>;
}
