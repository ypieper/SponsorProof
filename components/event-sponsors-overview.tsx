"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { Sponsor, SponsorContract } from "@/lib/sponsor-types";
import { contractDateForInput, eventContractDatesKey } from "@/lib/event-contract-dates";
import { EmptyState, Icon, Progress, Status } from "@/components/ui";
import { eventContractValuesKey, formatContractValue, parseContractValue, parseContractValueInput, type EventContractValues } from "@/lib/event-contract-values";
import { addExistingSponsorToEventRecord, createSponsorRecord, fetchSponsorRecords, fetchSponsorRecordsForEvent, removeSponsorFromEventRecord, type SponsorRecord } from "@/lib/sponsors-storage";
import { CurrencyField } from "@/components/currency-field";
import { emptySponsorMasterData, SponsorMasterDataFields, type PostalCodeStatus, type SponsorMasterData } from "@/components/sponsor-master-data-fields";
import { fetchStoredBenefits, syncLegacyBenefitsToSupabase } from "@/lib/benefits-storage";

type Benefit = { id?: string; title: string; sponsorId: string; eventId: string; evidence?: string };
type ManualTask = { id: string; title: string; sponsor: string; sponsorId?: string; eventId?: string };
type TaskEvidence = { taskId: string };
type ContractSummary = { status: "Offen" | "In Arbeit" | "Erledigt"; progress: number };

const evidenceDatabase = "sponsorproof-evidence";
const evidenceStore = "proofs";
const additionalBenefitsKey = "sponsorproof.additional-benefits.v1";
const manualTasksKey = "sponsorproof.manual-tasks.v1";

function readEvidence(): Promise<TaskEvidence[]> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(evidenceDatabase, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(evidenceStore, { keyPath: "taskId" });
    request.onsuccess = () => {
      const database = request.result;
      const read = database.transaction(evidenceStore, "readonly").objectStore(evidenceStore).getAll();
      read.onsuccess = () => { resolve(read.result as TaskEvidence[]); database.close(); };
      read.onerror = () => { reject(read.error); database.close(); };
    };
    request.onerror = () => reject(request.error);
  });
}

function deleteEvidence(taskIds: string[]): Promise<void> {
  if (!taskIds.length) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(evidenceDatabase, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(evidenceStore, { keyPath: "taskId" });
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction(evidenceStore, "readwrite");
      const store = transaction.objectStore(evidenceStore);
      taskIds.forEach((taskId) => store.delete(taskId));
      transaction.oncomplete = () => { database.close(); resolve(); };
      transaction.onerror = () => { database.close(); reject(transaction.error); };
      transaction.onabort = () => { database.close(); reject(transaction.error); };
    };
    request.onerror = () => reject(request.error);
  });
}

function removeLocalSponsorTasks(eventId: string, sponsorId: string, sponsorName: string) {
  const manualTasks = JSON.parse(localStorage.getItem(manualTasksKey) ?? "[]") as ManualTask[];
  const removedManualTasks = manualTasks.filter((task) => task.eventId === eventId && (task.sponsorId === sponsorId || (!task.sponsorId && task.sponsor === sponsorName)));
  localStorage.setItem(manualTasksKey, JSON.stringify(manualTasks.filter((task) => !removedManualTasks.includes(task))));

  const benefits = JSON.parse(localStorage.getItem(additionalBenefitsKey) ?? "[]") as Benefit[];
  const removedBenefits = benefits.filter((benefit) => benefit.eventId === eventId && benefit.sponsorId === sponsorId);
  localStorage.setItem(additionalBenefitsKey, JSON.stringify(benefits.filter((benefit) => !removedBenefits.includes(benefit))));

  const taskIds = [...removedManualTasks.map((task) => task.id), ...removedBenefits.map((benefit) => benefit.id ? `benefit-${benefit.id}` : benefitTaskId(eventId, benefit))];
  const statusOverrides = JSON.parse(localStorage.getItem("sponsorproof.task-status-overrides.v1") ?? "{}") as Record<string, unknown>;
  taskIds.forEach((taskId) => { delete statusOverrides[taskId]; });
  localStorage.setItem("sponsorproof.task-status-overrides.v1", JSON.stringify(statusOverrides));
  void deleteEvidence(taskIds).catch(() => undefined);
}

