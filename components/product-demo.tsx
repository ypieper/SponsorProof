"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon, Metric, Progress, SponsoLogo } from "@/components/ui";

type DemoView = "overview" | "sponsors" | "work" | "documents" | "report";
type DemoRole = "organizer" | "sponsor" | "eventMode";

const organizerViews: Array<{ id: DemoView; label: string }> = [
  { id: "overview", label: "Übersicht" },
  { id: "sponsors", label: "Sponsoren" },
  { id: "work", label: "Aufgaben & Nachweise" },
  { id: "report", label: "Reports" },
];
const sponsorViews: Array<{ id: DemoView; label: string }> = [
  { id: "overview", label: "Übersicht" },
  { id: "sponsors", label: "Vertrag" },
  { id: "work", label: "Leistungen & Aufgaben" },
  { id: "documents", label: "Dokumente" },
];

function DemoStatus({ children, kind = "open" }: { children: string; kind?: "done" | "progress" | "open" | "waiting" }) {
  const className = kind === "done" ? "status-done" : kind === "progress" ? "status-progress" : kind === "waiting" ? "status-waiting" : "status-open";
  return <span className={`status ${className}`}>{children}</span>;
}

function DemoTimeline() {
  const steps = [
    ["Event angelegt", "13. Oktober 2026", "complete"],
    ["Verträge erstellt", "5 von 6 Verträgen", "complete"],
    ["Verträge unterschrieben", "3 von 5 Vereinbarungen", "active"],
    ["Alle Nachweise erbracht", "8 von 12 Leistungen", "upcoming"],
    ["Abschlussreport erstellt und versendet", "0 von 5 Reports", "upcoming"],
  ];
  return <section className="event-timeline" aria-label="Event-Meilensteine"><div className="event-timeline-scroll"><ol className="event-timeline-steps">{steps.map(([title, detail, status]) => <li className={`event-timeline-step ${status}`} key={title}><span className="event-timeline-node">{status === "complete" ? <Icon name="check" size={13}/> : <span/>}</span><b>{title}</b><small>{detail}</small></li>)}</ol></div></section>;
}

function EventLogo() {
  return <span className="event-page-logo demo-event-logo" aria-label="Logo: Aloha Open-Air"><b>ALOHA</b><small>OPEN-AIR</small></span>;
}

function EventOverview() {
  return <>
    <section className="metric-grid">
      <Metric label="Sponsoringvolumen netto" value="9.000 €" icon="spark"/>
      <Metric label="Sponsoren" value="6" icon="users"/>
      <Metric label="Leistungen" value="12" icon="check"/>
      <Metric label="Erledigt" value="67 %" note="8 von 12" icon="layers"/>
    </section>
    <section className="panel event-overview-details">
      <div className="event-details-heading"><div><div className="eyebrow">VERANSTALTUNG</div><h2>Event-Details</h2><p>Zeitraum, Veranstaltungsort und Ansprechperson für Sponsoren.</p></div><button className="btn" type="button" disabled title="Die Demo ist schreibgeschützt"><Icon name="settings" size={14}/> Details bearbeiten</button></div>
      <div className="event-details-grid"><div><span>Zeitraum</span><b>10. Juni 2027</b></div><div><span>Veranstaltungsort</span><b>Festivalwiese 23</b></div><div><span>Ansprechperson</span><b>Jonas Kastenholz</b><small>jonas@sponso.de · 0175 34396572</small></div></div>
    </section>
    <section className="panel demo-overview-activity"><div className="panel-heading"><div><h2>Das läuft gerade</h2><p className="subtitle">Die nächsten Schritte rund um dein Event.</p></div></div>
      <div className="task-row"><span className="task-icon"><Icon name="check" size={15}/></span><div><div className="task-title">Social-Media-Beitrag freigeben lassen</div><div className="task-caption">Volksbank Rhein-Lippe · wartet auf Sponsor</div></div><DemoStatus kind="waiting">Warte auf Sponsor</DemoStatus></div>
      <div className="task-row"><span className="task-icon"><Icon name="file" size={15}/></span><div><div className="task-title">Vertrag digital zeichnen</div><div className="task-caption">Hellmich Baugesellschaft · Sponsoringvertrag</div></div><DemoStatus kind="progress">Ausstehend</DemoStatus></div>
      <div className="task-row"><span className="task-icon"><Icon name="camera" size={15}/></span><div><div className="task-title">Hauptbanner am Eingang dokumentieren</div><div className="task-caption">Elspass Autoland · Foto-Nachweis vorhanden</div></div><DemoStatus kind="done">Erledigt</DemoStatus></div>
    </section>
  </>;
}

