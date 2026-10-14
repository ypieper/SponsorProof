"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { Sponsor, SponsorContract } from "@/lib/sponsor-types";
import { EmptyState, Icon, Progress, Status } from "@/components/ui";
import { formatContractValue, parseContractValue, parseContractValueInput } from "@/lib/event-contract-values";
import { addExistingSponsorToEventRecord, createSponsorContractRecord, createSponsorRecord, fetchSponsorRecords, fetchSponsorRecordsForEvent, removeSponsorFromEventRecord, type SponsorRecord } from "@/lib/sponsors-storage";
import { CurrencyField } from "@/components/currency-field";
import { emptySponsorMasterData, SponsorMasterDataFields, type PostalCodeStatus, type SponsorMasterData } from "@/components/sponsor-master-data-fields";
import { fetchStoredBenefits } from "@/lib/benefits-storage";
import { fetchStoredTasks } from "@/lib/tasks-storage";
import { fetchStoredEvidence } from "@/lib/evidence-storage";
import { useEventEntitlements } from "@/components/event-entitlements";

type ContractSummary = { status: "Offen" | "In Arbeit" | "Erledigt"; progress: number };
type EventBenefit = { id?: string; title: string; sponsorId: string; eventId: string };

export function EventSponsorsOverview({ eventId, eventTitle = "Event", sponsors, contracts, benefits, databaseBacked = false }: {
  eventId: string;
  eventTitle?: string;
  sponsors: Sponsor[];
  contracts: SponsorContract[];
  benefits: EventBenefit[];
  databaseBacked?: boolean;
}) {
  const { getEntitlement, loadEntitlement, requestUpgrade, ensureFeature } = useEventEntitlements();
  const [summaries, setSummaries] = useState<Record<string, ContractSummary>>({});
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
  const [contractSponsor, setContractSponsor] = useState<Sponsor | null>(null);
  const [contractValueDraft, setContractValueDraft] = useState("");
  const [savingContract, setSavingContract] = useState(false);
  const [contractsEnabled, setContractsEnabled] = useState(false);
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

  useEffect(() => {
    let active = true;
    const loadAccess = async () => {
      const entitlement = getEntitlement(eventId) ?? await loadEntitlement(eventId);
      if (active) setContractsEnabled(Boolean(entitlement?.entitlement_status === "active" && entitlement.plan.features.contracts));
    };
    void loadAccess();
    const refresh = (event: Event) => {
      const detail = (event as CustomEvent<{ eventId?: string }>).detail;
      if (!detail?.eventId || detail.eventId === eventId) void loadAccess();
    };
    window.addEventListener("sponso:event-entitlement-updated", refresh);
    return () => { active = false; window.removeEventListener("sponso:event-entitlement-updated", refresh); };
  }, [eventId, getEntitlement, loadEntitlement]);

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
    if ((addMode === "new" && !masterData.name.trim()) || (addMode === "existing" && !selectedSponsorId) || (contractsEnabled && (!Number.isFinite(amount) || amount < 0)) || savingSponsor) return;
    setSavingSponsor(true);
    setDatabaseError("");
    try {
      const result = addMode === "existing"
        ? await addExistingSponsorToEventRecord(eventId, selectedSponsorId, contractsEnabled ? Math.round(amount * 100) : undefined)
        : await createSponsorRecord({ ...masterData, eventId, name: masterData.name.trim(), valueCents: contractsEnabled ? Math.round(amount * 100) : undefined });
      if (result.error || !result.data) {
        if (result.error?.message.includes("SPONSOR_LIMIT_REACHED")) requestUpgrade(eventId, eventTitle, "Das Sponsorenlimit dieses Tarifs ist erreicht.");
        setDatabaseError(result.error?.message.includes("SPONSOR_LIMIT_REACHED") ? "Das Sponsorenlimit dieses Events ist erreicht. Wähle im Dialog einen höheren Tarif oder löse einen Code ein." : `Sponsor konnte nicht gespeichert werden: ${result.error?.message ?? "Bitte versuche es erneut."}`);
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

  async function openContractCreation(sponsor: Sponsor) {
    if (!(await ensureFeature(eventId, eventTitle, "contracts"))) return;
    setContractValueDraft("");
    setContractSponsor(sponsor);
  }

  async function saveContractForSponsor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!contractSponsor || savingContract) return;
    const amount = parseContractValueInput(contractValueDraft);
    if (!Number.isFinite(amount) || amount < 0) return;
    if (!(await ensureFeature(eventId, eventTitle, "contracts"))) return;
    setSavingContract(true);
    const result = await createSponsorContractRecord(eventId, contractSponsor.id, Math.round(amount * 100));
    if (result.error || !result.data) {
      if (result.error?.message.includes("EVENT_FEATURE_REQUIRED")) requestUpgrade(eventId, eventTitle, "Verträge erstellen und verwalten");
      setDatabaseError("Der Vertrag konnte nicht angelegt werden. Prüfe den Basic-Tarif und versuche es erneut.");
    } else {
      setDatabaseRecords((current) => current.map((record) => record.sponsor.id === contractSponsor.id ? { ...record, contracts: [...record.contracts, result.data!] } : record));
      setContractSponsor(null);
      setDatabaseError("");
      window.dispatchEvent(new CustomEvent("sponsorproof:event-sponsors-updated", { detail: { eventId } }));
    }
    setSavingContract(false);
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
        const [evidenceResult, benefitResult, taskResult] = await Promise.all([fetchStoredEvidence(), fetchStoredBenefits(eventId), fetchStoredTasks(eventId)]);
        if (evidenceResult.error || benefitResult.error || taskResult.error) throw new Error("Eventfortschritt konnte nicht geladen werden.");
        const evidence = new Set((evidenceResult.data ?? []).map((item) => item.taskId));
        const next: Record<string, ContractSummary> = {};
        for (const contract of displayContracts) {
          const signedOn = contract.signedAt;
          if (!signedOn) {
            next[contract.id] = { status: "Offen", progress: 0 };
            continue;
          }
          const contractBenefits = (benefitResult.data ?? []).filter((benefit) => benefit.eventId === eventId && benefit.sponsorId === contract.sponsorId);
          const contractTasks = (taskResult.data ?? []).filter((task) => task.event_id === eventId && (task.sponsor_id === contract.sponsorId || (!task.sponsor_id && task.sponsor_name === displaySponsors.find((item) => item.id === contract.sponsorId)?.name)));
          const taskIds = [
            ...contractBenefits.map((benefit) => `benefit-${benefit.id}`),
            ...contractTasks.map((task) => task.id),
          ];
          const completed = taskIds.filter((id) => evidence.has(id) || contractBenefits.some((benefit) => `benefit-${benefit.id}` === id && (benefit.status === "Erfüllt" || benefit.status === "Erledigt"))).length;
          const progress = taskIds.length ? Math.round(completed / taskIds.length * 100) : 0;
          next[contract.id] = { status: taskIds.length > 0 && completed === taskIds.length ? "Erledigt" : "In Arbeit", progress };
        }
        if (!cancelled) {
          setSummaries(next);
        }
      } catch {
        if (!cancelled) {
          setSummaries(Object.fromEntries(displayContracts.map((contract) => {
            const signedOn = contract.signedAt;
            const status = !signedOn ? "Offen" : contract.progress >= 100 ? "Erledigt" : "In Arbeit";
            return [contract.id, { status, progress: status === "Offen" ? 0 : contract.progress }];
          })) as Record<string, ContractSummary>);
        }
      }
    }
    void loadSummaries();
    return () => { cancelled = true; };
  }, [eventId, displaySponsors, displayContracts, benefits]);

  return <><section className="panel table-panel event-sponsors-panel"><div className="table-head"><div><h2>Sponsoren im Überblick</h2><p className="subtitle" style={{ fontSize: 11, marginTop: 4 }}>Wähle einen Sponsor, um Vertrag und vereinbarte Einzelleistungen dieses Events zu sehen.</p></div>{databaseBacked && <button className="btn btn-primary" type="button" onClick={openAddSponsorForm}><Icon name="plus" size={14}/> Sponsor hinzufügen</button>}</div>{databaseError && <p className="field-message error" role="alert">{databaseError}</p>}{databaseBacked && databaseLoading ? <p className="task-empty">Sponsoren werden geladen …</p> : displaySponsors.length === 0 ? <EmptyState className="empty-state-compact" title="Noch keine Sponsoren" description="Füge den ersten Sponsor zu diesem Event hinzu, um Vereinbarungen festzuhalten." action={databaseBacked ? <button className="btn btn-primary" type="button" onClick={openAddSponsorForm}><Icon name="plus" size={14}/> Sponsor hinzufügen</button> : undefined} /> : <table className="table"><thead><tr><th>SPONSOR</th><th>VERTRAGSWERT (NETTO)</th><th>ERFÜLLUNG</th><th>STATUS</th><th>AKTION</th></tr></thead><tbody>{displaySponsors.map((sponsor) => {
    const contract = displayContracts.find((item) => item.sponsorId === sponsor.id);
    const sponsorContract = contract;
    const initialSignedOn = sponsorContract?.signedAt;
    if (!sponsorContract) return <tr key={sponsor.id}><td><Link href={`/events/${eventId}?tab=sponsoren&sponsor=${sponsor.id}`} className="sponsor-name"><span className="sponsor-mark" style={{ background: sponsor.color, color: "white" }}>{sponsor.initials}</span>{sponsor.name}</Link></td><td>—</td><td>—</td><td><span className="status status-locked">Daten unvollständig</span></td><td><button className="btn btn-primary" type="button" onClick={() => { void openContractCreation(sponsor); }}>{contractsEnabled ? "Sponsor vervollständigen" : "Freischalten"}</button></td></tr>;
    const summary = summaries[sponsorContract.id] ?? { status: !initialSignedOn ? "Offen" as const : "In Arbeit" as const, progress: initialSignedOn ? sponsorContract.progress : 0 };
    const contractAmount = parseContractValue(sponsorContract.value);
    return <tr key={sponsorContract.id}><td><Link href={`/events/${eventId}?tab=sponsoren&sponsor=${sponsor.id}`} className="sponsor-name"><span className="sponsor-mark" style={{ background: sponsor.color, color: "white" }}>{sponsor.initials}</span>{sponsor.name}</Link></td><td>{formatContractValue(contractAmount)}</td><td><Progress value={summary.progress}/></td><td><Status value={summary.status}/></td><td><button className="btn btn-danger event-sponsor-remove" type="button" onClick={() => { setDatabaseError(""); setPendingRemoval(sponsor); }}>Entfernen</button></td></tr>;
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
          {contractsEnabled ? <section className="add-sponsor-contract-section">
            <div className="add-sponsor-step-heading"><span>2</span><div><h3>Vertragswert für dieses Event</h3><p>Gib den vereinbarten Nettobetrag in Euro für dieses Event ein.</p></div></div>
            <label className="settings-field"><span>Vertragswert netto (€) *</span><CurrencyField ariaLabel="Vertragswert netto in Euro" required value={contractValue} onChange={setContractValue} /></label>
          </section> : <section className="add-sponsor-contract-section add-sponsor-upgrade-note"><div className="add-sponsor-step-heading"><span><Icon name="lock" size={14}/></span><div><h3>Vertrag und Vertragswert</h3><p>Ein Vertrag kann nach der Freischaltung eines Tarifs für dieses Event angelegt werden.</p></div></div><button className="btn" type="button" onClick={() => requestUpgrade(eventId, eventTitle, "Verträge und Vertragswerte")}>Tarife ansehen</button></section>}
        </div>
        {databaseError && <p className="field-message error" role="alert" style={{ marginTop: 14 }}>{databaseError}</p>}
        <div className="create-modal-actions"><button className="btn" type="button" disabled={savingSponsor} onClick={() => setAddingSponsor(false)}>Abbrechen</button><button className="btn btn-primary" type="submit" disabled={savingSponsor || libraryLoading || (addMode === "new" && postalCodeStatus !== "valid") || (addMode === "existing" && (!selectedSponsorId || !availableLibrarySponsors.some((record) => record.sponsor.id === selectedSponsorId)))}>{savingSponsor ? "Wird gespeichert …" : addMode === "new" ? "Sponsor anlegen & hinzufügen" : "Zum Event hinzufügen"}</button></div>
      </form>
    </section>
  </div>}{contractSponsor && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !savingContract) setContractSponsor(null); }}><section className="create-modal" role="dialog" aria-modal="true" aria-labelledby="create-sponsor-contract-title"><div className="create-modal-head"><div><h2 id="create-sponsor-contract-title">Sponsor vervollständigen</h2><p>Lege für {contractSponsor.name} den Vertragswert für dieses Event fest. Danach kannst du den Vertrag und die vereinbarten Leistungen ergänzen.</p></div><button className="icon-button" type="button" aria-label="Dialog schließen" disabled={savingContract} onClick={() => setContractSponsor(null)}><Icon name="close" size={16}/></button></div><form onSubmit={saveContractForSponsor}><label className="settings-field"><span>Vertragswert netto (€) *</span><CurrencyField ariaLabel="Vertragswert netto in Euro" required value={contractValueDraft} onChange={setContractValueDraft}/></label>{databaseError && <p className="field-message error" role="alert">{databaseError}</p>}<div className="create-modal-actions"><button className="btn" type="button" disabled={savingContract} onClick={() => setContractSponsor(null)}>Abbrechen</button><button className="btn btn-primary" type="submit" disabled={savingContract || !contractValueDraft.trim()}>{savingContract ? "Wird gespeichert …" : "Vertrag anlegen"}</button></div></form></section></div>}{pendingRemoval && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !removingSponsor) setPendingRemoval(null); }}><section className="create-modal" role="dialog" aria-modal="true" aria-labelledby="remove-event-sponsor-title"><div className="create-modal-head"><div><h2 id="remove-event-sponsor-title">Sponsor aus Event entfernen?</h2><p>„{pendingRemoval.name}“ wird aus diesem Event entfernt. Der Vertrag und die zugehörigen Leistungen und Aufgaben werden gelöscht; die Sponsor-Stammdaten bleiben erhalten.</p></div><button className="icon-button" type="button" aria-label="Dialog schließen" disabled={removingSponsor} onClick={() => setPendingRemoval(null)}><Icon name="close" size={16}/></button></div>{databaseError && <p className="field-message error" role="alert">{databaseError}</p>}<div className="create-modal-actions"><button className="btn" type="button" disabled={removingSponsor} onClick={() => setPendingRemoval(null)}>Abbrechen</button><button className="btn btn-danger" type="button" disabled={removingSponsor} onClick={() => void confirmRemoveSponsor()}>{removingSponsor ? "Wird entfernt …" : "Aus Event entfernen"}</button></div></section></div>}</>;
}
