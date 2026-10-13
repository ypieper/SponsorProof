"use client";

import { useCallback, useEffect, useState, type FormEvent, type SetStateAction } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type Sponsor, type SponsorContract } from "@/lib/sponsor-types";
import { EmptyState, Icon, Metric, PageHeading, Progress, Status, Tabs } from "@/components/ui";
import { TasksOverview } from "@/components/tasks-overview";
import { formatContractValue, parseContractValue } from "@/lib/event-contract-values";
import { deleteUnassignedSponsorRecord, updateSponsorRecord } from "@/lib/sponsors-storage";
import { SponsorMasterDataFields, type PostalCodeStatus, type SponsorMasterData } from "@/components/sponsor-master-data-fields";

type SponsorData = Omit<Sponsor, "value" | "progress" | "status">;

function ProfileField({ label, value, onChange, type = "text", required = false, autoComplete }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean; autoComplete?: string }) {
  return <label className="settings-field"><span>{label}{required && <span className="required-mark"> *</span>}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} required={required} autoComplete={autoComplete} /></label>;
}

function EventFilter({ events, selectedEvent, sponsorId, tab }: { events: { id: string; title: string }[]; selectedEvent: string; sponsorId: string; tab: string }) {
  return <form className="sponsor-event-filter" action={`/sponsors/${sponsorId}`} method="get">
    <input type="hidden" name="tab" value={tab} />
    <label><span>Event</span><select name="event" value={selectedEvent} onChange={(event) => event.currentTarget.form?.requestSubmit()}><option value="all">Alle Events</option>{events.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
  </form>;
}

export function SponsorDetail({ initialSponsor, contracts, events, activeTab, selectedEvent }: {
  initialSponsor: SponsorData;
  contracts: SponsorContract[];
  events: { id: string; title: string; date: string; location: string }[];
  activeTab: string;
  selectedEvent: string;
}) {
  const [sponsor, setSponsor] = useState<SponsorData>(initialSponsor);
  const [draft, setDraft] = useState<SponsorData>(initialSponsor);
  const [ready, setReady] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [postalCodeStatus, setPostalCodeStatus] = useState<PostalCodeStatus>("idle");
  const router = useRouter();

  useEffect(() => {
    setSponsor(initialSponsor);
    setDraft(initialSponsor);
    setReady(true);
  }, [initialSponsor]);

  const tabs = [
    { label: "Übersicht", href: `/sponsors/${sponsor.id}?tab=uebersicht${selectedEvent !== "all" ? `&event=${selectedEvent}` : ""}` },
    { label: "Vertrag", href: `/sponsors/${sponsor.id}?tab=vertrag${selectedEvent !== "all" ? `&event=${selectedEvent}` : ""}` },
    { label: "Aufgaben & Nachweise", href: `/sponsors/${sponsor.id}?tab=aufgaben-nachweise${selectedEvent !== "all" ? `&event=${selectedEvent}` : ""}` },
    { label: "Report", href: `/sponsors/${sponsor.id}?tab=report${selectedEvent !== "all" ? `&event=${selectedEvent}` : ""}` },
  ];
  const visibleContracts = contracts.filter((contract) => selectedEvent === "all" || contract.eventId === selectedEvent);
  const contractValue = (contract: SponsorContract) => parseContractValue(contract.value);
  const totalValue = visibleContracts.reduce((sum, contract) => sum + contractValue(contract), 0);
  const selectedEventTitle = events.find((event) => event.id === selectedEvent)?.title;

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (postalCodeStatus !== "valid") {
      setMessage(postalCodeStatus === "invalid" ? "Bitte gib eine gültige PLZ ein." : postalCodeStatus === "unavailable" ? "Die PLZ konnte gerade nicht geprüft werden. Bitte versuche es erneut." : "Bitte warte, bis die PLZ geprüft wurde.");
      return;
    }
    const name = draft.name.trim();
    const words = name.split(/\s+/).filter(Boolean);
    const initials = words.length > 1 ? words.map((word) => word[0]).join("").slice(0, 3).toUpperCase() : name.slice(0, 3).toUpperCase();
    const updated = { ...draft, name, initials };
    setSaving(true);
    try {
      const { error } = await updateSponsorRecord(sponsor.id, updated);
      if (error) {
        setMessage(`Die Stammdaten konnten nicht in Supabase gespeichert werden: ${error.message}`);
        return;
      }
      setSponsor(updated);
      setDraft(updated);
      setEditing(false);
      setMessage("Sponsor-Stammdaten gespeichert.");
    } catch {
      setMessage("Die Stammdaten konnten nicht gespeichert werden. Bitte prüfe deine Verbindung.");
    } finally {
      setSaving(false);
    }
  }

  function requestDelete() {
    setDeleteError("");
    if (sponsor.eventIds.length > 0 || contracts.length > 0) {
      setDeleteError("Dieser Sponsor ist einem Event zugeordnet und kann deshalb nicht gelöscht werden.");
      return;
    }
    setDeleteText("");
    setDeleteConfirmation(true);
  }

  async function confirmDelete() {
    if (deleteText !== "löschen" || deleting) return;
    setDeleting(true);
    setDeleteError("");
    try {
      const result = await deleteUnassignedSponsorRecord(sponsor.id);
      if (result.error) {
        setDeleteError(`Der Sponsor konnte nicht gelöscht werden: ${result.error.message}`);
        setDeleteConfirmation(false);
      } else if (!result.deleted) {
        setDeleteError("Dieser Sponsor ist einem Event zugeordnet und kann deshalb nicht gelöscht werden.");
        setDeleteConfirmation(false);
      } else {
        router.push("/sponsors");
        router.refresh();
      }
    } catch {
      setDeleteError("Der Sponsor konnte nicht gelöscht werden. Bitte prüfe deine Verbindung.");
      setDeleteConfirmation(false);
    } finally {
      setDeleting(false);
    }
  }

  function update<K extends keyof SponsorData>(key: K, value: SponsorData[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function masterDataFromSponsor(value: SponsorData): SponsorMasterData {
    return {
      name: value.name,
      street: value.street ?? "",
      streetNumber: value.streetNumber ?? "",
      postalCode: value.postalCode ?? "",
      city: value.city ?? "",
      vatId: value.vatId ?? "",
      contactFirstName: value.contactFirstName ?? "",
      contactLastName: value.contactLastName ?? "",
      email: value.email ?? "",
      phone: value.phone ?? "",
    };
  }

  const updateMasterData = useCallback((value: SetStateAction<SponsorMasterData>) => {
    setDraft((current) => {
      const currentMasterData = masterDataFromSponsor(current);
      const nextMasterData = typeof value === "function" ? value(currentMasterData) : value;
      return { ...current, ...nextMasterData };
    });
  }, []);

  const contactName = [sponsor.contactFirstName, sponsor.contactLastName].filter(Boolean).join(" ");
  const address = [sponsor.street, sponsor.streetNumber].filter(Boolean).join(" ");
  const city = [sponsor.postalCode, sponsor.city].filter(Boolean).join(" ");
  const fieldValue = (value?: string) => value?.trim() || "Noch nicht hinterlegt";

  return <main className="content">
    <PageHeading eyebrow="SPONSOR-KUNDENKARTEI" title={sponsor.name} subtitle="Stammdaten und Vereinbarungen über alle Events hinweg." action={<div className="sponsor-profile-actions"><Link className="btn" href="/sponsors">← Alle Sponsoren</Link><button className="btn btn-primary" type="button" onClick={() => { setDraft(sponsor); setPostalCodeStatus("idle"); setEditing(true); }}><Icon name="settings" size={18}/> Stammdaten bearbeiten</button><button className="btn btn-danger" type="button" onClick={requestDelete}><Icon name="trash" size={18}/> Löschen</button></div>} />
    {deleteError && <p className="field-message error sponsor-delete-error" role="alert">{deleteError}</p>}
    {message && <p className="sponsor-feedback" role="status">{message}</p>}
    <section className="panel sponsor-profile-card"><div className="sponsor-hero"><span className="sponsor-large" style={sponsor.color ? { background: sponsor.color } : undefined}>{sponsor.initials}</span><div><h2>{sponsor.name}</h2></div><div className="sponsor-profile-contact"><b>{contactName || "Ansprechperson fehlt"}</b><span>{sponsor.email || "E-Mail noch nicht hinterlegt"}</span></div></div></section>
    <Tabs items={tabs} active={activeTab} />

    {activeTab === "Übersicht" && <>
      <section className="panel sponsor-contract-overview">
        <div className="sponsor-overview-heading"><div><h2>Verträge nach Event</h2><p>Volumen und Fortschritt gelten jeweils für den ausgewählten Eventvertrag.</p></div><EventFilter events={events} selectedEvent={selectedEvent} sponsorId={sponsor.id} tab="uebersicht" /></div>
        <div className="sponsor-contract-list">{visibleContracts.map((contract) => {
          const event = events.find((item) => item.id === contract.eventId);
          return <article className="sponsor-contract-row sponsor-overview-contract-row" key={contract.id}><div className="sponsor-contract-main"><span className="metric-icon"><Icon name="calendar" size={15}/></span><div><h3>{event?.title ?? "Event"}</h3><p>{event ? `${event.date} · ${event.location}` : "Eventdetails nicht verfügbar"}</p><small>Sponsoringvertrag</small></div></div><div className="sponsor-contract-progress"><span>Leistungsfortschritt</span><Progress value={contract.progress}/></div><Status value={contract.status}/><Link className="btn" href={`/events/${contract.eventId}?tab=sponsoren&sponsor=${sponsor.id}`}>Vertrag im Event ansehen</Link></article>;
        })}{visibleContracts.length === 0 && <EmptyState className="empty-state-compact" title="Noch keine Verträge" description={`Für ${selectedEventTitle ?? "dieses Event"} liegt für diesen Sponsor noch kein Vertrag vor.`} action={<Link className="btn" href="/events">Zu den Events</Link>} />}</div>
      </section>
      <div className="sponsor-data-grid"><section className="detail-card"><h3>Unternehmensanschrift</h3><div className="detail-row"><span>Straße</span><b>{fieldValue(address)}</b></div><div className="detail-row"><span>PLZ / Ort</span><b>{fieldValue(city)}</b></div><div className="detail-row"><span>USt-IdNr.</span><b>{fieldValue(sponsor.vatId)}</b></div></section><section className="detail-card"><h3>Ansprechperson</h3><div className="detail-row"><span>Name</span><b>{fieldValue(contactName)}</b></div><div className="detail-row"><span>E-Mail</span><b>{fieldValue(sponsor.email)}</b></div><div className="detail-row"><span>Telefon</span><b>{fieldValue(sponsor.phone)}</b></div></section></div>
      <section className="detail-card sponsor-bank-card"><h3>Bankverbindung</h3><div className="detail-row"><span>Kreditinstitut</span><b>{fieldValue(sponsor.bank)}</b></div><div className="detail-row"><span>IBAN</span><b>{fieldValue(sponsor.iban)}</b></div><div className="detail-row"><span>BIC</span><b>{fieldValue(sponsor.bic)}</b></div></section>
    </>}

    {activeTab === "Vertrag" && <section className="panel sponsor-contract-overview"><div className="sponsor-overview-heading"><div><h2>Verträge</h2><p>Öffne den jeweiligen Vertrag in der Eventansicht.</p></div><EventFilter events={events} selectedEvent={selectedEvent} sponsorId={sponsor.id} tab="vertrag" /></div>{visibleContracts.length > 0 ? <div className="sponsor-contract-list">{visibleContracts.map((contract) => { const event = events.find((item) => item.id === contract.eventId); return <article className="sponsor-contract-row" key={contract.id}><div className="sponsor-contract-main"><span className="metric-icon"><Icon name="calendar" size={15}/></span><div><h3>{event?.title ?? "Event"}</h3><p>{event ? `${event.date} · ${event.location}` : "Eventdetails nicht verfügbar"}</p></div></div><div className="sponsor-contract-value"><span>Vertragsvolumen</span><b>{formatContractValue(contractValue(contract))}</b></div><div className="sponsor-contract-progress"><span>Leistungsfortschritt</span><Progress value={contract.progress}/></div><Status value={contract.status}/><Link className="btn" href={`/events/${contract.eventId}?tab=sponsoren&sponsor=${sponsor.id}`}>Vertrag im Event ansehen</Link></article>; })}</div> : <EmptyState className="empty-state-compact" title="Noch keine Verträge" description="Sobald dieser Sponsor mit einem Eventvertrag verknüpft ist, wird er hier angezeigt." action={<Link className="btn" href="/events">Zu den Events</Link>} />}</section>}

    {activeTab === "Aufgaben & Nachweise" && <TasksOverview sponsorFilter={sponsor.id} sponsorName={sponsor.name} eventFilter={selectedEvent} />}

    {activeTab === "Report" && <><section className="metric-grid"><Metric label="Vertragsvolumen" value={`${totalValue.toLocaleString("de-DE")} €`} note={selectedEventTitle ?? "über alle Events"} icon="spark"/><Metric label="Eventverträge" value={`${visibleContracts.length}`} icon="file"/><Metric label="Erfüllungsgrad" value={visibleContracts.length ? `${Math.round(visibleContracts.reduce((sum, contract) => sum + contract.progress, 0) / visibleContracts.length)} %` : "—"} icon="check"/><Metric label="Verträge offen" value={`${visibleContracts.filter((contract) => contract.status === "Offen").length}`} icon="clock"/></section><section className="panel table-panel"><div className="table-head"><div><h2>Vertragsübersicht</h2><p className="subtitle" style={{ fontSize: 11, marginTop: 4 }}>Jeder Eventvertrag wird separat ausgewiesen.</p></div><EventFilter events={events} selectedEvent={selectedEvent} sponsorId={sponsor.id} tab="report"/></div>{visibleContracts.length ? <table className="table"><thead><tr><th>EVENT</th><th>VERTRAG</th><th>VOLUMEN</th><th>FORTSCHRITT</th><th>STATUS</th></tr></thead><tbody>{visibleContracts.map((contract) => <tr key={contract.id}><td>{events.find((item) => item.id === contract.eventId)?.title ?? "Event"}</td><td>Sponsoringvertrag</td><td>{formatContractValue(contractValue(contract))}</td><td><Progress value={contract.progress}/></td><td><Status value={contract.status}/></td></tr>)}</tbody></table> : <EmptyState className="empty-state-compact" title="Noch keine Verträge" description="Sponsoringverträge für diesen Sponsor werden hier als Report aufgeführt." action={<Link className="btn" href="/events">Zu den Events</Link>} />}</section></>}

    {deleteConfirmation && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !deleting) setDeleteConfirmation(false); }}><section className="create-modal" role="dialog" aria-modal="true" aria-labelledby="delete-sponsor-title"><div className="create-modal-head"><div><h2 id="delete-sponsor-title">Sponsor löschen?</h2><p>Tippe <strong>löschen</strong>, um „{sponsor.name}“ endgültig zu löschen.</p></div><button className="icon-button" type="button" aria-label="Dialog schließen" disabled={deleting} onClick={() => setDeleteConfirmation(false)}><Icon name="close" size={16}/></button></div><label className="settings-field"><span>Bestätigung</span><input autoFocus value={deleteText} onChange={(event) => setDeleteText(event.target.value)} placeholder="löschen" /></label><div className="create-modal-actions"><button className="btn" type="button" disabled={deleting} onClick={() => setDeleteConfirmation(false)}>Abbrechen</button><button className="btn btn-danger" type="button" disabled={deleting || deleteText !== "löschen"} onClick={() => void confirmDelete()}>{deleting ? "Wird gelöscht …" : "Sponsor löschen"}</button></div></section></div>}

    {editing && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(false); }}><section className="create-modal sponsor-edit-modal" role="dialog" aria-modal="true" aria-labelledby="sponsor-edit-title"><div className="create-modal-head"><div><h2 id="sponsor-edit-title">Sponsor-Stammdaten bearbeiten</h2><p>Diese Angaben werden für Verträge und die Kundenkartei verwendet.</p></div><button className="icon-button" type="button" aria-label="Dialog schließen" onClick={() => setEditing(false)}><Icon name="close" size={16}/></button></div><form onSubmit={saveProfile}><div className="sponsor-edit-sections">
      <SponsorMasterDataFields value={masterDataFromSponsor(draft)} onChange={updateMasterData} onPostalCodeStatusChange={setPostalCodeStatus} />
      <section className="settings-section"><div className="settings-section-heading"><span className="settings-section-icon"><Icon name="file" size={16}/></span><div><h2>Bankverbindung</h2><p>Bankdaten für Sponsoring-Verträge.</p></div></div><div className="settings-grid"><ProfileField label="Kreditinstitut" value={draft.bank ?? ""} onChange={(value) => update("bank", value)}/><ProfileField label="IBAN" value={draft.iban ?? ""} onChange={(value) => update("iban", value)} autoComplete="iban"/><ProfileField label="BIC" value={draft.bic ?? ""} onChange={(value) => update("bic", value)}/></div></section>
      </div><div className="create-modal-actions"><button className="btn" type="button" disabled={saving} onClick={() => { setDraft(sponsor); setEditing(false); }}>Abbrechen</button><button className="btn btn-primary" type="submit" disabled={!ready || saving}>{saving ? "Wird gespeichert …" : "Stammdaten speichern"}</button></div></form></section></div>}
  </main>;
}
