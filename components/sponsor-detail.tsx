"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { type Sponsor, type SponsorContract } from "@/lib/demo-data";
import { Icon, Metric, PageHeading, Progress, Status, Tabs } from "@/components/ui";
import { TasksOverview } from "@/components/tasks-overview";
import { eventContractValuesKey, formatContractValue, parseContractValue, type EventContractValues } from "@/lib/event-contract-values";

type SponsorData = Omit<Sponsor, "eventId" | "value" | "progress" | "status">;
const profileStorageKey = "sponsorproof.sponsor-records.v1";

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
  const [message, setMessage] = useState("");
  const [contractAmounts, setContractAmounts] = useState<EventContractValues>({});

  useEffect(() => {
    try {
      const records = JSON.parse(localStorage.getItem(profileStorageKey) ?? "{}") as Record<string, Partial<SponsorData>>;
      const stored = { ...initialSponsor, ...records[initialSponsor.id] };
      setSponsor(stored);
      setDraft(stored);
    } catch {
      setMessage("Gespeicherte Stammdaten konnten nicht geladen werden.");
    } finally {
      setReady(true);
    }
  }, [initialSponsor]);

  useEffect(() => {
    try {
      setContractAmounts(JSON.parse(localStorage.getItem(eventContractValuesKey) ?? "{}") as EventContractValues);
    } catch {
      setMessage("Gespeicherte Vertragsvolumen konnten nicht geladen werden.");
    }
  }, []);


  const tabs = [
    { label: "Übersicht", href: `/sponsors/${sponsor.id}?tab=uebersicht${selectedEvent !== "all" ? `&event=${selectedEvent}` : ""}` },
    { label: "Vertrag", href: `/sponsors/${sponsor.id}?tab=vertrag${selectedEvent !== "all" ? `&event=${selectedEvent}` : ""}` },
    { label: "Aufgaben & Nachweise", href: `/sponsors/${sponsor.id}?tab=aufgaben-nachweise${selectedEvent !== "all" ? `&event=${selectedEvent}` : ""}` },
    { label: "Report", href: `/sponsors/${sponsor.id}?tab=report${selectedEvent !== "all" ? `&event=${selectedEvent}` : ""}` },
  ];
  const visibleContracts = contracts.filter((contract) => selectedEvent === "all" || contract.eventId === selectedEvent);
  const contractValue = (contract: SponsorContract) => contractAmounts[contract.id] ?? parseContractValue(contract.value);
  const totalValue = visibleContracts.reduce((sum, contract) => sum + contractValue(contract), 0);
  const selectedEventTitle = events.find((event) => event.id === selectedEvent)?.title;

  function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = draft.name.trim();
    const words = name.split(/\s+/).filter(Boolean);
    const initials = words.length > 1 ? words.map((word) => word[0]).join("").slice(0, 3).toUpperCase() : name.slice(0, 3).toUpperCase();
    const updated = { ...draft, name, initials };
    try {
      const records = JSON.parse(localStorage.getItem(profileStorageKey) ?? "{}") as Record<string, SponsorData>;
      localStorage.setItem(profileStorageKey, JSON.stringify({ ...records, [sponsor.id]: updated }));
      setSponsor(updated);
      setDraft(updated);
      setEditing(false);
      setMessage("Sponsor-Stammdaten gespeichert.");
    } catch {
      setMessage("Die Stammdaten konnten nicht gespeichert werden.");
    }
  }

  function update<K extends keyof SponsorData>(key: K, value: SponsorData[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  const contactName = [sponsor.contactFirstName, sponsor.contactLastName].filter(Boolean).join(" ");
  const address = [sponsor.street, sponsor.streetNumber].filter(Boolean).join(" ");
  const city = [sponsor.postalCode, sponsor.city].filter(Boolean).join(" ");
  const fieldValue = (value?: string) => value?.trim() || "Noch nicht hinterlegt";

  return <main className="content">
    <PageHeading eyebrow="SPONSOR-KUNDENKARTEI" title={sponsor.name} subtitle="Stammdaten und Vereinbarungen über alle Events hinweg." action={<div className="sponsor-profile-actions"><Link className="btn" href="/sponsors">← Alle Sponsoren</Link><button className="btn btn-primary" type="button" onClick={() => { setDraft(sponsor); setEditing(true); }}><Icon name="settings" size={15}/> Stammdaten bearbeiten</button></div>} />
    {message && <p className="sponsor-feedback" role="status">{message}</p>}
    <section className="panel sponsor-profile-card"><div className="sponsor-hero"><span className="sponsor-large" style={sponsor.color ? { background: sponsor.color } : undefined}>{sponsor.initials}</span><div><h2>{sponsor.name}</h2><div className="subtitle">{sponsor.legalForm || "Sponsor"}</div></div><div className="sponsor-profile-contact"><b>{contactName || "Ansprechperson fehlt"}</b><span>{sponsor.email || "E-Mail noch nicht hinterlegt"}</span></div></div></section>
    <Tabs items={tabs} active={activeTab} />

    {activeTab === "Übersicht" && <>
      <section className="panel sponsor-contract-overview">
        <div className="sponsor-overview-heading"><div><h2>Verträge nach Event</h2><p>Volumen und Fortschritt gelten jeweils für den ausgewählten Eventvertrag.</p></div><EventFilter events={events} selectedEvent={selectedEvent} sponsorId={sponsor.id} tab="uebersicht" /></div>
        <div className="sponsor-contract-list">{visibleContracts.map((contract) => {
          const event = events.find((item) => item.id === contract.eventId);
          return <article className="sponsor-contract-row sponsor-overview-contract-row" key={contract.id}><div className="sponsor-contract-main"><span className="metric-icon"><Icon name="calendar" size={15}/></span><div><h3>{event?.title ?? "Event"}</h3><p>{event ? `${event.date} · ${event.location}` : "Eventdetails nicht verfügbar"}</p><small>Sponsoringvertrag</small></div></div><div className="sponsor-contract-progress"><span>Leistungsfortschritt</span><Progress value={contract.progress}/></div><Status value={contract.status}/><Link className="btn" href={`/events/${contract.eventId}?tab=sponsoren&sponsor=${sponsor.id}`}>Vertrag im Event ansehen</Link></article>;
        })}{visibleContracts.length === 0 && <p className="sponsor-event-empty">Für {selectedEventTitle ?? "dieses Event"} liegt für diesen Sponsor kein Vertrag vor.</p>}</div>
      </section>
      <div className="sponsor-data-grid"><section className="detail-card"><h3>Unternehmensanschrift</h3><div className="detail-row"><span>Rechtsform</span><b>{fieldValue(sponsor.legalForm)}</b></div><div className="detail-row"><span>Straße</span><b>{fieldValue(address)}</b></div><div className="detail-row"><span>PLZ / Ort</span><b>{fieldValue(city)}</b></div><div className="detail-row"><span>USt-IdNr.</span><b>{fieldValue(sponsor.vatId)}</b></div></section><section className="detail-card"><h3>Ansprechperson</h3><div className="detail-row"><span>Name</span><b>{fieldValue(contactName)}</b></div><div className="detail-row"><span>E-Mail</span><b>{fieldValue(sponsor.email)}</b></div><div className="detail-row"><span>Telefon</span><b>{fieldValue(sponsor.phone)}</b></div></section></div>
      <section className="detail-card sponsor-bank-card"><h3>Bankverbindung</h3><div className="detail-row"><span>Kreditinstitut</span><b>{fieldValue(sponsor.bank)}</b></div><div className="detail-row"><span>IBAN</span><b>{fieldValue(sponsor.iban)}</b></div><div className="detail-row"><span>BIC</span><b>{fieldValue(sponsor.bic)}</b></div></section>
    </>}

    {activeTab === "Vertrag" && <section className="panel sponsor-contract-overview"><div className="sponsor-overview-heading"><div><h2>Verträge</h2><p>Öffne den jeweiligen Vertrag in der Eventansicht.</p></div><EventFilter events={events} selectedEvent={selectedEvent} sponsorId={sponsor.id} tab="vertrag" /></div>{visibleContracts.length > 0 ? <div className="sponsor-contract-list">{visibleContracts.map((contract) => { const event = events.find((item) => item.id === contract.eventId); return <article className="sponsor-contract-row" key={contract.id}><div className="sponsor-contract-main"><span className="metric-icon"><Icon name="calendar" size={15}/></span><div><h3>{event?.title ?? "Event"}</h3><p>{event ? `${event.date} · ${event.location}` : "Eventdetails nicht verfügbar"}</p></div></div><div className="sponsor-contract-value"><span>Vertragsvolumen</span><b>{formatContractValue(contractValue(contract))}</b></div><div className="sponsor-contract-progress"><span>Leistungsfortschritt</span><Progress value={contract.progress}/></div><Status value={contract.status}/><Link className="btn" href={`/events/${contract.eventId}?tab=sponsoren&sponsor=${sponsor.id}`}>Vertrag im Event ansehen</Link></article>; })}</div> : <p className="sponsor-event-empty">Für diesen Event gibt es keinen Vertrag mit diesem Sponsor.</p>}</section>}

    {activeTab === "Aufgaben & Nachweise" && <TasksOverview sponsorFilter={sponsor.id} sponsorName={sponsor.name} eventFilter={selectedEvent} />}

    {activeTab === "Report" && <><section className="metric-grid"><Metric label="Vertragsvolumen" value={`${totalValue.toLocaleString("de-DE")} €`} note={selectedEventTitle ?? "über alle Events"} icon="spark"/><Metric label="Eventverträge" value={`${visibleContracts.length}`} icon="file"/><Metric label="Erfüllungsgrad" value={visibleContracts.length ? `${Math.round(visibleContracts.reduce((sum, contract) => sum + contract.progress, 0) / visibleContracts.length)} %` : "—"} icon="check"/><Metric label="Verträge offen" value={`${visibleContracts.filter((contract) => contract.status === "Offen").length}`} icon="clock"/></section><section className="panel table-panel"><div className="table-head"><div><h2>Vertragsübersicht</h2><p className="subtitle" style={{ fontSize: 11, marginTop: 4 }}>Jeder Eventvertrag wird separat ausgewiesen.</p></div><EventFilter events={events} selectedEvent={selectedEvent} sponsorId={sponsor.id} tab="report"/></div><table className="table"><thead><tr><th>EVENT</th><th>VERTRAG</th><th>VOLUMEN</th><th>FORTSCHRITT</th><th>STATUS</th></tr></thead><tbody>{visibleContracts.map((contract) => <tr key={contract.id}><td>{events.find((item) => item.id === contract.eventId)?.title ?? "Event"}</td><td>Sponsoringvertrag</td><td>{formatContractValue(contractValue(contract))}</td><td><Progress value={contract.progress}/></td><td><Status value={contract.status}/></td></tr>)}</tbody></table></section></>}

    {editing && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(false); }}><section className="create-modal sponsor-edit-modal" role="dialog" aria-modal="true" aria-labelledby="sponsor-edit-title"><div className="create-modal-head"><div><h2 id="sponsor-edit-title">Sponsor-Stammdaten bearbeiten</h2><p>Diese Angaben werden für Verträge und die Kundenkartei verwendet.</p></div><button className="icon-button" type="button" aria-label="Dialog schließen" onClick={() => setEditing(false)}><Icon name="close" size={16}/></button></div><form onSubmit={saveProfile}><div className="sponsor-edit-sections">
      <section className="settings-section"><div className="settings-section-heading"><span className="settings-section-icon"><Icon name="pin" size={16}/></span><div><h2>Unternehmen und Anschrift</h2><p>Bezeichnung und offizielle Anschrift des Sponsors.</p></div></div><div className="settings-grid"><ProfileField label="Unternehmensname / Bezeichnung" value={draft.name} onChange={(value) => update("name", value)} required autoComplete="organization"/><ProfileField label="Rechtsform" value={draft.legalForm ?? ""} onChange={(value) => update("legalForm", value)}/><ProfileField label="Straße" value={draft.street ?? ""} onChange={(value) => update("street", value)} required autoComplete="address-line1"/><ProfileField label="Hausnummer" value={draft.streetNumber ?? ""} onChange={(value) => update("streetNumber", value)} required autoComplete="address-line2"/><ProfileField label="PLZ" value={draft.postalCode ?? ""} onChange={(value) => update("postalCode", value)} required autoComplete="postal-code"/><ProfileField label="Ort" value={draft.city ?? ""} onChange={(value) => update("city", value)} required autoComplete="address-level2"/><ProfileField label="USt-IdNr." value={draft.vatId ?? ""} onChange={(value) => update("vatId", value)}/></div></section>
      <section className="settings-section"><div className="settings-section-heading"><span className="settings-section-icon"><Icon name="users" size={16}/></span><div><h2>Ansprechperson</h2><p>Kontakt für Rückfragen und Vertragsunterlagen.</p></div></div><div className="settings-grid"><ProfileField label="Vorname" value={draft.contactFirstName ?? ""} onChange={(value) => update("contactFirstName", value)} required autoComplete="given-name"/><ProfileField label="Nachname" value={draft.contactLastName ?? ""} onChange={(value) => update("contactLastName", value)} required autoComplete="family-name"/><ProfileField label="E-Mail" value={draft.email ?? ""} onChange={(value) => update("email", value)} type="email" required autoComplete="email"/><ProfileField label="Telefon" value={draft.phone ?? ""} onChange={(value) => update("phone", value)} type="tel" autoComplete="tel"/></div></section>
      <section className="settings-section"><div className="settings-section-heading"><span className="settings-section-icon"><Icon name="file" size={16}/></span><div><h2>Bankverbindung</h2><p>Bankdaten für Sponsoring-Verträge.</p></div></div><div className="settings-grid"><ProfileField label="Kreditinstitut" value={draft.bank ?? ""} onChange={(value) => update("bank", value)}/><ProfileField label="IBAN" value={draft.iban ?? ""} onChange={(value) => update("iban", value)} autoComplete="iban"/><ProfileField label="BIC" value={draft.bic ?? ""} onChange={(value) => update("bic", value)}/></div></section>
      </div><div className="create-modal-actions"><button className="btn" type="button" onClick={() => { setDraft(sponsor); setEditing(false); }}>Abbrechen</button><button className="btn btn-primary" type="submit" disabled={!ready}>Stammdaten speichern</button></div></form></section></div>}
  </main>;
}
