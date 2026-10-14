import { PublicContactForm } from "@/components/public-contact-form";
import { PublicPageFrame } from "@/components/public-page-frame";

export default async function ContactPage({ searchParams }: { searchParams: Promise<{ anliegen?: string }> }) {
  const params = await searchParams;
  const defaultSubject = params.anliegen === "enterprise" ? "Enterprise-Anfrage" : "Allgemeine Anfrage";
  return <PublicPageFrame>
    <main className="public-page-content public-contact-content">
      <div className="eyebrow">WIR HELFEN GERNE</div>
      <h1>Kontakt</h1>
      <p className="public-page-intro">Schreib uns, wenn du Fragen zu sponso oder zur Enterprise-Edition hast. Wir melden uns per E-Mail bei dir.</p>
      <PublicContactForm defaultSubject={defaultSubject}/>
    </main>
  </PublicPageFrame>;
}
