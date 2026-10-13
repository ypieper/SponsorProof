export type Sponsor = { id: string; eventId: string; name: string; initials: string; value: string; progress: number; status: "Erfüllt" | "In Arbeit" | "Offen"; color?: string; legalForm?: string; street?: string; streetNumber?: string; postalCode?: string; city?: string; contactFirstName?: string; contactLastName?: string; email?: string; phone?: string; vatId?: string; iban?: string; bic?: string; bank?: string };
export type SponsorContract = { id: string; sponsorId: string; eventId: string; title: string; value: string; progress: number; status: "Erfüllt" | "In Arbeit" | "Offen"; signedAt: string };

export const events = [
  { id: "open-air-kino-2027", title: "Open-Air-Kino 2027", date: "31. Mai — 05. Juni 2027", location: "Tempelhofer Feld, Berlin", status: "In Vorbereitung", active: true, sponsorship: 38500, sponsors: 16, completed: 61, benefits: 74 },
];

export const sponsors: Sponsor[] = [
  { id: "sparkasse", eventId: "open-air-kino-2027", name: "Sparkasse", initials: "SPK", value: "5.000 €", progress: 82, status: "In Arbeit", color: "#e5352b" },
  { id: "veltins", eventId: "open-air-kino-2027", name: "Veltins", initials: "V", value: "4.000 €", progress: 100, status: "Erfüllt", color: "#168466" },
  { id: "stadtwerke-mitte", eventId: "open-air-kino-2027", name: "Stadtwerke Mitte", initials: "SM", value: "3.500 €", progress: 67, status: "In Arbeit", color: "#5281ab" },
  { id: "autohaus-koenig", eventId: "open-air-kino-2027", name: "Autohaus König", initials: "AK", value: "2.500 €", progress: 45, status: "Offen", color: "#8573ab" },
  { id: "baeckerei-huber", eventId: "open-air-kino-2027", name: "Bäckerei Huber", initials: "BH", value: "1.500 €", progress: 100, status: "Erfüllt", color: "#b2824b" },
];

export const sponsorContracts: SponsorContract[] = [
  { id: "sparkasse-open-air-kino-2027", sponsorId: "sparkasse", eventId: "open-air-kino-2027", title: "Sponsoringvertrag", value: "5.000 €", progress: 82, status: "In Arbeit", signedAt: "12. Januar 2027" },
  { id: "veltins-open-air-kino-2027", sponsorId: "veltins", eventId: "open-air-kino-2027", title: "Sponsoringvertrag", value: "4.000 €", progress: 100, status: "Erfüllt", signedAt: "18. Januar 2027" },
  { id: "stadtwerke-mitte-open-air-kino-2027", sponsorId: "stadtwerke-mitte", eventId: "open-air-kino-2027", title: "Sponsoringvertrag", value: "3.500 €", progress: 67, status: "In Arbeit", signedAt: "20. Januar 2027" },
  { id: "autohaus-koenig-open-air-kino-2027", sponsorId: "autohaus-koenig", eventId: "open-air-kino-2027", title: "Sponsoringvertrag", value: "2.500 €", progress: 45, status: "Offen", signedAt: "22. Januar 2027" },
  { id: "baeckerei-huber-open-air-kino-2027", sponsorId: "baeckerei-huber", eventId: "open-air-kino-2027", title: "Sponsoringvertrag", value: "1.500 €", progress: 100, status: "Erfüllt", signedAt: "24. Januar 2027" },
];

export const tasks = [
  { title: "Hauptbanner am Eingang anbringen", sponsor: "Sparkasse", due: "Heute", status: "Offen" },
  { title: "Instagram-Post veröffentlichen", sponsor: "Stadtwerke Mitte", due: "Morgen", status: "Offen" },
  { title: "VIP-Tickets übergeben", sponsor: "Autohaus König", due: "In 2 Tagen", status: "In Arbeit" },
];

export const benefits = [
  { title: "Hauptbanner am Eingang", category: "Werbung", description: "Prominente Logo-Platzierung auf dem Hauptbanner im Eingangsbereich.", status: "In Arbeit", evidence: "2 Fotos", sponsorId: "sparkasse", eventId: "open-air-kino-2027" },
  { title: "Logo auf Website", category: "Werbung", description: "Logo mit Verlinkung auf der Event-Website im Sponsorenbereich.", status: "Erfüllt", evidence: "Screenshot", sponsorId: "sparkasse", eventId: "open-air-kino-2027" },
  { title: "Instagram-Post", category: "Social Media", description: "Eigener Beitrag mit Sponsor-Erwähnung und Verlinkung.", status: "Offen", evidence: "Noch kein Nachweis", sponsorId: "stadtwerke-mitte", eventId: "open-air-kino-2027" },
  { title: "VIP-Tickets", category: "Hospitality", description: "10 VIP-Tickets für den Veranstaltungsabend.", status: "Erfüllt", evidence: "1 Foto", sponsorId: "autohaus-koenig", eventId: "open-air-kino-2027" },
];

export const blocks = [
  { title: "Hauptbanner", category: "Werbung", description: "Logo auf dem zentralen Veranstaltungsbanner am Eingang.", detail: "Platzierung · groß", value: "ab 1.500 €" },
  { title: "Website-Logo", category: "Werbung", description: "Logo und Link im offiziellen Online-Sponsorenbereich.", detail: "Online · dauerhaft", value: "ab 350 €" },
  { title: "Instagram-Post", category: "Social Media", description: "Ein Feed-Beitrag mit Markierung und Sponsor-Text.", detail: "1 Beitrag", value: "ab 250 €" },
  { title: "Story-Erwähnung", category: "Social Media", description: "Markierte Story während der Veranstaltungswoche.", detail: "Instagram · 24 h", value: "ab 150 €" },
  { title: "VIP-Tickets", category: "Hospitality", description: "Einladung für Gäste mit Zugang zum VIP-Bereich.", detail: "je 2 Tickets", value: "ab 180 €" },
  { title: "Backstage-Führung", category: "Hospitality", description: "Persönliche Führung hinter den Kulissen des Events.", detail: "bis 6 Personen", value: "ab 400 €" },
];
