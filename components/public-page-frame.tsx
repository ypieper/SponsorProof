import Link from "next/link";
import { SponsoLogo } from "@/components/ui";

const links = [
  ["AGB", "/agb"],
  ["Impressum", "/impressum"],
  ["Datenschutz", "/datenschutz"],
  ["Kontakt", "/kontakt"],
] as const;

export function PublicPageFrame({ children }: { children: React.ReactNode }) {
  return <div className="public-site-shell">
    <header className="public-site-header"><Link href="/" aria-label="sponso öffnen"><SponsoLogo /></Link><Link className="btn" href="/login">Zur Anmeldung</Link></header>
    {children}
    <footer className="public-site-footer"><span>© {new Date().getFullYear()} sponso</span><nav aria-label="Rechtliche Hinweise">{links.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}</nav></footer>
  </div>;
}

export type LegalSection = { title: string; paragraphs: string[]; bullets?: string[] };

export function LegalPage({ title, intro, sections }: { title: string; intro: string; sections: LegalSection[] }) {
  return <PublicPageFrame>
    <main className="public-page-content">
      <div className="eyebrow">SPONSO · ENTWURF</div>
      <h1>{title}</h1>
      <p className="public-page-intro">{intro}</p>
      <aside className="legal-draft-notice"><strong>Vorschlag – noch nicht veröffentlichen</strong><span>Die Angaben in eckigen Klammern müssen ergänzt werden. Bitte den Entwurf vor dem produktiven Einsatz rechtlich prüfen lassen.</span></aside>
      <article className="panel legal-document">{sections.map((section) => <section key={section.title}><h2>{section.title}</h2>{section.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}{section.bullets && <ul>{section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>}</section>)}</article>
    </main>
  </PublicPageFrame>;
}