type DemoSponsor = {
  name: string;
  contract: string;
  value: string;
  benefits: string;
  completed: string;
  progress: number;
  status: string;
  statusKind: "done" | "progress" | "waiting";
};

const demoSponsors: DemoSponsor[] = [
  { name: "Elspass Autoland GmbH", contract: "Sponsoringvertrag", value: "5.000 €", benefits: "4", completed: "3 erledigt", progress: 75, status: "Gezeichnet", statusKind: "done" },
  { name: "Hellmich Baugesellschaft", contract: "Partnervereinbarung", value: "2.500 €", benefits: "3", completed: "2 erledigt", progress: 67, status: "Daten unvollständig", statusKind: "waiting" },
  { name: "Volksbank Rhein-Lippe", contract: "Partnervereinbarung", value: "1.500 €", benefits: "5", completed: "3 erledigt", progress: 60, status: "Freigabe offen", statusKind: "progress" },
];

function OrganizerSponsors() {
  const [selectedSponsor, setSelectedSponsor] = useState<DemoSponsor | null>(null);

  if (selectedSponsor) {
    return <>
      <div className="page-heading demo-subheading"><div><button className="btn demo-sponsor-back" type="button" onClick={() => setSelectedSponsor(null)}><Icon name="chevron" size={14}/> Alle Sponsoren</button><div className="eyebrow">SPONSORING · EVENT</div><h2>{selectedSponsor.name}</h2><p className="subtitle">Vertragsdaten und vereinbarte Leistungen für Aloha Open-Air 2027.</p></div><DemoStatus kind={selectedSponsor.statusKind}>{selectedSponsor.status}</DemoStatus></div>
      <section className="metric-grid demo-sponsor-detail-metrics">
        <Metric label="Vertrag" value={selectedSponsor.contract} icon="file"/>
        <Metric label="Vertragswert netto" value={selectedSponsor.value} icon="spark"/>
        <Metric label="Vereinbarte Leistungen" value={selectedSponsor.benefits} icon="layers"/>
        <Metric label="Erledigt" value={`${selectedSponsor.progress} %`} note={selectedSponsor.completed} icon="check"/>
      </section>
      <section className="panel"><div className="table-head"><div><h2>Vereinbarte Leistungen</h2><p className="subtitle">Leistungsfortschritt und Aufgaben dieses Sponsors im Event.</p></div><Progress value={selectedSponsor.progress}/></div>
        <div className="demo-sponsor-benefit-list"><article><span className="task-source derived">Sachleistung</span><div><b>Logo auf der Event-Website</b><small>Nachweis und Aufgaben zur vereinbarten Veröffentlichung</small></div><DemoStatus kind="done">Erledigt</DemoStatus></article><article><span className="task-source derived">Geldleistung</span><div><b>Social-Media-Beitrag zur Partnerschaft</b><small>Freigabe und Veröffentlichung des Beitrags</small></div><DemoStatus kind={selectedSponsor.statusKind}>{selectedSponsor.statusKind === "progress" ? "Freigabe offen" : "In Bearbeitung"}</DemoStatus></article><article><span className="task-source derived">Sachleistung</span><div><b>Hauptbanner am Eingang</b><small>Nachweis der vereinbarten Werbefläche</small></div><DemoStatus kind="open">Offen</DemoStatus></article></div>
      </section>
    </>;
  }

  return <>
    <div className="page-heading demo-subheading"><div><div className="eyebrow">SPONSORING</div><h2>Alle Sponsoren</h2><p className="subtitle">Event-Zuordnung, Vertrag und Leistungsfortschritt auf einen Blick.</p></div><button className="btn btn-primary" type="button" disabled title="Die Demo ist schreibgeschützt"><Icon name="plus" size={14}/> Sponsor hinzufügen</button></div>
    <section className="panel table-panel"><div className="table-head"><div><h2>Sponsoren im Event</h2><p className="subtitle">6 Sponsoren · 5 Vereinbarungen</p></div></div>
      <table className="table"><thead><tr><th>SPONSOR</th><th>VERTRAG</th><th>VERTRAGSWERT</th><th>LEISTUNGEN</th><th>STATUS</th><th></th></tr></thead><tbody>
        {demoSponsors.map((sponsor) => <tr key={sponsor.name}><td><b className="demo-table-name">{sponsor.name}</b></td><td>{sponsor.contract}</td><td>{sponsor.value}</td><td><div className="demo-sponsor-progress"><span>{sponsor.benefits} · {sponsor.completed}</span><Progress value={sponsor.progress}/></div></td><td><DemoStatus kind={sponsor.statusKind}>{sponsor.status}</DemoStatus></td><td><button className="btn" type="button" onClick={() => setSelectedSponsor(sponsor)}>{sponsor.statusKind === "waiting" ? "Sponsor ansehen" : "Öffnen"}</button></td></tr>)}
      </tbody></table>
    </section>
  </>;
}

