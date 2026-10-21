"use client";

import { Icon } from "@/components/ui";

export function DemoSponsorInvoice({ sponsorName }: { sponsorName: string }) {
  return <section className="panel sponsor-invoice-area">
    <div className="table-head"><div><h2>Rechnung</h2><p className="subtitle" style={{ fontSize: 11, marginTop: 4 }}>Veröffentlichte Rechnungen für {sponsorName} in diesem Event.</p></div></div>
    <article className="sponsor-invoice-total-card"><span>Gesamtrechnungswert (netto)</span><strong>5.000,00&nbsp;€</strong></article>
    <div className="sponsor-invoice-list"><article className="sponsor-invoice-card">
      <header className="sponsor-invoice-card-head"><div><span className="sponsor-invoice-card-label">Beispieldatensatz</span><b>Rechnung RE-2027-014</b></div><div className="sponsor-invoice-card-statuses"><span className="sponsor-invoice-payment-status unpaid">Offen</span></div></header>
      <div className="sponsor-invoice-grid">
        <label className="settings-field"><span>Rechnungsnummer</span><input type="text" value="RE-2027-014" disabled readOnly /></label>
        <label className="settings-field"><span>Rechnungsdatum</span><input type="text" value="10.06.2027" disabled readOnly /></label>
        <label className="settings-field"><span>Fällig am</span><input type="text" value="24.06.2027" disabled readOnly /></label>
        <label className="settings-field"><span>Versanddatum</span><input type="text" value="10.06.2027" disabled readOnly /></label>
        <label className="settings-field"><span>Nettobetrag</span><input type="text" value="5.000,00 €" disabled readOnly /></label>
        <label className="settings-field"><span>Bruttobetrag</span><input type="text" value="5.950,00 €" disabled readOnly /></label>
      </div>
      <div className="sponsor-invoice-file-row"><span>Beispielhafte Rechnungsangaben</span><button className="btn" type="button" disabled title="In der Demo nicht verfügbar"><Icon name="file" size={14}/> Rechnung herunterladen</button></div>
    </article><p className="sponsor-invoice-vat-note">Diese Angaben sind Beispieldaten. In der Demo wird keine Rechnung erstellt oder heruntergeladen.</p></div>
  </section>;
}
