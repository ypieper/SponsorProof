import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import type { Sponsor, SponsorContract } from "@/lib/sponsor-types";
import { formatContractValue } from "@/lib/event-contract-values";
import type { StoredEvent } from "@/lib/events-storage";

type Benefit = { title: string; category: string; description: string; quantity?: number; dueAt?: string };
type Organizer = { organization: string; street: string; streetNumber: string; postalCode: string; city: string; iban: string; bic: string; bank: string; firstName: string; lastName: string; email: string; phone: string };

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function xmlTextRuns(value: string) {
  return value.split(/\r?\n/).map((line, index) => `${index ? "<w:br/>" : ""}<w:t xml:space="preserve">${escapeXml(line)}</w:t>`).join("");
}

function findBenefitsParagraphProperties(zip: PizZip) {
  for (const name of Object.keys(zip.files)) {
    if (!name.startsWith("word/") || !name.endsWith(".xml")) continue;
    const xml = zip.file(name)?.asText();
    if (!xml) continue;
    const paragraphs = xml.match(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g) ?? [];
    const markerParagraph = paragraphs.find((paragraph) => paragraph.includes("{{@leistungen}}"));
    const paragraphProperties = markerParagraph?.match(/<w:pPr\b[\s\S]*?<\/w:pPr>/)?.[0];
    if (paragraphProperties) return paragraphProperties.replace(/<w:numPr\b[\s\S]*?<\/w:numPr>/g, "");
  }
  return "";
}

function benefitsXml(benefits: Benefit[], paragraphProperties: string) {
  const paragraph = (runs: string) => `<w:p>${paragraphProperties}${runs}</w:p>`;
  if (!benefits.length) {
    return paragraph(`<w:r><w:t xml:space="preserve">Für diesen Vertrag sind noch keine einzelnen Leistungen erfasst.</w:t></w:r>`);
  }
  return benefits.map((benefit, index) => {
    const label = (benefit.quantity ?? 1) > 1 ? `${benefit.quantity} × ${benefit.title}` : benefit.title;
    const title = paragraph(`<w:r><w:rPr><w:b/></w:rPr>${xmlTextRuns(label)}</w:r>`);
    const description = benefit.description
      ? paragraph(`<w:r><w:rPr><w:b w:val="0"/></w:rPr>${xmlTextRuns(benefit.description)}</w:r>`)
      : "";
    return `${index ? paragraph("") : ""}${title}${description}`;
  }).join("");
}

function upgradeLegacyBenefitsPlaceholder(zip: PizZip) {
  for (const name of Object.keys(zip.files)) {
    if (!name.startsWith("word/") || !name.endsWith(".xml")) continue;
    const file = zip.file(name);
    if (!file) continue;
    const xml = file.asText();
    if (xml.includes("{{leistungen}}")) zip.file(name, xml.replaceAll("{{leistungen}}", "{{@leistungen}}"));
  }
}

function formatDate(value: string | null | undefined) {
  if (!value) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "long", year: "numeric" }).format(date);
}

export function fillContractTemplate(template: Blob, input: {
  organizer: Partial<Organizer>;
  sponsor: Sponsor;
  contract: SponsorContract;
  grossValue?: number | null;
  event: StoredEvent;
  benefits: Benefit[];
}) {
  return template.arrayBuffer().then((buffer) => {
    const zip = new PizZip(new Uint8Array(buffer));
    upgradeLegacyBenefitsPlaceholder(zip);
    const benefitsParagraphProperties = findBenefitsParagraphProperties(zip);
    const amount = Number.parseFloat(input.contract.value.replace(/[^0-9,.-]/g, "").replace(/\./g, "").replace(",", "."));
    const values: Record<string, string> = {
      "veranstalter.name": input.organizer.organization ?? "",
      "veranstalter.strasse": [input.organizer.street, input.organizer.streetNumber].filter(Boolean).join(" "),
      "veranstalter.plz": input.organizer.postalCode ?? "",
      "veranstalter.ort": input.organizer.city ?? "",
      "veranstalter.iban": input.organizer.iban ?? "",
      "veranstalter.bic": input.organizer.bic ?? "",
      "veranstalter.bank": input.organizer.bank ?? "",
      "veranstalter.ansprechperson": [input.organizer.firstName, input.organizer.lastName].filter(Boolean).join(" "),
      "veranstalter.email": input.organizer.email ?? "",
      "veranstalter.telefon": input.organizer.phone ?? "",
      "sponsor.name": input.sponsor.name,
      "sponsor.strasse": [input.sponsor.street, input.sponsor.streetNumber].filter(Boolean).join(" "),
      "sponsor.plz": input.sponsor.postalCode ?? "",
      "sponsor.ort": input.sponsor.city ?? "",
      "sponsor.ansprechperson": [input.sponsor.contactFirstName, input.sponsor.contactLastName].filter(Boolean).join(" "),
      "sponsor.email": input.sponsor.email ?? "",
      "sponsor.telefon": input.sponsor.phone ?? "",
      "sponsor.ust_id": input.sponsor.vatId ?? "",
      "sponsor.iban": input.sponsor.iban ?? "",
      "sponsor.bic": input.sponsor.bic ?? "",
      "sponsor.bank": input.sponsor.bank ?? "",
      "event.name": input.event.title,
      "event.beginn": formatDate(input.event.startDate),
      "event.ende": formatDate(input.event.endDate),
      "event.ort": input.event.location,
      "event.verantwortliche_person": input.event.responsible,
      "vertrag.wert": Number.isFinite(amount) ? formatContractValue(amount) : input.contract.value,
      "vertrag.wert_brutto": typeof input.grossValue === "number" && Number.isFinite(input.grossValue) ? formatContractValue(input.grossValue) : "",
      "vertrag.datum": formatDate(input.contract.signedAt),
      "aktuelles_datum": new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "long", year: "numeric" }).format(new Date()),
      leistungen: benefitsXml(input.benefits, benefitsParagraphProperties),
    };
    const document = new Docxtemplater(zip, {
      delimiters: { start: "{{", end: "}}" },
      linebreaks: true,
      nullGetter: () => "",
      parser: (tag) => ({ get: () => values[tag] ?? "" }),
    });
    document.render({});
    return document.getZip().generate({
      type: "blob",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      compression: "DEFLATE",
    });
  });
}

export function contractFilename(sponsorName: string, eventTitle: string, extension: "docx" | "pdf") {
  const base = `Vertrag-${sponsorName}-${eventTitle}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-|-$/g, "");
  return `${base || "Vertrag"}.${extension}`;
}