function SponsorContract() {
  return <>
    <section className="panel sponsor-contract-data"><div className="table-head"><div><h2>Vertragsdaten</h2><p className="subtitle">Vertragswert, vereinbarte Leistungen und Leistungsfortschritt für diesen Eventvertrag.</p></div></div><div className="sponsor-contract-detail-grid"><div><span>Vertragswert netto</span><b>5.000,00 €</b></div><div><span>Leistungsfortschritt</span><Progress value={75}/></div><div className="event-contract-date"><span>Zeichnungsdatum</span><b>Eine Unterschrift steht noch aus</b></div></div></section>
    <section className="panel sponsor-contract-files"><div className="table-head"><div><h2>Sponsoringvertrag</h2><p className="subtitle">Vereinbarung mit Elspass Autoland GmbH · 4 Seiten</p></div><DemoStatus kind="waiting">Unterschrift ausstehend</DemoStatus></div><div className="demo-sponsor-sign"><div className="demo-contract-sheet"><span>sponso · SPONSORINGVEREINBARUNG</span><i/><i/><i/><i/><i/><b>Aloha Open-Air 2027</b></div><div><h3>Einfach online zeichnen</h3><p>Die Vereinbarung wird direkt im Sponsorbereich geprüft und bestätigt.</p><button className="btn btn-primary" disabled type="button" title="Die Demo ist schreibgeschützt">Vertrag einfach zeichnen</button><small>Das Signatur-Add-on ist für dieses Event aktiviert.</small></div></div></section>
  </>;
}

