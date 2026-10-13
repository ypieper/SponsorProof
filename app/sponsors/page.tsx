"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { EmptyState, Icon, Metric } from "@/components/ui";
import { createSponsorRecord, fetchSponsorRecords, type SponsorRecord } from "@/lib/sponsors-storage";
import { fetchStoredEventsFromDatabase, type StoredEvent } from "@/lib/events-storage";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { emptySponsorMasterData, SponsorMasterDataFields, type PostalCodeStatus, type SponsorMasterData } from "@/components/sponsor-master-data-fields";

const exampleSponsors = [
  { name: "Niederrheinische Sparkasse", street: "Hagsche Straße", streetNumber: "12", postalCode: "47533", city: "Kleve", contactFirstName: "Anna", contactLastName: "Beispiel", email: "anna.beispiel+niederrheinische-sparkasse@example.com" },
  { name: "Elspass Autoland GmbH", street: "Am Gewerbepark", streetNumber: "8", postalCode: "46539", city: "Dinslaken", contactFirstName: "Markus", contactLastName: "Muster", email: "markus.muster+elspass@example.com" },
  { name: "Volksbank Rhein-Lippe eG", street: "Pastor-Schmitz-Straße", streetNumber: "4", postalCode: "46535", city: "Dinslaken", contactFirstName: "Sabine", contactLastName: "Beispiel", email: "sabine.beispiel+volksbank@example.com" },
  { name: "Kahmann Bau GmbH", street: "Rheinallee", streetNumber: "16", postalCode: "46485", city: "Wesel", contactFirstName: "Thomas", contactLastName: "Muster", email: "thomas.muster+kahmann-bau@example.com" },
  { name: "Hellmich Baugesellschaft GmbH", street: "Bergerfurth Straße", streetNumber: "21", postalCode: "46569", city: "Hünxe", contactFirstName: "Laura", contactLastName: "Beispiel", email: "laura.beispiel+hellmich-bau@example.com" },
];

