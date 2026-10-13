"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { events, sponsors as defaultSponsors, sponsorContracts } from "@/lib/demo-data";
import type { Sponsor } from "@/lib/demo-data";
import { Icon, Metric } from "@/components/ui";

const contractTotal = sponsorContracts.reduce((sum, contract) => sum + Number(contract.value.replace(/[^0-9]/g, "")), 0);
const profileStorageKey = "sponsorproof.sponsor-records.v1";

export default function SponsorsPage() {
  const [sponsors, setSponsors] = useState<Sponsor[]>(defaultSponsors);

  useEffect(() => {
    try {
      const records = JSON.parse(localStorage.getItem(profileStorageKey) ?? "{}") as Record<string, Partial<Sponsor>>;
      setSponsors(defaultSponsors.map((sponsor) => ({ ...sponsor, ...records[sponsor.id] })));
    } catch {
      // Continue showing the seed list if local browser storage is unavailable.
    }
  }, []);

  return <main className="content">
    <div className="page-heading"><div><div className="eyebrow">KUNDENKARTEI</div><h1>Sponsoren</h1><p className="subtitle">Stammdaten und die Eventverträge aller Sponsoren an einem Ort.</p></div></div>
    <section className="metric-grid sponsor-directory-metrics">
      <Metric label="Sponsoren" value={`${sponsors.length}`} note="Kunden-Datensätze" icon="users" />
      <Metric label="Verträge" value={`${sponsorContracts.length}`} note="über alle Events" icon="file" />
      <Metric label="Vertragsvolumen" value={`${contractTotal.toLocaleString("de-DE")} €`} note="gesamt" icon="spark" />
      <Metric label="Events" value={`${events.length}`} note="mit Verträgen" icon="calendar" />
    </section>
    <section className="panel table-panel sponsor-directory">
      <div className="table-head"><div><h2>Alle Sponsoren</h2><p className="subtitle" style={{ fontSize: 11, marginTop: 4 }}>Öffne einen Sponsor, um Stammdaten und Verträge je Event einzusehen.</p></div></div>
      <table className="table"><thead><tr><th>SPONSOR</th><th>ANSPRECHPERSON</th><th>E-MAIL</th><th>EVENTS</th><th>VERTRAGSVOLUMEN</th><th></th></tr></thead><tbody>{sponsors.map((sponsor) => {
        const contracts = sponsorContracts.filter((contract) => contract.sponsorId === sponsor.id);
        const total = contracts.reduce((sum, contract) => sum + Number(contract.value.replace(/[^0-9]/g, "")), 0);
        const eventsForSponsor = new Set(contracts.map((contract) => contract.eventId)).size;
        const contact = [sponsor.contactFirstName, sponsor.contactLastName].filter(Boolean).join(" ");
        return <tr key={sponsor.id}><td><Link href={`/sponsors/${sponsor.id}`} className="sponsor-name"><span className="sponsor-mark" style={sponsor.color ? { background: sponsor.color, color: "white" } : undefined}>{sponsor.initials}</span>{sponsor.name}</Link></td><td>{contact || <span className="directory-missing">Noch nicht hinterlegt</span>}</td><td>{sponsor.email || <span className="directory-missing">Noch nicht hinterlegt</span>}</td><td>{eventsForSponsor}</td><td>{total.toLocaleString("de-DE")} €</td><td><Link className="sponsor-open-link" href={`/sponsors/${sponsor.id}`} aria-label={`${sponsor.name} öffnen`}><Icon name="arrow" size={15}/></Link></td></tr>;
      })}</tbody></table>
    </section>
  </main>;
}
