"use client";

import { useEffect, useRef, useState, type FormEvent, type ChangeEvent } from "react";
import { benefits, events, sponsors as sponsorRecords, tasks as sampleTasks } from "@/lib/demo-data";
import { Icon, PageHeading, Status } from "@/components/ui";

type Task = { id: string; title: string; sponsor: string; sponsorId: string; due: string; status: "Offen" | "Erledigt"; eventId: string; eventTitle: string; source: "Leistung" | "Manuell" };
type Evidence = { taskId: string; name: string; type: string; blob: Blob };
type ExtraBenefit = { id: string; title: string; sponsorId: string; eventId: string; status: string; evidence?: string };
const manualStorageKey = "sponsorproof.manual-tasks.v1";
const extraBenefitsStorageKey = "sponsorproof.additional-benefits.v1";
const taskStatusOverridesKey = "sponsorproof.task-status-overrides.v1";
const evidenceDatabase = "sponsorproof-evidence";
const evidenceStore = "proofs";
const emptyDraft = { title: "", sponsor: "", due: "", eventId: events[0]?.id ?? "" };

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

function contractTasks(extraBenefits: ExtraBenefit[] = []): Task[] {
  return [...benefits, ...extraBenefits].map((benefit) => {
    const event = events.find((item) => item.id === benefit.eventId) ?? events[0];
    const id = "id" in benefit && benefit.id ? `benefit-${benefit.id}` : `benefit-${event?.id ?? "event"}-${benefit.title.toLocaleLowerCase("de-DE").replace(/[^a-z0-9]+/g, "-")}`;
    const related = sampleTasks.find((task) => task.title.toLocaleLowerCase("de-DE").includes(benefit.title.toLocaleLowerCase("de-DE")) || benefit.title.toLocaleLowerCase("de-DE").includes(task.title.toLocaleLowerCase("de-DE").replace(/ am eingang$/, "")));
    const relatedSponsor = sponsorRecords.find((sponsor) => sponsor.id === benefit.sponsorId) ?? sponsorRecords.find((sponsor) => sponsor.name === related?.sponsor) ?? sponsorRecords[0];
    const status = benefit.evidence && benefit.evidence !== "Noch kein Nachweis" ? "Erledigt" : "Offen";
    return { id, title: benefit.title, sponsor: relatedSponsor?.name ?? "—", sponsorId: relatedSponsor?.id ?? "", due: related?.due ?? "—", status, eventId: event?.id ?? "", eventTitle: event?.title ?? "Event", source: "Leistung" };
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

  return <div className="task-proof-control">
    <input ref={uploadRef} type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" hidden onChange={handleFile} />
    <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={handleFile} />
    {evidence && <span className="task-proof-file" title={evidence.name}><Icon name="check" size={13}/>{evidence.name}</span>}
    <div className="task-proof-actions">
      <button className="btn task-proof-upload" type="button" onClick={() => uploadRef.current?.click()} disabled={disabled || saving}><Icon name="file" size={14}/>{evidence ? "Nachweis ändern" : "Datei hochladen"}</button>
      <button className="btn task-proof-camera" type="button" onClick={() => cameraRef.current?.click()} disabled={disabled || saving}><Icon name="camera" size={14}/>{evidence ? "Foto aufnehmen" : "Kamera"}</button>
      {evidence && <><button className="btn" type="button" onClick={downloadEvidence} disabled={saving}><Icon name="file" size={14}/>Herunterladen</button><button className="btn task-proof-delete" type="button" onClick={() => { void removeEvidence(); }} disabled={disabled || saving}>Löschen</button></>}
    </div>
    {error && <span className="task-proof-error" role="alert">{error}</span>}
    {saving && <span className="task-proof-error" role="status">Nachweis wird gespeichert …</span>}
  </div>;
}

export function TasksOverview({ sponsorFilter, sponsorName, eventFilter = "all", embedded = false }: { sponsorFilter?: string; sponsorName?: string; eventFilter?: string; embedded?: boolean } = {}) {
  const [items, setItems] = useState<Task[]>(contractTasks());
  const [evidenceByTask, setEvidenceByTask] = useState<Record<string, Evidence>>({});
  const [ready, setReady] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState(() => ({ ...emptyDraft, sponsor: sponsorName ?? "", eventId: eventFilter !== "all" ? eventFilter : emptyDraft.eventId }));
  const [message, setMessage] = useState("");
  const [selectedEvent, setSelectedEvent] = useState(eventFilter);
  const [selectedSponsor, setSelectedSponsor] = useState(sponsorFilter ?? "all");
  const [selectedStatus, setSelectedStatus] = useState<"all" | Task["status"]>("all");

  useEffect(() => setSelectedEvent(eventFilter), [eventFilter]);
  useEffect(() => setSelectedSponsor(sponsorFilter ?? "all"), [sponsorFilter]);

  useEffect(() => {
    async function loadTasks() {
      try {
        const savedManual = JSON.parse(localStorage.getItem(manualStorageKey) ?? "[]") as Task[];
        const extraBenefits = JSON.parse(localStorage.getItem(extraBenefitsStorageKey) ?? "[]") as ExtraBenefit[];
        const statusOverrides = JSON.parse(localStorage.getItem(taskStatusOverridesKey) ?? "{}") as Partial<Record<string, Task["status"]>>;
        const evidence = await readEvidence();
        const evidenceMap = Object.fromEntries(evidence.map((entry) => [entry.taskId, entry]));
        setEvidenceByTask(evidenceMap);
        setItems([...contractTasks(extraBenefits).map((task) => ({ ...task, status: evidenceMap[task.id] ? "Erledigt" : statusOverrides[task.id] ?? task.status })), ...savedManual.map((task) => ({ ...task, sponsorId: task.sponsorId ?? sponsorRecords.find((sponsor) => sponsor.name === task.sponsor)?.id ?? "", status: evidenceMap[task.id] ? "Erledigt" : "Offen", eventId: task.eventId ?? events[0]?.id ?? "", eventTitle: task.eventTitle ?? events.find((event) => event.id === task.eventId)?.title ?? events[0]?.title ?? "Event" }))]);
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
      const updated = current.map((item) => item.id === task.id ? { ...item, status: "Erledigt" } : item);
      if (task.source === "Manuell") localStorage.setItem(manualStorageKey, JSON.stringify(updated.filter((item) => item.source === "Manuell")));
      return updated;
    });
    setMessage(`Nachweis für „${task.title}“ gespeichert. Aufgabe abgeschlossen.`);
  }

  async function deleteProof(task: Task) {
    await deleteStoredEvidence(task.id);
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

  function createTask(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    const selected = events.find((item) => item.id === draft.eventId) ?? events[0];
    const matchedSponsor = sponsorRecords.find((sponsor) => sponsor.name === draft.sponsor.trim());
    const selectedSponsorRecord = sponsorRecords.find((sponsor) => sponsor.id === selectedSponsor);
    const manualTask: Task = { id: `manual-${Date.now()}`, title: draft.title.trim(), sponsor: selectedSponsorRecord?.name || sponsorName || draft.sponsor.trim() || "—", sponsorId: selectedSponsor !== "all" ? selectedSponsor : matchedSponsor?.id ?? "", due: draft.due.trim() || "—", status: "Offen", eventId: selected?.id ?? "", eventTitle: selected?.title ?? "Event", source: "Manuell" };
    const updated = [...items, manualTask];
    try {
      localStorage.setItem(manualStorageKey, JSON.stringify(updated.filter((task) => task.source === "Manuell")));
      setItems(updated);
      setDraft(emptyDraft);
      setShowCreate(false);
      setMessage("Aufgabe hinzugefügt.");
    } catch {
      setMessage("Die Aufgabe konnte nicht gespeichert werden.");
    }
  }

  const visibleItems = items.filter((task) => (selectedSponsor === "all" || task.sponsorId === selectedSponsor) && (selectedEvent === "all" || task.eventId === selectedEvent) && (selectedStatus === "all" || task.status === selectedStatus));
  const visibleCompleted = visibleItems.filter((task) => task.status === "Erledigt").length;
  const selectedSponsorName = sponsorRecords.find((sponsor) => sponsor.id === selectedSponsor)?.name;
  const completionSummary = `${visibleCompleted} von ${visibleItems.length} abgeschlossen`;

  return <>
    {!sponsorFilter && !embedded && <PageHeading eyebrow="WORKSPACE" title="Aufgaben" subtitle="Leite Aufgaben aus vereinbarten Leistungen ab und ergänze sie bei Bedarf." action={<button className="btn btn-primary" type="button" onClick={() => { setMessage(""); setShowCreate(true); }}><Icon name="plus" size={16}/> Aufgabe anlegen</button>} />}
    {sponsorFilter && !embedded && <div className="sponsor-task-heading"><div><h2>Aufgaben & Nachweise</h2><p>Nachweise schließen Aufgaben ab.</p></div><button className="btn btn-primary" type="button" onClick={() => { setDraft((current) => ({ ...current, sponsor: sponsorName ?? "" })); setShowCreate(true); }}><Icon name="plus" size={15}/> Aufgabe anlegen</button></div>}
    <section className={`panel table-panel ${embedded ? "event-task-panel" : ""}`}>
      <div className="table-head tasks-table-head"><div><h2>{embedded ? "Aufgaben & Nachweise" : selectedSponsorName ? `${selectedSponsorName} · Aufgaben` : "Alle Aufgaben"}</h2><p className="subtitle" style={{ fontSize: 11, marginTop: 4 }}>{completionSummary}</p></div><div className="task-filters"><label className="task-event-filter"><span>Sponsor</span><select value={selectedSponsor} onChange={(event) => setSelectedSponsor(event.target.value)}><option value="all">Alle Sponsoren</option>{sponsorRecords.map((sponsor) => <option key={sponsor.id} value={sponsor.id}>{sponsor.name}</option>)}</select></label>{!embedded && <label className="task-event-filter"><span>Event</span><select value={selectedEvent} onChange={(event) => setSelectedEvent(event.target.value)}><option value="all">Alle Events</option>{events.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}</select></label>}<label className="task-event-filter"><span>Status</span><select value={selectedStatus} onChange={(event) => setSelectedStatus(event.target.value as "all" | Task["status"])}><option value="all">Alle Status</option><option value="Offen">Offen</option><option value="Erledigt">Erledigt</option></select></label>{embedded && <button className="btn btn-primary" type="button" onClick={() => { setMessage(""); setShowCreate(true); }}><Icon name="plus" size={15}/> Aufgabe anlegen</button>}</div></div>
      <table className="table tasks-table"><thead><tr><th>AUFGABE</th><th>SPONSOR</th><th>EVENT</th><th>FÄLLIG</th><th>QUELLE</th><th>STATUS</th><th>NACHWEIS</th></tr></thead><tbody>{visibleItems.map((task) => <tr key={task.id} className={task.status === "Erledigt" ? "task-completed-row" : undefined}>
        <td><b style={{ color: "#3d4c5b" }}>{task.title}</b></td><td>{sponsorFilter && task.sponsorId === sponsorFilter ? sponsorName ?? task.sponsor : task.sponsor}</td><td>{task.eventTitle}</td><td>{formatDue(task.due)}</td><td><span className={`task-source ${task.source === "Leistung" ? "derived" : "manual"}`}>{task.source === "Leistung" ? "Aus Vertrag" : "Manuell"}</span></td><td><Status value={task.status} /></td><td><TaskProofControl task={task} evidence={evidenceByTask[task.id]} disabled={!ready} onProofAdded={addProof} onProofDeleted={deleteProof}/></td>
      </tr>)}</tbody></table>
      {visibleItems.length === 0 && <p className="task-empty">{selectedSponsor !== "all" || selectedEvent !== "all" || selectedStatus !== "all" ? "Keine Aufgaben entsprechen den ausgewählten Filtern." : "Für dieses Event gibt es noch keine Aufgaben. Lege eine Aufgabe manuell an."}</p>}
      {message && <p className="task-feedback" role="status">{message}</p>}
    </section>
    {showCreate && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowCreate(false); }}><section className="create-modal" role="dialog" aria-modal="true" aria-labelledby="create-task-title"><div className="create-modal-head"><div><h2 id="create-task-title">Aufgabe anlegen</h2><p>Ergänze eine Aufgabe, die nicht automatisch aus einer Vertragsleistung entsteht.</p></div><button className="icon-button" type="button" aria-label="Dialog schließen" onClick={() => setShowCreate(false)}><Icon name="close" size={16}/></button></div><form onSubmit={createTask}><div className="settings-grid"><label className="settings-field settings-field-full"><span>Aufgabe *</span><input autoFocus required maxLength={100} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Was muss erledigt werden?" /></label><label className="settings-field settings-field-full"><span>Event *</span><select required value={draft.eventId} onChange={(event) => setDraft({ ...draft, eventId: event.target.value })}>{events.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}</select></label><label className="settings-field"><span>Sponsor</span><input value={draft.sponsor} onChange={(event) => setDraft({ ...draft, sponsor: event.target.value })} placeholder="Optional" /></label><label className="settings-field"><span>Fällig</span><input type="date" lang="de" value={draft.due} onChange={(event) => setDraft({ ...draft, due: event.target.value })} /></label></div><div className="create-modal-actions"><button className="btn" type="button" onClick={() => setShowCreate(false)}>Abbrechen</button><button className="btn btn-primary" type="submit" disabled={!ready}>Aufgabe speichern</button></div></form></section></div>}
  </>;
}