export default function SponsorsPage() {
  const [records, setRecords] = useState<SponsorRecord[]>([]);
  const [events, setEvents] = useState<StoredEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [masterData, setMasterData] = useState<SponsorMasterData>(emptySponsorMasterData);
  const [postalCodeStatus, setPostalCodeStatus] = useState<PostalCodeStatus>("idle");
  const [message, setMessage] = useState("");
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setMessage("Supabase ist noch nicht eingerichtet.");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [sponsorResult, eventResult] = await Promise.all([fetchSponsorRecords(), fetchStoredEventsFromDatabase()]);
      if (sponsorResult.error) setMessage(`Sponsoren konnten nicht geladen werden: ${sponsorResult.error.message}`);
      else {
        let loadedRecords = sponsorResult.data ?? [];
        const query = new URLSearchParams(window.location.search);
        if (query.get("beispiele") === "sponsoren") {
          window.history.replaceState({}, "", window.location.pathname);
          const knownNames = new Set(loadedRecords.map(({ sponsor }) => sponsor.name.trim().toLocaleLowerCase("de-DE")));
          const missing = exampleSponsors.filter((sponsor) => !knownNames.has(sponsor.name.toLocaleLowerCase("de-DE")));
          const created = await Promise.all(missing.map((sponsor) => createSponsorRecord(sponsor)));
          const failed = created.some((result) => result.error || !result.data);
          const refreshed = await fetchSponsorRecords();
          if (!refreshed.error && refreshed.data) loadedRecords = refreshed.data;
          setMessage(failed ? "Einige Beispiel-Sponsoren konnten nicht angelegt werden. Bitte prüfe die Datenbankmigration und versuche es erneut." : missing.length ? `${missing.length} Beispiel-Sponsoren wurden angelegt.` : "Diese Beispiel-Sponsoren sind bereits vorhanden.");
        } else {
          setMessage("");
        }
        setRecords(loadedRecords);
      }
      if (eventResult.error) setMessage(`Events konnten nicht geladen werden: ${eventResult.error.message}`);
      else setEvents(eventResult.data ?? []);
    } catch {
      setMessage("Sponsoren und Events konnten nicht aus Supabase geladen werden. Bitte prüfe die Verbindung.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const totalCents = records.reduce((sum, record) => sum + record.contracts.reduce((contractSum, contract) => {
    const amount = Number(contract.value.replace(/[^0-9,.-]/g, "").replace(/\./g, "").replace(",", "."));
    return contractSum + Math.round(amount * 100);
  }, 0), 0);
  const euro = (totalCents / 100).toLocaleString("de-DE");

  async function saveSponsor(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    if (postalCodeStatus !== "valid") {
      setFormError(postalCodeStatus === "invalid" ? "Bitte gib eine gültige PLZ ein." : postalCodeStatus === "unavailable" ? "Die PLZ konnte gerade nicht geprüft werden. Bitte versuche es erneut." : "Bitte warte, bis die PLZ geprüft wurde.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const result = await createSponsorRecord({ ...masterData, name: masterData.name.trim() });
      if (result.error || !result.data) {
        setFormError(`Sponsor konnte nicht gespeichert werden: ${result.error?.message ?? "Bitte versuche es erneut."}`);
        return;
      }
      setRecords((current) => [...current, result.data!].sort((a, b) => a.sponsor.name.localeCompare(b.sponsor.name, "de")));
      setCreating(false);
      setMasterData(emptySponsorMasterData);
      setPostalCodeStatus("idle");
    } catch {
      setFormError("Sponsor konnte nicht gespeichert werden. Bitte prüfe deine Verbindung.");
    } finally {
      setSaving(false);
    }
  }

  return <main className="content">
    <div className="page-heading"><div><div className="eyebrow">KUNDENKARTEI</div><h1>Sponsoren</h1><p className="subtitle">Stammdaten und Eventverträge aus deiner Datenbank.</p></div><button className="btn btn-primary" type="button" onClick={() => { setMessage(""); setFormError(""); setCreating(true); }}><Icon name="plus" size={16}/> Sponsor hinzufügen</button></div>
    {message && <p className="event-details-message" role="status">{message}</p>}
    <section className="metric-grid sponsor-directory-metrics">
      <Metric label="Sponsoren" value={loading ? "—" : `${records.length}`} note="Datensätze" icon="users" />
      <Metric label="Verträge" value={loading ? "—" : `${records.reduce((sum, record) => sum + record.contracts.length, 0)}`} note="aus der Datenbank" icon="file" />
      <Metric label="Vertragsvolumen" value={loading ? "—" : `${euro} €`} note="gesamt" icon="spark" />
      <Metric label="Events" value={loading ? "—" : `${new Set(records.flatMap((record) => record.sponsor.eventIds)).size}`} note="mit Sponsoren" icon="calendar" />
    </section>
    <section className="panel table-panel sponsor-directory">
      <div className="table-head"><div><h2>Alle Sponsoren</h2><p className="subtitle" style={{ fontSize: 11, marginTop: 4 }}>Event-Zuordnung und Vertragswert werden im Event gepflegt.</p></div></div>
      {loading ? <p className="task-empty">Sponsoren werden geladen …</p> : records.length === 0 ? <EmptyState className="empty-state-compact" title="Noch keine Sponsoren" description="Lege die Stammdaten eines Sponsors an. Event und Vertragswert ergänzt du später im Event." action={<button className="btn btn-primary" type="button" onClick={() => setCreating(true)}><Icon name="plus" size={14}/> Sponsor hinzufügen</button>} /> : <table className="table"><thead><tr><th>SPONSOR</th><th>EVENTS</th><th>ANSPRECHPERSON</th><th>E-MAIL</th><th>VERTRAGSVOLUMEN</th><th></th></tr></thead><tbody>{records.map(({ sponsor, contracts }) => {
        const amount = contracts.reduce((sum, contract) => sum + Math.round(Number(contract.value.replace(/[^0-9,.-]/g, "").replace(/\./g, "").replace(",", ".")) * 100), 0);
        const assignedEvents = sponsor.eventIds.map((eventId) => events.find((item) => item.id === eventId)?.title).filter(Boolean);
        const contact = [sponsor.contactFirstName, sponsor.contactLastName].filter(Boolean).join(" ");
        return <tr key={sponsor.id}><td><Link href={`/sponsors/${sponsor.id}`} className="sponsor-name"><span className="sponsor-mark" style={sponsor.color ? { background: sponsor.color, color: "white" } : undefined}>{sponsor.initials}</span>{sponsor.name}</Link></td><td>{assignedEvents.length ? assignedEvents.join(", ") : <span className="directory-missing">Noch nicht zugeordnet</span>}</td><td>{contact || <span className="directory-missing">Noch nicht hinterlegt</span>}</td><td>{sponsor.email || <span className="directory-missing">Noch nicht hinterlegt</span>}</td><td>{contracts.length ? `${(amount / 100).toLocaleString("de-DE")} €` : <span className="directory-missing">Im Event erfassen</span>}</td><td><Link className="sponsor-open-link" href={`/sponsors/${sponsor.id}`} aria-label={`${sponsor.name} öffnen`}><Icon name="arrow" size={15}/></Link></td></tr>;
      })}</tbody></table>}
    </section>
    {creating && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setCreating(false); }}><section className="create-modal" role="dialog" aria-modal="true" aria-labelledby="create-sponsor-title"><div className="create-modal-head"><div><h2 id="create-sponsor-title">Sponsor hinzufügen</h2><p>Vollständige Stammdaten und Ansprechperson werden direkt angelegt.</p></div><button className="icon-button" type="button" aria-label="Dialog schließen" disabled={saving} onClick={() => setCreating(false)}><Icon name="close" size={16}/></button></div><form onSubmit={saveSponsor}><div className="sponsor-edit-sections"><SponsorMasterDataFields value={masterData} onChange={setMasterData} onPostalCodeStatusChange={setPostalCodeStatus} /></div>{formError && <p className="field-message error" role="alert" style={{ marginTop: 14 }}>{formError}</p>}<div className="create-modal-actions"><button className="btn" type="button" disabled={saving} onClick={() => setCreating(false)}>Abbrechen</button><button className="btn btn-primary" type="submit" disabled={saving || postalCodeStatus !== "valid"}>{saving ? "Wird gespeichert …" : "Sponsor speichern"}</button></div></form></section></div>}
  </main>;
}