function WorkAndEvidence({ role }: { role: DemoRole }) {
  const tasks = [
    { benefit: "Social-Media-Kommunikation", type: "Geldleistung", sponsor: "Volksbank Rhein-Lippe", title: "Social-Media-Beitrag für den Sponsor veröffentlichen", status: "Warte auf Sponsor" as const, kind: "waiting" as const, assignee: "Sponsor" },
    { benefit: "Hauptbanner am Eingang", type: "Sachleistung", sponsor: "Elspass Autoland", title: "Hauptbanner am Eingang platzieren", status: "Erledigt" as const, kind: "done" as const, assignee: "Veranstalter" },
    { benefit: "Logo auf der Event-Website", type: "Sachleistung", sponsor: "Hellmich Baugesellschaft", title: "Sponsorlogo auf der Event-Website einbinden", status: "In Bearbeitung" as const, kind: "progress" as const, assignee: "Veranstalter" },
  ];
  return <>
    <section className={`panel table-panel event-task-panel demo-task-panel ${role === "sponsor" ? "demo-sponsor-task-panel" : ""}`}><div className="table-head tasks-table-head"><div><h2>{role === "organizer" ? "Aufgaben im Überblick" : "Vereinbarte Leistungen"}</h2><p className="subtitle">Verwalte Aufgaben und dokumentiere Nachweise zu vereinbarten Leistungen.</p><p className="subtitle demo-task-summary">1 von 3 Aufgaben abgeschlossen</p></div>{role === "organizer" && <button className="btn btn-primary" disabled type="button"><Icon name="plus" size={14}/> Aufgabe anlegen</button>}</div>
      <div className="benefit-task-groups">{tasks.map((task) => <section className="benefit-task-group" key={task.title} aria-label={`Aufgaben zu ${task.benefit}`}>
        <header className="benefit-task-group-heading"><div><span className={`task-source ${task.type === "Sachleistung" ? "derived" : "manual"}`}>{task.type}</span><h3>{task.benefit}</h3><small>{task.sponsor} · Aloha Open-Air 2027</small></div><DemoStatus kind={task.kind}>{task.status}</DemoStatus></header>
        <div className="benefit-task-instances"><details className="benefit-task-instance" open><summary><span>Details</span><DemoStatus kind={task.kind}>{task.status}</DemoStatus></summary><div className="benefit-task-subtasks"><article className="benefit-task-subtask"><div className="benefit-task-subtask-info"><b>{task.title}</b><span>Bearbeiter: {task.assignee}</span></div><div className="benefit-task-due"><span>Fällig</span><b>12. Juni 2027</b></div><DemoStatus kind={task.kind}>{task.status}</DemoStatus><div className="standalone-task-actions"><button className="btn" disabled type="button">{task.kind === "waiting" && role === "sponsor" ? "Freigeben" : "Details"}</button></div></article></div></details></div>
      </section>)}</div>
    </section>
  </>;
}

function DemoDocuments({ role }: { role: DemoRole }) {
  const rows = role === "organizer"
    ? [["Vertrag-Elspass-Autoland-2027.pdf", "1,9 MB", "Veranstalter · Jonas Kastenholz", "14.10.2026, 14:10"], ["Logo-Elspass-final.png", "2,4 MB", "Sponsor", "14.10.2026, 14:08"], ["Social-Media-Beitrag-Entwurf.pdf", "840 KB", "Sponsor", "14.10.2026, 13:42"]]
    : [["Logo-Elspass-final.png", "2,4 MB", "Von dir hochgeladen", "14.10.2026, 14:08"], ["Social-Media-Beitrag-Entwurf.pdf", "840 KB", "Von dir hochgeladen", "14.10.2026, 13:42"]];
  return <section className="panel sponsor-document-area"><div className="table-head"><div><h2>{role === "organizer" ? "Dokumente von Elspass Autoland GmbH" : "Dokumente"}</h2><p className="subtitle">{role === "organizer" ? "Dateien, Herkunft und Upload-Zeit für diesen Eventvertrag." : "Deine Uploads und die vom Veranstalter für dich bereitgestellten Unterlagen."}</p></div><span className="event-plan-badge event-plan-free">{role === "organizer" ? "Event-Archiv" : "Sponsorbereich"}</span></div>
    <div className="sponsor-organizer-upload sponsor-document-upload-controls"><button className="btn" disabled type="button"><Icon name="plus" size={14}/> Dateien auswählen</button><span>Dateien hochladen · PDF, Word oder Bild · max. 25 MB je Datei</span><button className="btn btn-primary" disabled type="button">In Archiv hochladen</button></div>
    <div className="sponsor-document-list"><div className="sponsor-document-table-header"><span>DATEI</span><span>KATEGORIE</span><span>HERKUNFT</span><span>HOCHGELADEN</span><span>AKTION</span></div>{rows.map(([name, size, origin, date]) => <article className="sponsor-document-row" key={name}><div className="sponsor-document-meta"><b>{name}</b><span>{size}</span></div><div className="sponsor-document-category"><span className="sponsor-document-origin">Vertrag / Sonstiges</span></div><span className="sponsor-document-origin">{origin}</span><time className="sponsor-document-date">{date}</time><div className="sponsor-document-actions"><button className="btn" disabled type="button">Herunterladen</button>{role === "organizer" && <button className="btn" disabled type="button">Löschen</button>}</div></article>)}</div>
  </section>;
}

