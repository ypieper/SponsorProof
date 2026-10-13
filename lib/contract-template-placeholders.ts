export const contractTemplatePlaceholders = [
  {
    title: "Veranstalter",
    fields: [
      ["{{veranstalter.name}}", "Bezeichnung"],
      ["{{veranstalter.strasse}}", "Straße und Hausnummer"],
      ["{{veranstalter.plz}}", "Postleitzahl"],
      ["{{veranstalter.ort}}", "Ort"],
      ["{{veranstalter.iban}}", "IBAN"],
      ["{{veranstalter.bic}}", "BIC"],
      ["{{veranstalter.bank}}", "Kreditinstitut"],
      ["{{veranstalter.ansprechperson}}", "Vor- und Nachname"],
      ["{{veranstalter.email}}", "E-Mail"],
      ["{{veranstalter.telefon}}", "Telefon"],
    ],
  },
  {
    title: "Sponsor",
    fields: [
      ["{{sponsor.name}}", "Name des Sponsors"],
      ["{{sponsor.strasse}}", "Straße und Hausnummer"],
      ["{{sponsor.plz}}", "Postleitzahl"],
      ["{{sponsor.ort}}", "Ort"],
      ["{{sponsor.ansprechperson}}", "Vor- und Nachname"],
      ["{{sponsor.email}}", "E-Mail"],
      ["{{sponsor.telefon}}", "Telefon"],
      ["{{sponsor.ust_id}}", "Umsatzsteuer-ID"],
      ["{{sponsor.iban}}", "IBAN"],
      ["{{sponsor.bic}}", "BIC"],
      ["{{sponsor.bank}}", "Kreditinstitut"],
    ],
  },
  {
    title: "Event",
    fields: [
      ["{{event.name}}", "Eventname"],
      ["{{event.beginn}}", "Beginn"],
      ["{{event.ende}}", "Ende"],
      ["{{event.ort}}", "Veranstaltungsort"],
      ["{{event.verantwortliche_person}}", "Verantwortliche Person"],
    ],
  },
  {
    title: "Vertrag und Leistungen",
    fields: [
      ["{{vertrag.wert}}", "Vertragswert netto"],
      ["{{vertrag.wert_brutto}}", "Vertragswert brutto"],
      ["{{vertrag.datum}}", "Datum der Vertragsunterzeichnung"],
      ["{{aktuelles_datum}}", "Aktuelles Datum bei Vertragserstellung"],
      ["{{@leistungen}}", "Alle vereinbarten Leistungen mit fettgedrucktem Namen und darunterliegender Beschreibung"],
    ],
  },
] as const;

export const contractTemplateFields = contractTemplatePlaceholders.flatMap((group) => group.fields.map(([marker]) => marker));