function benefitTaskId(eventId: string, benefit: Benefit) {
  return benefit.id ? `benefit-${benefit.id}` : `benefit-${eventId}-${benefit.title.toLocaleLowerCase("de-DE").replace(/[^a-z0-9]+/g, "-")}`;
}

export function EventSponsorsOverview({ eventId, sponsors, contracts, benefits, databaseBacked = false }: {
  eventId: string;
  sponsors: Sponsor[];
  contracts: SponsorContract[];
  benefits: Benefit[];
  databaseBacked?: boolean;
}) {
  const [summaries, setSummaries] = useState<Record<string, ContractSummary>>({});
  const [contractAmounts, setContractAmounts] = useState<EventContractValues>({});
  const [databaseRecords, setDatabaseRecords] = useState<SponsorRecord[]>([]);
  const [databaseLoading, setDatabaseLoading] = useState(databaseBacked);
  const [addingSponsor, setAddingSponsor] = useState(false);
  const [addMode, setAddMode] = useState<"existing" | "new">("existing");
  const [libraryRecords, setLibraryRecords] = useState<SponsorRecord[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [sponsorSearch, setSponsorSearch] = useState("");
  const [selectedSponsorId, setSelectedSponsorId] = useState("");
  const [masterData, setMasterData] = useState<SponsorMasterData>(emptySponsorMasterData);
  const [postalCodeStatus, setPostalCodeStatus] = useState<PostalCodeStatus>("idle");
  const [contractValue, setContractValue] = useState("");
  const [savingSponsor, setSavingSponsor] = useState(false);
  const [databaseError, setDatabaseError] = useState("");
  const [pendingRemoval, setPendingRemoval] = useState<Sponsor | null>(null);
  const [removingSponsor, setRemovingSponsor] = useState(false);
  const displaySponsors = useMemo(() => databaseBacked ? databaseRecords.map((record) => record.sponsor) : sponsors, [databaseBacked, databaseRecords, sponsors]);
  const displayContracts = useMemo(() => databaseBacked ? databaseRecords.flatMap((record) => record.contracts) : contracts, [databaseBacked, databaseRecords, contracts]);
  const availableLibrarySponsors = libraryRecords.filter((record) => !record.sponsor.eventIds.includes(eventId));
  const normalizedSearch = sponsorSearch.trim().toLocaleLowerCase("de-DE");
  const filteredLibrarySponsors = availableLibrarySponsors.filter(({ sponsor }) =>
    !normalizedSearch || [sponsor.name, sponsor.email, sponsor.contactFirstName, sponsor.contactLastName]
      .some((value) => value?.toLocaleLowerCase("de-DE").includes(normalizedSearch)),
  );

  useEffect(() => {
    if (!databaseBacked) return;
    fetchSponsorRecordsForEvent(eventId).then(({ data, error }) => {
      if (error) setDatabaseError(`Sponsoren konnten nicht geladen werden: ${error.message}`);
      else setDatabaseRecords(data ?? []);
    }).catch(() => setDatabaseError("Sponsoren konnten nicht aus Supabase geladen werden.")).finally(() => setDatabaseLoading(false));
  }, [databaseBacked, eventId]);

  useEffect(() => {
    if (!addingSponsor || !databaseBacked) return;
    setLibraryLoading(true);
    fetchSponsorRecords().then(({ data, error }) => {
      if (error) setDatabaseError(`Sponsorenbibliothek konnte nicht geladen werden: ${error.message}`);
      else setLibraryRecords(data ?? []);
    }).catch(() => setDatabaseError("Sponsorenbibliothek konnte nicht geladen werden.")).finally(() => setLibraryLoading(false));
  }, [addingSponsor, databaseBacked]);

  function openAddSponsorForm() {
    setDatabaseError("");
    setAddMode("existing");
    setSelectedSponsorId("");
    setSponsorSearch("");
    setMasterData(emptySponsorMasterData);
    setPostalCodeStatus("idle");
    setContractValue("");
    setAddingSponsor(true);
  }

  async function saveSponsor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = parseContractValueInput(contractValue);
    if (addMode === "new" && postalCodeStatus !== "valid") {
      setDatabaseError(postalCodeStatus === "invalid" ? "Bitte gib eine gültige PLZ ein." : postalCodeStatus === "unavailable" ? "Die PLZ konnte gerade nicht geprüft werden. Bitte versuche es erneut." : "Bitte warte, bis die PLZ geprüft wurde.");
      return;
    }
    if ((addMode === "new" && !masterData.name.trim()) || (addMode === "existing" && !selectedSponsorId) || !Number.isFinite(amount) || amount < 0 || savingSponsor) return;
    setSavingSponsor(true);
    setDatabaseError("");
    try {
      const result = addMode === "existing"
        ? await addExistingSponsorToEventRecord(eventId, selectedSponsorId, Math.round(amount * 100))
        : await createSponsorRecord({ ...masterData, eventId, name: masterData.name.trim(), valueCents: Math.round(amount * 100) });
      if (result.error || !result.data) {
        setDatabaseError(`Sponsor konnte nicht gespeichert werden: ${result.error?.message ?? "Bitte versuche es erneut."}`);
        return;
      }
      setDatabaseRecords((current) => [...current, result.data!].sort((a, b) => a.sponsor.name.localeCompare(b.sponsor.name, "de")));
      window.dispatchEvent(new CustomEvent("sponsorproof:event-sponsors-updated", { detail: { eventId, record: result.data } }));
      setAddingSponsor(false);
      setMasterData(emptySponsorMasterData);
      setPostalCodeStatus("idle");
      setContractValue("");
      setSelectedSponsorId("");
      setSponsorSearch("");
      setAddMode("existing");
    } catch {
      setDatabaseError("Sponsor konnte nicht gespeichert werden. Bitte prüfe deine Verbindung.");
    } finally {
      setSavingSponsor(false);
    }
  }

  async function confirmRemoveSponsor() {
    if (!pendingRemoval || removingSponsor) return;
    setRemovingSponsor(true);
    setDatabaseError("");
    try {
      const result = await removeSponsorFromEventRecord(eventId, pendingRemoval.id);
      if (result.error) {
        setDatabaseError(`Sponsor konnte nicht aus dem Event entfernt werden: ${result.error.message}`);
        return;
      }
      if (!result.removed) {
        setDatabaseError("Der Sponsor ist diesem Event nicht mehr zugeordnet.");
        return;
      }
      removeLocalSponsorTasks(eventId, pendingRemoval.id, pendingRemoval.name);
      setDatabaseRecords((current) => current.filter((record) => record.sponsor.id !== pendingRemoval.id));
      setPendingRemoval(null);
      window.dispatchEvent(new CustomEvent("sponsorproof:event-sponsors-updated", { detail: { eventId } }));
    } catch {
      setDatabaseError("Sponsor konnte nicht aus dem Event entfernt werden. Bitte prüfe deine Verbindung.");
    } finally {
      setRemovingSponsor(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function loadSummaries() {
      try {
        const evidence = new Set((await readEvidence()).map((item) => item.taskId));
        const extraBenefits = JSON.parse(localStorage.getItem(additionalBenefitsKey) ?? "[]") as Benefit[];
        if (databaseBacked) {
          const syncResult = await syncLegacyBenefitsToSupabase(extraBenefits.filter((benefit) => benefit.eventId === eventId));
          if (syncResult.error) throw syncResult.error;
        }
        const storedBenefitResult = databaseBacked ? await fetchStoredBenefits(eventId) : null;
        if (storedBenefitResult?.error) throw storedBenefitResult.error;
        const databaseBenefits: Benefit[] = (storedBenefitResult?.data ?? []).flatMap((benefit) => benefit.sponsorId ? [{ id: benefit.id, title: benefit.title, sponsorId: benefit.sponsorId, eventId: benefit.eventId, evidence: benefit.evidence }] : []);
        const databaseBenefitKeys = new Set(databaseBenefits.map((benefit) => `${benefit.eventId}:${benefit.sponsorId}:${benefit.title.trim().replace(/\s+/g, " ").toLocaleLowerCase("de-DE")}`));
        const allExtraBenefits = [...databaseBenefits, ...extraBenefits.filter((benefit) => !databaseBenefitKeys.has(`${benefit.eventId}:${benefit.sponsorId}:${benefit.title.trim().replace(/\s+/g, " ").toLocaleLowerCase("de-DE")}`))];
        const manualTasks = JSON.parse(localStorage.getItem(manualTasksKey) ?? "[]") as ManualTask[];
        const savedDates = JSON.parse(localStorage.getItem(eventContractDatesKey) ?? "{}") as Record<string, string>;
        const savedAmounts = JSON.parse(localStorage.getItem(eventContractValuesKey) ?? "{}") as EventContractValues;
        const next: Record<string, ContractSummary> = {};
        for (const contract of displayContracts) {
          const signedOn = savedDates[contract.id] !== undefined ? savedDates[contract.id] : contractDateForInput(contract.signedAt);
          if (!signedOn) {
            next[contract.id] = { status: "Offen", progress: 0 };
            continue;
          }
          const contractBenefits = [...benefits, ...allExtraBenefits].filter((benefit) => benefit.eventId === eventId && benefit.sponsorId === contract.sponsorId);
          const sponsor = displaySponsors.find((item) => item.id === contract.sponsorId);
          const contractTasks = manualTasks.filter((task) => task.eventId === eventId && (task.sponsorId === contract.sponsorId || (!task.sponsorId && task.sponsor === sponsor?.name)));
          const taskIds = [
            ...contractBenefits.map((benefit) => benefitTaskId(eventId, benefit)),
            ...contractTasks.map((task) => task.id),
          ];
          const completed = taskIds.filter((id) => evidence.has(id) || contractBenefits.some((benefit) => benefitTaskId(eventId, benefit) === id && Boolean(benefit.evidence && benefit.evidence !== "Noch kein Nachweis"))).length;
          const progress = taskIds.length ? Math.round(completed / taskIds.length * 100) : 0;
          next[contract.id] = { status: taskIds.length > 0 && completed === taskIds.length ? "Erledigt" : "In Arbeit", progress };
        }
        if (!cancelled) {
          setSummaries(next);
          setContractAmounts(savedAmounts);
        }
      } catch {
        if (!cancelled) {
          setSummaries(Object.fromEntries(displayContracts.map((contract) => {
            const signedOn = contractDateForInput(contract.signedAt);
            const status = !signedOn ? "Offen" : contract.progress >= 100 ? "Erledigt" : "In Arbeit";
            return [contract.id, { status, progress: status === "Offen" ? 0 : contract.progress }];
          })) as Record<string, ContractSummary>);
        }
      }
    }
    void loadSummaries();
    return () => { cancelled = true; };
  }, [eventId, displaySponsors, displayContracts, benefits]);

  return <><section className="panel table-panel event-sponsors-panel"><div className="table-head"><div><h2>Sponsoren im Überblick</h2><p className="subtitle" style={{ fontSize: 11, marginTop: 4 }}>Wähle einen Sponsor, um Vertrag und vereinbarte Einzelleistungen dieses Events zu sehen.</p></div>{databaseBacked && <button className="btn btn-primary" type="button" onClick={openAddSponsorForm}><Icon name="plus" size={14}/> Sponsor hinzufügen</button>}</div>{databaseError && <p className="field-message error" role="alert">{databaseError}</p>}{databaseBacked && databaseLoading ? <p className="task-empty">Sponsoren werden geladen …</p> : displayContracts.length === 0 ? <EmptyState className="empty-state-compact" title="Noch keine Sponsoren" description="Füge den ersten Sponsor zu diesem Event hinzu, um Vereinbarungen festzuhalten." action={databaseBacked ? <button className="btn btn-primary" type="button" onClick={openAddSponsorForm}><Icon name="plus" size={14}/> Sponsor hinzufügen</button> : undefined} /> : <table className="table"><thead><tr><th>SPONSOR</th><th>VERTRAGSWERT (NETTO)</th><th>ERFÜLLUNG</th><th>STATUS</th><th>AKTION</th></tr></thead><tbody>{displayContracts.map((contract) => {
    const sponsor = displaySponsors.find((item) => item.id === contract.sponsorId);
    if (!sponsor) return null;
    const initialSignedOn = contractDateForInput(contract.signedAt);
    const summary = summaries[contract.id] ?? { status: !initialSignedOn ? "Offen" as const : "In Arbeit" as const, progress: initialSignedOn ? contract.progress : 0 };
    const contractAmount = contractAmounts[contract.id] ?? parseContractValue(contract.value);
    return <tr key={contract.id}><td><Link href={`/events/${eventId}?tab=sponsoren&sponsor=${sponsor.id}`} className="sponsor-name"><span className="sponsor-mark" style={{ background: sponsor.color, color: "white" }}>{sponsor.initials}</span>{sponsor.name}</Link></td><td>{formatContractValue(contractAmount)}</td><td><Progress value={summary.progress}/></td><td><Status value={summary.status}/></td><td><button className="btn btn-danger event-sponsor-remove" type="button" onClick={() => { setDatabaseError(""); setPendingRemoval(sponsor); }}>Entfernen</button></td></tr>;
  })}</tbody></table>}</section>{addingSponsor && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !savingSponsor) setAddingSponsor(false); }}>
    <section className="create-modal add-event-sponsor-modal" role="dialog" aria-modal="true" aria-labelledby="add-event-sponsor-title">
      <div className="create-modal-head">
        <div><h2 id="add-event-sponsor-title">Sponsor zum Event hinzufügen</h2><p>Wähle einen Sponsor aus der Bibliothek und hinterlege den Vertragswert für dieses Event.</p></div>
        <button className="icon-button" type="button" aria-label="Dialog schließen" disabled={savingSponsor} onClick={() => setAddingSponsor(false)}><Icon name="close" size={16}/></button>
      </div>
      <form onSubmit={saveSponsor}>
        <div className="add-event-sponsor-content">
          {addMode === "existing" ? <>
            <div className="add-sponsor-step-heading"><span>1</span><div><h3>Sponsor auswählen</h3><p>Die Stammdaten bleiben zentral in deiner Sponsorenbibliothek.</p></div></div>
            <label className="settings-field add-sponsor-search"><span>Bibliothek durchsuchen</span><input type="search" value={sponsorSearch} onChange={(event) => setSponsorSearch(event.target.value)} placeholder="Name oder Ansprechperson" /></label>
            {libraryLoading ? <p className="task-empty">Sponsorenbibliothek wird geladen …</p> : filteredLibrarySponsors.length ? <div className="add-sponsor-library-list" role="radiogroup" aria-label="Sponsor aus der Bibliothek auswählen">
              {filteredLibrarySponsors.map(({ sponsor }) => {
                const contact = [sponsor.contactFirstName, sponsor.contactLastName].filter(Boolean).join(" ");
                return <label key={sponsor.id} className={`add-sponsor-library-option ${selectedSponsorId === sponsor.id ? "selected" : ""}`}>
                  <input type="radio" name="library-sponsor" value={sponsor.id} checked={selectedSponsorId === sponsor.id} onChange={() => setSelectedSponsorId(sponsor.id)} />
                  <span className="sponsor-mark" style={sponsor.color ? { background: sponsor.color, color: "white" } : undefined}>{sponsor.initials}</span>
                  <span className="add-sponsor-library-copy"><b>{sponsor.name}</b><small>{contact || sponsor.email || "Keine Ansprechperson hinterlegt"}</small></span>
                </label>;
              })}
            </div> : availableLibrarySponsors.length ? <p className="add-sponsor-no-results">Keine passenden Sponsoren gefunden.</p> : <div className="add-sponsor-library-empty"><p>Alle Sponsoren der Bibliothek sind diesem Event bereits zugeordnet.</p><button className="btn" type="button" onClick={() => setAddMode("new")}>Neuen Sponsor anlegen</button></div>}
            {availableLibrarySponsors.length > 0 && !libraryLoading && <button className="add-sponsor-new-link" type="button" onClick={() => { setAddMode("new"); setDatabaseError(""); }}>Neuen Sponsor anlegen</button>}
          </> : <>
            <div className="add-sponsor-new-heading"><div><div className="add-sponsor-step-heading"><span>1</span><div><h3>Neuen Sponsor anlegen</h3><p>Die Stammdaten werden deiner Bibliothek hinzugefügt.</p></div></div></div><button className="add-sponsor-new-link" type="button" onClick={() => setAddMode("existing")}>Zur Bibliothek</button></div>
            <SponsorMasterDataFields value={masterData} onChange={setMasterData} onPostalCodeStatusChange={setPostalCodeStatus} />
          </>}
          <section className="add-sponsor-contract-section">
            <div className="add-sponsor-step-heading"><span>2</span><div><h3>Vertragswert für dieses Event</h3><p>Gib den vereinbarten Nettobetrag in Euro für dieses Event ein.</p></div></div>
            <label className="settings-field"><span>Vertragswert netto (€) *</span><CurrencyField ariaLabel="Vertragswert netto in Euro" required value={contractValue} onChange={setContractValue} /></label>
          </section>
        </div>
        {databaseError && <p className="field-message error" role="alert" style={{ marginTop: 14 }}>{databaseError}</p>}
        <div className="create-modal-actions"><button className="btn" type="button" disabled={savingSponsor} onClick={() => setAddingSponsor(false)}>Abbrechen</button><button className="btn btn-primary" type="submit" disabled={savingSponsor || libraryLoading || (addMode === "new" && postalCodeStatus !== "valid") || (addMode === "existing" && (!selectedSponsorId || !availableLibrarySponsors.some((record) => record.sponsor.id === selectedSponsorId)))}>{savingSponsor ? "Wird gespeichert …" : addMode === "new" ? "Sponsor anlegen & hinzufügen" : "Zum Event hinzufügen"}</button></div>
      </form>
    </section>
  </div>}{pendingRemoval && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !removingSponsor) setPendingRemoval(null); }}><section className="create-modal" role="dialog" aria-modal="true" aria-labelledby="remove-event-sponsor-title"><div className="create-modal-head"><div><h2 id="remove-event-sponsor-title">Sponsor aus Event entfernen?</h2><p>„{pendingRemoval.name}“ wird aus diesem Event entfernt. Der Vertrag und die zugehörigen Leistungen und Aufgaben werden gelöscht; die Sponsor-Stammdaten bleiben erhalten.</p></div><button className="icon-button" type="button" aria-label="Dialog schließen" disabled={removingSponsor} onClick={() => setPendingRemoval(null)}><Icon name="close" size={16}/></button></div>{databaseError && <p className="field-message error" role="alert">{databaseError}</p>}<div className="create-modal-actions"><button className="btn" type="button" disabled={removingSponsor} onClick={() => setPendingRemoval(null)}>Abbrechen</button><button className="btn btn-danger" type="button" disabled={removingSponsor} onClick={() => void confirmRemoveSponsor()}>{removingSponsor ? "Wird entfernt …" : "Aus Event entfernen"}</button></div></section></div>}</>;
}