function DemoReport() {
  return <section className="panel demo-report-panel"><div className="table-head"><div><h2>Fortschritt je Sponsor</h2><p className="subtitle">Abschlussreports werden als PDF erstellt und können anschließend an Sponsoren versendet werden.</p></div></div>
    <table className="table"><thead><tr><th>SPONSOR</th><th>AUFGABEN ERFÜLLT</th><th>FORTSCHRITT</th><th>STATUS</th><th>VERSAND</th><th>REPORT</th></tr></thead><tbody><tr><td><b className="demo-table-name">Elspass Autoland GmbH</b><div className="task-caption">Sponsoringvertrag · 5.000 €</div></td><td>4 von 4</td><td><Progress value={100}/></td><td><DemoStatus kind="done">Erledigt</DemoStatus></td><td><DemoStatus kind="done">Versendet</DemoStatus></td><td><button className="btn btn-primary" disabled type="button">Abschlussreport öffnen</button></td></tr></tbody></table>
    <div className="completion-report-document demo-report-document"><header className="completion-report-brand-row"><div className="completion-report-sponso-brand"><SponsoLogo markSize={30}/></div><EventLogo/></header><div className="completion-report-overline">LEISTUNGSNACHWEIS · SPONSORING</div><div className="completion-report-title-row"><div><h2>Elspass Autoland GmbH</h2><p>Dokumentation der vereinbarten Sponsoringleistungen</p></div><span className="completion-report-seal"><span>✓</span> Vollständig erbracht</span></div><div className="completion-report-event"><span>VERANSTALTUNG</span><strong>Aloha Open-Air 2027</strong></div><div className="completion-report-summary"><div><span>Vertragswert netto</span><b>5.000,00 €</b></div><div><span>Leistungen nachgewiesen</span><b>4 von 4</b></div><div><span>Erstellt am</span><b>14. Oktober 2026</b></div></div><div className="completion-report-section-heading"><div><span>LEISTUNGSÜBERSICHT</span><h3>Vereinbarte Leistungen</h3></div><span>4 Nachweise</span></div><div className="completion-report-items">{["Hauptbanner am Eingang", "Logo auf der Event-Website", "Social-Media-Beitrag", "Sponsorennennung bei der Eröffnung"].map((title, index) => <article className="completion-report-item" key={title}><span className="completion-report-item-number">{String(index + 1).padStart(2, "0")}</span><div className="completion-report-item-content"><h4>{title}</h4><div className="completion-report-evidence"><Icon name="file" size={15}/><span><small>NACHWEIS</small><strong>{index === 0 ? "Foto-Eingangsbereich.jpg" : "Nachweis dokumentiert"}</strong></span></div></div><span className="completion-report-item-check">✓</span></article>)}</div><footer className="completion-report-footer"><span>Erstellt mit <strong>sponso</strong></span><span>Elspass Autoland GmbH · Aloha Open-Air 2027</span></footer></div>
    <div className="demo-report-actions"><button className="btn" disabled type="button">PDF herunterladen</button><button className="btn btn-primary" disabled type="button">An Sponsor senden</button></div>
  </section>;
}

