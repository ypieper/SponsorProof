import type { Metadata } from "next";
import Link from "next/link";
import { PublicPageFrame } from "@/components/public-page-frame";
import { LandingMotion } from "./landing/landing-motion";

export const metadata: Metadata = {
  title: "Sponsoringmanagement für Veranstalter",
  description: "Mit sponso verwaltest du Sponsoren, Vereinbarungen, Aufgaben und Nachweise für deine Veranstaltung an einem Ort.",
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    locale: "de_DE",
    siteName: "sponso",
    title: "sponso – Sponsoring einfach organisiert",
    description: "Von der Vereinbarung bis zum Leistungsnachweis: Sponsoring für Veranstaltungen an einem Ort organisieren.",
    url: "/",
  },
  twitter: {
    card: "summary",
    title: "sponso – Sponsoring einfach organisiert",
    description: "Sponsoren, Leistungen, Aufgaben und Nachweise für dein Event zentral verwalten.",
  },
};

const workflow = [
  { number: "01", title: "Vereinbaren", text: "Verwalte Sponsoren, Verträge und vereinbarte Leistungen direkt im Event." },
  { number: "02", title: "Organisieren", text: "Leite aus Sponsoringleistungen konkrete Aufgaben für dein Team ab." },
  { number: "03", title: "Dokumentieren", text: "Halte Fotos, Dateien und den Erfüllungsstand nachvollziehbar fest." },
  { number: "04", title: "Belegen", text: "Erstelle für jeden Sponsor einen strukturierten Leistungsnachweis." },
];

export default function LandingPage() {
  return <PublicPageFrame brandHref="/">
    <LandingMotion><main className="landing-page">
      <section className="landing-hero">
        <div className="landing-hero-copy landing-reveal landing-reveal-left">
          <span className="landing-eyebrow">SPONSORING FÜR VERANSTALTER</span>
          <h1>Weniger Abstimmung.<br/><span>Mehr Überblick.</span></h1>
          <p>Von der Vereinbarung bis zum Leistungsnachweis – alles rund um Sponsoring an einem Ort.</p>
          <div className="landing-hero-actions">
            <Link className="btn btn-primary" href="/login?type=organizer&mode=signup">Als Veranstalter starten <span aria-hidden="true">→</span></Link>
            <Link className="landing-text-link" href="#ablauf">So funktioniert sponso <span aria-hidden="true">↓</span></Link>
          </div>
          <div className="landing-audience">Für Festivals, Stadtfeste, Vereine und Open-Air-Events</div>
        </div>
        <div className="landing-hero-visual landing-reveal landing-reveal-right" aria-label="Sponsoringablauf vom Sponsor bis zum Leistungsnachweis">
          <div className="landing-visual-orbit landing-visual-orbit-one" />
          <div className="landing-visual-orbit landing-visual-orbit-two" />
          <div className="landing-flow-card">
            <span className="landing-flow-label">DEIN EVENT</span>
            <div className="landing-flow-row"><span className="landing-flow-icon sponsor">S</span><div><b>Sponsor</b><small>Vereinbarung & Kontakt</small></div><span className="landing-flow-check">✓</span></div>
            <div className="landing-flow-connector" />
            <div className="landing-flow-row"><span className="landing-flow-icon benefit">↗</span><div><b>Leistungen</b><small>Aufgaben fürs Team</small></div><span className="landing-flow-check">✓</span></div>
            <div className="landing-flow-connector" />
            <div className="landing-flow-row"><span className="landing-flow-icon proof">▣</span><div><b>Nachweise</b><small>Dokumentiert & gebündelt</small></div><span className="landing-flow-check">✓</span></div>
            <div className="landing-flow-footer"><span className="landing-flow-dot"/>Ein gemeinsamer Stand für alle</div>
          </div>
        </div>
      </section>

      <section className="landing-problem landing-reveal" aria-label="Herausforderung im Sponsoringalltag">
        <p>Wenn Absprachen, Aufgaben und Fotos an verschiedenen Orten liegen, kostet jeder nächste Schritt Zeit.</p>
        <span>Ein klarer Ablauf hilft deinem Team, den Überblick zu behalten.</span>
      </section>

      <section className="landing-workflow" id="ablauf">
        <div className="landing-section-heading landing-reveal">
          <span className="landing-eyebrow">EIN DURCHGÄNGIGER PROZESS</span>
          <h2>Vom Sponsoring-Deal zum sichtbaren Ergebnis.</h2>
          <p>sponso verbindet Vereinbarungen, Aufgaben und Nachweise in einem Event.</p>
        </div>
        <div className="landing-steps">
          {workflow.map((step, index) => <article className={`landing-step landing-reveal landing-reveal-delay-${index + 1}`} key={step.number}>
            <span className="landing-step-number">{step.number}</span>
            <h3>{step.title}</h3>
            <p>{step.text}</p>
          </article>)}
        </div>
      </section>

      <section className="landing-collaboration">
        <div className="landing-section-heading landing-reveal">
          <span className="landing-eyebrow">GEMEINSAMER ARBEITSSTAND</span>
          <h2>Auch Sponsoren sind eingebunden.</h2>
          <p>Ein eigener Bereich macht Vereinbarungen und den Dateiaustausch für beide Seiten nachvollziehbar.</p>
        </div>
        <div className="landing-collaboration-grid">
          <article className="landing-reveal landing-reveal-delay-1">
            <span className="landing-audience-tag">VERANSTALTER</span>
            <h3>Du behältst den Überblick.</h3>
            <ul><li>Leistungen und Aufgaben je Sponsor</li><li>Erfüllungsstand direkt im Event</li><li>Dokumente mit Herkunft und Upload-Zeit</li></ul>
          </article>
          <article className="landing-reveal landing-reveal-delay-2">
            <span className="landing-audience-tag sponsor-tag">SPONSOR</span>
            <h3>Dein Partner arbeitet mit.</h3>
            <ul><li>Vereinbarte Leistungen erneut einsehen</li><li>Angeforderte Unterlagen hochladen</li><li>Bereitgestellte Dokumente abrufen</li></ul>
          </article>
        </div>
      </section>

      <section className="landing-final-cta landing-reveal">
        <div><span className="landing-eyebrow">SPONSO · SPONSORING EINFACH ORGANISIERT</span><h2>Mach dein nächstes Event übersichtlicher.</h2><p>Bring Vereinbarungen, Umsetzung und Nachweise an einem Ort zusammen.</p></div>
        <div className="landing-final-actions"><Link className="btn btn-primary" href="/login?type=organizer&mode=signup">Als Veranstalter starten <span aria-hidden="true">→</span></Link><Link className="landing-final-contact" href="/kontakt">Fragen? Schreib uns</Link></div>
      </section>
    </main></LandingMotion>
  </PublicPageFrame>;
}