function DemoEventMode() {
  const [tab, setTab] = useState<"event" | "proofs">("proofs");
  return <div className="mobile-shell mobile-event-mode demo-event-mode-preview">
    <header className="mobile-header"><span className="brand" aria-label="sponso"><SponsoLogo markSize={29}/></span><div className="mobile-header-actions"><button className="icon-button demo-phone-header-button" type="button" disabled aria-label="Menü"><Icon name="menu" size={16}/></button><button className="icon-button demo-phone-header-button" type="button" disabled aria-label="Zur Eventübersicht"><Icon name="chevron" size={16}/></button></div></header>
    <main className="mobile-content">
      <span className="live-pill"><span className="live-dot"/> NACHWEIS-MODUS</span>
      <h1>{tab === "event" ? "Event auswählen" : "Nachweise vor Ort"}</h1>
      <p className="mobile-sub">{tab === "event" ? "Wähle das Event, für das du Nachweise erfassen möchtest." : "Aloha Open-Air 2027"}</p>
      {tab === "event" ? <section className="mobile-event-selection" aria-label="Event auswählen">
        <button className="mobile-event-option selected" type="button" aria-pressed="true"><span className="mobile-event-option-icon"><Icon name="calendar" size={17}/></span><span className="mobile-event-option-copy"><strong>Aloha Open-Air 2027</strong><small>10. Juni 2027</small><small>Festivalwiese 23</small></span><span className="mobile-event-option-check"><Icon name="check" size={16}/></span></button>
        <button className="btn btn-primary mobile-event-continue" type="button" onClick={() => setTab("proofs")}><Icon name="camera" size={15}/> Nachweise für Aloha Open-Air 2027</button>
      </section> : <>
        <section className="mobile-progress"><div className="mobile-progress-head"><span>Nachweise im Event</span><b>2 von 3 erledigt</b></div><Progress value={67}/></section>
        <section className="panel table-panel demo-mobile-tasks"><div className="table-head tasks-table-head"><div><h2>Aufgaben im Überblick</h2><p className="subtitle" style={{fontSize:11,marginTop:4}}>2 von 3 abgeschlossen</p></div><label className="mobile-open-tasks-filter"><input type="checkbox" disabled/>Nur offene</label></div>
          <div className="mobile-proof-list">
            <article className="mobile-task"><div className="mobile-task-top"><div className="mobile-task-heading"><h3>Hauptbanner am Eingang platzieren</h3><span className="task-source derived">Sachleistung</span><p>Elspass Autoland · Fällig 12. Juni 2027 · Bearbeiter: Veranstalter</p></div><DemoStatus kind="done">Erledigt</DemoStatus></div><span className="task-proof-file"><Icon name="check" size={13}/>Hauptbanner-Eingang.jpg</span><div className="task-proof-actions compact"><button className="btn task-proof-icon-button" type="button" disabled aria-label="Datei ersetzen"><Icon name="file" size={14}/></button><button className="btn task-proof-icon-button" type="button" disabled aria-label="Foto aufnehmen"><Icon name="camera" size={14}/></button><button className="btn task-proof-icon-button" type="button" disabled aria-label="Nachweis herunterladen"><Icon name="download" size={14}/></button></div></article>
            <article className="mobile-task"><div className="mobile-task-top"><div className="mobile-task-heading"><h3>Sponsorlogo auf der Event-Website einbinden</h3><span className="task-source derived">Sachleistung</span><p>Hellmich Baugesellschaft · Fällig 12. Juni 2027 · Bearbeiter: Veranstalter</p></div><DemoStatus kind="progress">In Bearbeitung</DemoStatus></div><div className="task-proof-actions"><button className="btn task-proof-upload" type="button" disabled><Icon name="file" size={14}/> Datei hochladen</button><button className="btn task-proof-camera" type="button" disabled><Icon name="camera" size={14}/> Foto aufnehmen</button></div></article>
            <article className="mobile-task"><div className="mobile-task-top"><div className="mobile-task-heading"><h3>Social-Media-Beitrag für den Sponsor veröffentlichen</h3><span className="task-source derived">Geldleistung</span><p>Volksbank Rhein-Lippe · Fällig 12. Juni 2027 · Bearbeiter: Sponsor</p></div><DemoStatus kind="waiting">Warte auf Sponsor</DemoStatus></div><span className="task-caption">Wartet auf Sponsorenfreigabe</span></article>
          </div>
        </section>
      </>}
    </main>
    <nav className="mobile-nav" aria-label="Nachweis-Modus"><button type="button" className={tab === "event" ? "active" : ""} aria-pressed={tab === "event"} onClick={() => setTab("event")}><Icon name="calendar" size={17}/>Event</button><button type="button" className={tab === "proofs" ? "active" : ""} aria-pressed={tab === "proofs"} onClick={() => setTab("proofs")}><Icon name="camera" size={17}/>Nachweise</button></nav>
  </div>;
}

export function ProductDemo() {
  const [view, setView] = useState<DemoView>("overview");
  const [role, setRole] = useState<DemoRole>("organizer");
  const views = role === "sponsor" ? sponsorViews : organizerViews;

  function selectRole(nextRole: DemoRole) {
    setRole(nextRole);
    setView("overview");
  }

  return <main className="demo-page">
    <section className="demo-intro"><span className="demo-kicker">INTERAKTIVE PRODUKTDEMO</span><h1>Erlebe sponso im echten Ablauf.</h1><p>Sieh dir Veranstalter- und Sponsorbereich sowie den Event-Modus anhand eines Beispiel-Events an.</p><div className="demo-readonly-note"><span>✓</span><div><b>Feste Beispieldaten · sicher schreibgeschützt</b><small>Die Navigation ist interaktiv. Änderungen an Daten, Dokumenten und Verträgen sind deaktiviert.</small></div></div></section>
    <section className="demo-workspace" aria-label="Interaktive sponso Produktdemo">
      <div className="demo-toolbar"><div><SponsoLogo markSize={27}/><span className="demo-toolbar-separator">/</span><b>Beispiel-Event</b></div><div className="demo-role-switch" role="group" aria-label="Ansicht wählen"><button type="button" className={role === "organizer" ? "active" : ""} aria-pressed={role === "organizer"} onClick={() => selectRole("organizer")}>Veranstalteransicht</button><button type="button" className={role === "eventMode" ? "active" : ""} aria-pressed={role === "eventMode"} onClick={() => selectRole("eventMode")}>Event-Modus (Veranstalter)</button><button type="button" className={role === "sponsor" ? "active" : ""} aria-pressed={role === "sponsor"} onClick={() => selectRole("sponsor")}>Sponsoransicht</button></div><span className="demo-readonly-label">DEMO · NUR ANSEHEN</span></div>
      {role === "eventMode" ? <div className="demo-iphone-stage" aria-label="iPhone-Vorschau, 390 × 844 Pixel"><div className="demo-iphone-frame"><div className="demo-iphone-status" aria-hidden="true"><span>9:41</span><i className="demo-iphone-island"/><span className="demo-iphone-status-icons"><svg className="demo-iphone-wifi" viewBox="0 0 16 13" fill="none" aria-hidden="true"><path d="M1.5 4.4a9.5 9.5 0 0 1 13 0M4.2 7.2a5.6 5.6 0 0 1 7.6 0M6.8 10a1.8 1.8 0 0 1 2.4 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><circle cx="8" cy="12" r=".8" fill="currentColor"/></svg><span className="demo-iphone-battery"><b>82%</b><i><span/></i></span></span></div><div className="demo-iphone-screen"><DemoEventMode/></div></div></div> : <div className="demo-workspace-content">
        {role === "organizer" ? <>
          <div className="page-heading demo-event-page-heading"><div className="event-page-heading-main"><EventLogo/><div><div className="eyebrow">EVENT · IN VORBEREITUNG</div><h1>Aloha Open-Air 2027</h1><p className="subtitle">Stammdaten und Veranstaltungsdetails.</p></div></div><div className="event-heading-actions"><span className="event-lifecycle-status event-lifecycle-blue">Event Status: In Vorbereitung</span><span className="event-plan-badge event-plan-event">Paket: Pro</span><button className="btn" type="button" disabled>Alle Events</button></div></div>
          <DemoTimeline/>
          <nav className="tabs demo-tabs" role="tablist" aria-label="Event-Bereiche">{views.map((item) => <button type="button" role="tab" aria-selected={view === item.id} className={`tab${view === item.id ? " active" : ""}`} onClick={() => setView(item.id)} key={item.id}>{item.label}</button>)}</nav>
          <div className="demo-tab-content" role="tabpanel" key={`${view}-${role}`}>
            {view === "overview" && <EventOverview/>}
            {view === "sponsors" && <OrganizerSponsors/>}
            {view === "work" && <WorkAndEvidence role={role}/>}
            {view === "documents" && <DemoDocuments role={role}/>}
            {view === "report" && <DemoReport/>}
          </div>
        </> : <>
          <div className="sponsor-portal-event-heading"><EventLogo/><div><div className="eyebrow">DEINE PARTNERSCHAFT</div><h1>Aloha Open-Air 2027</h1><p className="subtitle">10. Juni 2027 · Festivalwiese 23</p></div></div>
          <section className="sponsor-portal-contact"><span className="settings-section-icon"><Icon name="users" size={16}/></span><div><b>Deine Ansprechperson</b><strong>Jonas Kastenholz</strong><span>jonas@sponso.de · 0175 34396572</span></div></section>
          <p className="sponsor-portal-assignment-name">Sponsor: Elspass Autoland GmbH</p>
          <nav className="sponsor-portal-tabs demo-sponsor-tabs" role="tablist" aria-label="Sponsor Event-Bereiche">{views.map((item) => <button type="button" role="tab" aria-selected={view === item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)} key={item.id}>{item.label}</button>)}</nav>
          <div className="demo-tab-content" role="tabpanel" key={`${view}-${role}`}>
            {view === "overview" && <><section className="panel sponsor-portal-detail-panel"><div className="sponsor-portal-tab-heading"><h2>Deine Partnerschaft</h2><p>Hier findest du die wichtigsten Informationen zu deinem Sponsoring.</p></div><div className="sponsor-contract-detail-grid"><div><span>Vereinbarte Leistungen</span><b>4</b></div><div><span>Vertragswert netto</span><b>5.000,00 €</b></div><div><span>Leistungsfortschritt</span><Progress value={75}/></div></div></section><WorkAndEvidence role={role}/></>}
            {view === "sponsors" && <SponsorContract/>}
            {view === "work" && <WorkAndEvidence role={role}/>}
            {view === "documents" && <DemoDocuments role={role}/>}
          </div>
        </>}
      </div>}
    </section>
    <section className="demo-next-step"><div><span className="demo-kicker">BEREIT FÜR DEIN EVENT?</span><h2>Bring dein Sponsoring an einen Ort.</h2><p>Starte mit deinem eigenen Veranstalterbereich und richte dein erstes Event ein.</p></div><div><Link className="btn btn-primary" href="/login?type=organizer&mode=signup">Kostenlos starten <span aria-hidden="true">→</span></Link><Link className="demo-contact-link" href="/kontakt">Fragen? Sprich mit uns</Link></div></section>
  </main>;
}
