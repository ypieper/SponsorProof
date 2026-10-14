"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";
import type { Sponsor, SponsorContract } from "@/lib/sponsor-types";
import { EmptyState, Icon, Progress, Status } from "@/components/ui";
import { contractDateForInput } from "@/lib/event-contract-dates";
import { formatContractValue, parseContractValue, parseContractValueInput } from "@/lib/event-contract-values";
import { contractFilename, fillContractTemplate } from "@/lib/render-contract-template";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createStoredBenefits, fetchStoredBenefits, type StoredBenefit } from "@/lib/benefits-storage";
import { fetchStoredTasks } from "@/lib/tasks-storage";
import { fetchStoredEvidence } from "@/lib/evidence-storage";
import { deleteContractDocument, downloadContractDocument, fetchContractDocuments, saveContractDocument, type ContractDocument } from "@/lib/contract-documents-storage";
import { updateContractRecord } from "@/lib/sponsors-storage";
import { fetchOrganizerSettings } from "@/lib/organization-settings-storage";

type Block = { title: string; category: string; description: string; detail: string };
type BenefitTemplate = Pick<Block, "title" | "category" | "description" | "detail">;
type EventBenefit = { id?: string; title: string; category: string; description: string; detail?: string; status: string; evidence: string; sponsorId: string; eventId: string; dueAt?: string };
type ManualTask = { id: string; title: string };
type StoredGeneratedContracts = { pdf?: ContractDocument; docx?: ContractDocument };
type AssignedTemplate = { name: string; storagePath: string; file: Blob };

function grossValueFromNet(netValue: number) {
  return Math.round((netValue * 1.19 + Number.EPSILON) * 100) / 100;
}

function normalizeBenefitTitle(title: string) {
  return title.trim().replace(/\s+/g, " ").toLocaleLowerCase("de-DE");
}

function storedBenefitToEventBenefit(benefit: StoredBenefit): EventBenefit {
  return { id: benefit.id, title: benefit.title, category: benefit.category, description: benefit.description, detail: benefit.detail, status: benefit.status, evidence: benefit.evidence, sponsorId: benefit.sponsorId ?? "", eventId: benefit.eventId, dueAt: benefit.dueAt };
}

function benefitTaskId(eventId: string, benefit: EventBenefit) {
  return benefit.id ? `benefit-${benefit.id}` : `benefit-${eventId}-${benefit.title.toLocaleLowerCase("de-DE").replace(/[^a-z0-9]+/g, "-")}`;
}

function pdfTextHex(value: string) {
  const winAnsiSpecials: Record<string, number> = { "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85, "†": 0x86, "‡": 0x87, "ˆ": 0x88, "‰": 0x89, "Š": 0x8a, "‹": 0x8b, "Œ": 0x8c, "Ž": 0x8e, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "˜": 0x98, "™": 0x99, "š": 0x9a, "›": 0x9b, "œ": 0x9c, "ž": 0x9e, "Ÿ": 0x9f };
  return Array.from(value).map((character) => {
    const code = winAnsiSpecials[character] ?? character.codePointAt(0) ?? 0x3f;
    return (code <= 0xff ? code : 0x3f).toString(16).padStart(2, "0");
  }).join("").toUpperCase();
}

function wrapPdfText(value: string, maxLength = 88) {
  const words = value.trim().split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (line && `${line} ${word}`.length > maxLength) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function buildContractPdf(lines: { text: string; size?: number; bold?: boolean; gap?: number }[]) {
  const pages: typeof lines[] = [];
  let page: typeof lines = [];
  let usedHeight = 0;
  for (const line of lines) {
    const wrapped = wrapPdfText(line.text, line.size && line.size > 12 ? 64 : 88);
    for (const [index, text] of wrapped.entries()) {
      const item = { ...line, text, size: index === 0 ? line.size : 10, gap: index === 0 ? line.gap : 2 };
      const height = (item.size ?? 10) + (item.gap ?? 8);
      if (usedHeight + height > 730 && page.length) {
        pages.push(page);
        page = [];
        usedHeight = 0;
      }
      page.push(item);
      usedHeight += height;
    }
  }
  if (page.length || pages.length === 0) pages.push(page);

  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  ];
  const pageRefs: string[] = [];
  pages.forEach((pageLines, index) => {
    const pageObjectNumber = 5 + index * 2;
    const contentObjectNumber = pageObjectNumber + 1;
    pageRefs.push(`${pageObjectNumber} 0 R`);
    let y = 790;
    const stream = pageLines.map((line) => {
      const size = line.size ?? 10;
      const font = line.bold ? "F2" : "F1";
      const draw = `BT /${font} ${size} Tf 48 ${y} Td <${pdfTextHex(line.text)}> Tj ET`;
      y -= size + (line.gap ?? 8);
      return draw;
    }).join("\n");
    objects[pageObjectNumber - 1] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`;
    objects[contentObjectNumber - 1] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });
  objects[1] = `<< /Type /Pages /Kids [${pageRefs.join(" ")}] /Count ${pages.length} >>`;

  let document = "%PDF-1.4\n% sponso\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(document.length);
    document += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = document.length;
  document += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => { document += `${String(offset).padStart(10, "0")} 00000 n \n`; });
  document += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new Blob([document], { type: "application/pdf" });
}

export function EventSponsorDetail({ eventId, eventTitle, eventStartDate, eventEndDate, eventLocation, eventResponsible, sponsor, contract, baseBenefits, blocks }: {
  eventId: string;
  eventTitle: string;
  eventStartDate: string;
  eventEndDate: string;
  eventLocation: string;
  eventResponsible: string;
  sponsor: Sponsor;
  contract: SponsorContract;
  baseBenefits: EventBenefit[];
  blocks: Block[];
}) {
  const [addedBenefits, setAddedBenefits] = useState<EventBenefit[]>([]);
  const [availableBlocks, setAvailableBlocks] = useState(blocks);
  const [blocksLoading, setBlocksLoading] = useState(isSupabaseConfigured);
  const [blocksLoadError, setBlocksLoadError] = useState("");
  const [adding, setAdding] = useState(false);
  const [selectedBlocks, setSelectedBlocks] = useState<string[]>([]);
  const [benefitDueDates, setBenefitDueDates] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [signedOn, setSignedOn] = useState(() => contractDateForInput(contract.signedAt));
  const [evidenceTaskIds, setEvidenceTaskIds] = useState<string[]>([]);
  const [manualTasks, setManualTasks] = useState<ManualTask[]>([]);
  const [generatedContracts, setGeneratedContracts] = useState<StoredGeneratedContracts | null>(null);
  const [contractAmountInput, setContractAmountInput] = useState(() => String(parseContractValue(contract.value)));
  const [contractAmountFocused, setContractAmountFocused] = useState(false);
  const [grossContractAmountInput, setGrossContractAmountInput] = useState(() => String(parseContractValue(contract.grossValue ?? "") || grossValueFromNet(parseContractValue(contract.value))));
  const [grossContractAmountFocused, setGrossContractAmountFocused] = useState(false);
  const [grossContractAmountManuallyEdited, setGrossContractAmountManuallyEdited] = useState(false);
  const [signedContractFile, setSignedContractFile] = useState<ContractDocument | null>(null);
  const [showContractOutput, setShowContractOutput] = useState(false);
  const [contractTemplate, setContractTemplate] = useState<AssignedTemplate | null>(null);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [templateLoadMessage, setTemplateLoadMessage] = useState("");
  const [creatingContract, setCreatingContract] = useState<"pdf" | "docx" | null>(null);
  const [printReady, setPrintReady] = useState(false);
  const printPreviewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await fetchStoredBenefits(eventId);
        if (result.error) throw result.error;
        if (!cancelled) setAddedBenefits(result.data.filter((benefit) => benefit.sponsorId === sponsor.id).map(storedBenefitToEventBenefit));
        const [documents, tasks, evidence] = await Promise.all([fetchContractDocuments(contract.id), fetchStoredTasks(eventId), fetchStoredEvidence()]);
        if (documents.error || tasks.error || evidence.error) throw documents.error ?? tasks.error ?? evidence.error;
        if (cancelled) return;
        setGeneratedContracts({ pdf: documents.data?.find((document) => document.kind === "generated_pdf"), docx: documents.data?.find((document) => document.kind === "generated_docx") });
        setSignedContractFile(documents.data?.find((document) => document.kind === "signed") ?? null);
        setManualTasks((tasks.data ?? []).filter((task) => task.event_id === eventId && task.source === "Manuell" && task.sponsor_id === sponsor.id).map((task) => ({ id: task.id, title: task.title })));
        setEvidenceTaskIds((evidence.data ?? []).map((item) => item.taskId));
        setContractAmountInput(String(parseContractValue(contract.value)));
        const grossValue = parseContractValue(contract.grossValue ?? "") || grossValueFromNet(parseContractValue(contract.value));
        setGrossContractAmountInput(String(grossValue));
        setGrossContractAmountManuallyEdited(grossValue !== grossValueFromNet(parseContractValue(contract.value)));
        setSignedOn(contractDateForInput(contract.signedAt));
      } catch {
        if (!cancelled) setMessage("Daten konnten nicht aus Supabase geladen werden.");
      }
    })();
    return () => { cancelled = true; };
  }, [contract.id, eventId, sponsor.id]);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setBlocksLoading(false);
      return;
    }

    let cancelled = false;
    async function loadBenefitTemplates() {
      try {
        const { data, error } = await createClient()
          .from("benefit_templates")
          .select("title, category, description, detail")
          .order("created_at", { ascending: true });
        if (error) throw error;
        if (!cancelled) {
          const templates = (data ?? []) as BenefitTemplate[];
          setAvailableBlocks(templates.length > 0 ? templates : blocks);
          setBlocksLoadError("");
        }
      } catch {
        if (!cancelled) {
          setAvailableBlocks(blocks);
          setBlocksLoadError("Die Bausteine konnten nicht aus deiner Bibliothek geladen werden.");
        }
      } finally {
        if (!cancelled) setBlocksLoading(false);
      }
    }

    void loadBenefitTemplates();
    return () => { cancelled = true; };
  }, []);

  const benefits = useMemo(() => [...baseBenefits, ...addedBenefits], [baseBenefits, addedBenefits]);
  const existingBenefitTitles = new Set(benefits.map((benefit) => normalizeBenefitTitle(benefit.title)));
  const taskIds = [...benefits.map((benefit) => benefitTaskId(eventId, benefit)), ...manualTasks.map((task) => task.id)];
  const completedTasks = taskIds.filter((taskId) => evidenceTaskIds.includes(taskId) || benefits.some((benefit) => benefitTaskId(eventId, benefit) === taskId && Boolean(benefit.evidence && benefit.evidence !== "Noch kein Nachweis"))).length;
  const taskProgress = taskIds.length ? Math.round(completedTasks / taskIds.length * 100) : 0;
  const contractStatus = !signedOn ? "Offen" : taskIds.length > 0 && completedTasks === taskIds.length ? "Erledigt" : "In Arbeit";

  function updateNetContractValue(value: string) {
    setContractAmountInput(value);
    const netAmount = parseContractValueInput(value);
    if (!grossContractAmountManuallyEdited && Number.isFinite(netAmount) && netAmount >= 0) {
      setGrossContractAmountInput(String(grossValueFromNet(netAmount)));
    }
  }

  function updateGrossContractValue(value: string) {
    setGrossContractAmountInput(value);
    setGrossContractAmountManuallyEdited(true);
  }

  function finishGrossContractValueEdit() {
    const amount = parseContractValueInput(grossContractAmountInput);
    const netAmount = parseContractValueInput(contractAmountInput);
    if (!Number.isFinite(amount) || amount < 0) {
      setGrossContractAmountInput(String(grossValueFromNet(Number.isFinite(netAmount) && netAmount >= 0 ? netAmount : 0)));
      setGrossContractAmountManuallyEdited(false);
    } else {
      setGrossContractAmountInput(String(amount));
      setGrossContractAmountManuallyEdited(amount !== grossValueFromNet(netAmount));
    }
    setGrossContractAmountFocused(false);
  }

  async function saveContractDetails() {
    const amount = parseContractValueInput(contractAmountInput);
    const grossAmount = grossContractAmountInput.trim() ? parseContractValueInput(grossContractAmountInput) : grossValueFromNet(amount);
    if (!Number.isFinite(amount) || amount < 0) {
      setMessage("Bitte gib einen gültigen Vertragswert netto ein.");
      return;
    }
    if (!Number.isFinite(grossAmount) || grossAmount < 0) {
      setMessage("Bitte gib einen gültigen Bruttovertragswert ein.");
      return;
    }
    try {
      const { error } = await updateContractRecord(contract.id, { netValueCents: Math.round(amount * 100), grossValueCents: Math.round(grossAmount * 100), signedAt: signedOn || null });
      if (error) throw error;
      window.dispatchEvent(new Event("sponso:event-timeline-updated"));
      setContractAmountInput(String(amount));
      setContractAmountFocused(false);
      setMessage(generatedContracts?.pdf ? "Vertragswerte und Vertragsdatum gespeichert. Erstelle den Vertrag erneut, damit die PDF-Datei die Änderungen enthält." : "Vertragswerte und Vertragsdatum gespeichert.");
    } catch {
      setMessage("Vertragswerte und Vertragsdatum konnten nicht gespeichert werden.");
    }
  }

  async function uploadSignedContractFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const { data: savedFile, error } = await saveContractDocument(contract.id, "signed", file, file.name);
      if (error || !savedFile) throw error ?? new Error("Datei konnte nicht gespeichert werden.");
      setSignedContractFile(savedFile);
      window.dispatchEvent(new Event("sponso:event-timeline-updated"));
      setMessage("Die gezeichnete Vertragsfassung wurde hochgeladen.");
    } catch {
      setMessage("Die gezeichnete Vertragsfassung konnte nicht gespeichert werden.");
    } finally {
      event.target.value = "";
    }
  }

  async function downloadSignedContractFile() {
    if (!signedContractFile) return;
    const { data, error } = await downloadContractDocument(signedContractFile);
    if (error || !data) { setMessage("Die gezeichnete Fassung konnte nicht heruntergeladen werden."); return; }
    const url = URL.createObjectURL(data);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = signedContractFile.fileName;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function removeSignedContractFile() {
    try {
      if (!signedContractFile) return;
      const { error } = await deleteContractDocument(signedContractFile);
      if (error) throw error;
      setSignedContractFile(null);
      window.dispatchEvent(new Event("sponso:event-timeline-updated"));
      setMessage("Die gezeichnete Fassung wurde gelöscht. Du kannst eine neue Datei hochladen.");
    } catch {
      setMessage("Die gezeichnete Fassung konnte nicht gelöscht werden.");
    }
  }

  function openAddBenefits() {
    setSelectedBlocks([]);
    setBenefitDueDates({});
    setAdding(true);
  }

  function closeAddBenefits() {
    setAdding(false);
    setSelectedBlocks([]);
    setBenefitDueDates({});
  }

  async function addSelectedBlocks() {
    try {
      const alreadyAdded = new Set(benefits.map((benefit) => normalizeBenefitTitle(benefit.title)));
      const requested = availableBlocks.filter((block) => selectedBlocks.includes(block.title));
      const seen = new Set(alreadyAdded);
      const eligible = requested.filter((block) => {
        const key = normalizeBenefitTitle(block.title);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      if (eligible.length < requested.length) {
        setMessage("Ein oder mehrere Bausteine wurden diesem Sponsor im Event bereits hinzugefügt und übersprungen.");
      }
      const additions = eligible.map((block): EventBenefit => ({
        title: block.title,
        category: block.category,
        description: block.description,
        status: "Offen",
        evidence: "Noch kein Nachweis",
        sponsorId: sponsor.id,
        eventId,
        dueAt: benefitDueDates[block.title] || eventEndDate || undefined,
      }));
      if (additions.length === 0) {
        if (requested.length === 0) setMessage("Wähle zuerst mindestens einen Baustein aus.");
        else {
          setSelectedBlocks([]);
          setBenefitDueDates({});
          setAdding(false);
          setMessage("Diese Bausteine wurden diesem Sponsor im Event bereits hinzugefügt.");
        }
        return;
      }
      const result = await createStoredBenefits(additions.map((benefit) => ({
          eventId: benefit.eventId,
          sponsorId: benefit.sponsorId,
          contractId: contract.id,
          title: benefit.title,
          category: benefit.category,
          description: benefit.description,
          detail: "",
          status: benefit.status,
          evidence: benefit.evidence,
          dueAt: benefit.dueAt,
      })));
      if (result.error) throw result.error;
      const savedAdditions = result.data.map(storedBenefitToEventBenefit);
      setAddedBenefits((current) => [...current, ...savedAdditions]);
      window.dispatchEvent(new Event("sponso:event-timeline-updated"));
      setSelectedBlocks([]);
      setBenefitDueDates({});
      setAdding(false);
      setMessage(eligible.length < requested.length
        ? `${additions.length} ${additions.length === 1 ? "Leistung hinzugefügt" : "Leistungen hinzugefügt"}. Bereits vorhandene Bausteine wurden übersprungen.`
        : `${additions.length} ${additions.length === 1 ? "Leistung hinzugefügt" : "Leistungen hinzugefügt"}.`);
    } catch {
      setMessage("Die Leistungen konnten nicht gespeichert werden.");
    }
  }

  async function downloadGeneratedContract(format: "pdf" | "docx") {
    const generated = generatedContracts?.[format];
    if (!generated) return;
    const { data, error } = await downloadContractDocument(generated);
    if (error || !data) { setMessage("Die erstellte Vertragsdatei konnte nicht geladen werden."); return; }
    downloadDocument(data, generated.fileName);
  }

  async function renderContractTemplatePdf(documentBlob: Blob, preview: HTMLDivElement) {
    const { renderAsync } = await import("docx-preview");
    preview.replaceChildren();
    await renderAsync(documentBlob, preview, undefined, { breakPages: true, renderHeaders: true, renderFooters: true });
    await document.fonts.ready;
    const pages = Array.from(preview.querySelectorAll<HTMLElement>(".docx"));
    if (!pages.length) throw new Error("Die Word-Vorlage enthält keine darstellbaren Seiten.");

    const html2canvas = (await import("html2canvas")).default;
    const { jsPDF } = await import("jspdf");
    let pdf: InstanceType<typeof jsPDF> | null = null;
    for (const [index, page] of pages.entries()) {
      const bounds = page.getBoundingClientRect();
      const width = page.offsetWidth || bounds.width;
      const height = page.offsetHeight || bounds.height;
      if (!width || !height) throw new Error("Eine Seite der Word-Vorlage konnte nicht dargestellt werden.");
      const canvas = await html2canvas(page, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        onclone: (clonedDocument) => {
          const clonedPreview = clonedDocument.querySelector(".contract-print-preview") as HTMLElement | null;
          if (clonedPreview) {
            clonedPreview.style.position = "absolute";
            clonedPreview.style.left = "0";
            clonedPreview.style.top = "0";
            clonedPreview.style.zIndex = "1";
            clonedPreview.style.width = `${width}px`;
            clonedPreview.style.visibility = "visible";
          }
        },
      });
      const pageWidth = width * 0.75;
      const pageHeight = height * 0.75;
      const orientation = pageWidth > pageHeight ? "landscape" : "portrait";
      if (!pdf) pdf = new jsPDF({ orientation, unit: "pt", format: [pageWidth, pageHeight], compress: true });
      else pdf.addPage([pageWidth, pageHeight], orientation);
      pdf.addImage(canvas, "JPEG", 0, 0, pageWidth, pageHeight, `contract-page-${index}`, "FAST");
    }
    if (!pdf) throw new Error("Das PDF konnte nicht erstellt werden.");
    return pdf.output("blob");
  }

  async function createDefaultContractPdf() {
    const amount = parseContractValueInput(contractAmountInput);
    const grossAmount = grossContractAmountInput.trim() ? parseContractValueInput(grossContractAmountInput) : grossValueFromNet(amount);
    if (!Number.isFinite(amount) || amount < 0) {
      setMessage("Bitte gib einen gültigen Vertragswert netto ein.");
      return;
    }
    if (!Number.isFinite(grossAmount) || grossAmount < 0) {
      setMessage("Bitte gib einen gültigen Bruttovertragswert ein.");
      return;
    }
    const lines = [
      { text: "SPONSORINGVERTRAG", size: 20, bold: true, gap: 7 },
      { text: "Vereinbarte Leistungen", size: 14, bold: true, gap: 20 },
      { text: `Event: ${eventTitle}`, size: 11, bold: true },
      { text: `Sponsor: ${sponsor.name}` },
      { text: `Vertragswert netto: ${formatContractValue(amount)}`, gap: 18 },
      { text: `Vertragswert brutto: ${formatContractValue(grossAmount)}`, gap: 18 },
      { text: "LEISTUNGSÜBERSICHT", size: 11, bold: true, gap: 10 },
      ...(benefits.length ? benefits.flatMap((benefit, index) => [
        { text: `${index + 1}. ${benefit.title} · ${benefit.category}`, size: 11, bold: true, gap: 4 },
        { text: benefit.description || "Keine Leistungsbeschreibung hinterlegt.", gap: 12 },
        ...(benefit.dueAt ? [{ text: `Fällig bis: ${new Intl.DateTimeFormat("de-DE").format(new Date(`${benefit.dueAt}T00:00:00`))}`, gap: 12 }] : []),
      ]) : [{ text: "Für diesen Vertrag sind noch keine einzelnen Leistungen erfasst." }]),
    ];
    const blob = buildContractPdf(lines);
    const filename = `Vertrag-${sponsor.name}-${eventTitle}.pdf`.replace(/[^a-zA-Z0-9._-]+/g, "-");
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    try {
      const { data, error } = await saveContractDocument(contract.id, "generated_pdf", blob, filename);
      if (error || !data) throw error ?? new Error("PDF konnte nicht gespeichert werden.");
      setGeneratedContracts((current) => ({ ...current, pdf: data }));
      window.dispatchEvent(new Event("sponso:event-timeline-updated"));
      setMessage("Der Vertrag wurde heruntergeladen und steht im Vertragsreiter erneut zum Download bereit.");
    } catch {
      setMessage("Der Vertrag wurde heruntergeladen, konnte aber nicht für einen späteren Download gespeichert werden.");
    }
  }

  async function openContractOutput() {
    setShowContractOutput(true);
    setContractTemplate(null);
    setTemplateLoadMessage("");
    setTemplateLoading(true);
    try {
      const supabase = createClient();
      const { data: assignment, error: assignmentError } = await supabase
        .from("event_contract_templates")
        .select("template_id")
        .eq("event_id", eventId)
        .maybeSingle();
      if (assignmentError) throw assignmentError;
      if (!assignment) return;
      const { data: template, error: templateError } = await supabase
        .from("contract_templates")
        .select("name, storage_path")
        .eq("id", assignment.template_id)
        .single();
      if (templateError) throw templateError;
      const { data: file, error: fileError } = await supabase.storage.from("sponsorproof-files").download(template.storage_path);
      if (fileError) throw fileError;
      setContractTemplate({ name: template.name, storagePath: template.storage_path, file });
    } catch {
      setTemplateLoadMessage("Die Vertragsvorlage konnte nicht geladen werden. Prüfe bitte, ob die Supabase-Migration ausgeführt wurde.");
    } finally {
      setTemplateLoading(false);
    }
  }

  function downloadDocument(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function createTemplatedDocument(format: "docx" | "pdf") {
    if (creatingContract) return;
    if (!contractTemplate) {
      if (format === "docx") return;
      setShowContractOutput(false);
      setCreatingContract("pdf");
      try {
        await createDefaultContractPdf();
      } finally {
        setCreatingContract(null);
      }
      return;
    }
    const amount = parseContractValueInput(contractAmountInput);
    const grossAmount = grossContractAmountInput.trim() ? parseContractValueInput(grossContractAmountInput) : grossValueFromNet(amount);
    if (!Number.isFinite(amount) || amount < 0) {
      setMessage("Bitte gib einen gültigen Vertragswert netto ein.");
      setShowContractOutput(false);
      return;
    }
    if (!Number.isFinite(grossAmount) || grossAmount < 0) {
      setMessage("Bitte gib einen gültigen Bruttovertragswert ein.");
      setShowContractOutput(false);
      return;
    }
    setCreatingContract(format);
    try {
      const organizerResult = await fetchOrganizerSettings();
      if (organizerResult.error) throw organizerResult.error;
      const savedOrganizer = organizerResult.data ?? {};
      const contractForTemplate = { ...contract, value: formatContractValue(amount), signedAt: signedOn };
      const blob = await fillContractTemplate(contractTemplate.file, {
        organizer: savedOrganizer,
        sponsor,
        contract: contractForTemplate,
        grossValue: grossAmount,
        event: { id: eventId, title: eventTitle, startDate: eventStartDate, endDate: eventEndDate, location: eventLocation, responsible: eventResponsible, createdAt: "" },
        benefits,
      });
      if (format === "docx") {
        const filename = contractFilename(sponsor.name, eventTitle, "docx");
        downloadDocument(blob, filename);
        setShowContractOutput(false);
        try {
          const { data, error } = await saveContractDocument(contract.id, "generated_docx", blob, filename);
          if (error || !data) throw error ?? new Error("Word-Datei konnte nicht gespeichert werden.");
          setGeneratedContracts((current) => ({ ...current, docx: data }));
          window.dispatchEvent(new Event("sponso:event-timeline-updated"));
          setMessage("Der Word-Vertrag wurde heruntergeladen und steht im Vertragsreiter erneut zum Download bereit.");
        } catch {
          setMessage("Der Word-Vertrag wurde heruntergeladen, konnte aber nicht für einen späteren Download gespeichert werden.");
        }
        return;
      }
      if (!printPreviewRef.current) throw new Error("Die PDF-Datei konnte nicht erstellt werden.");
      setPrintReady(true);
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      const pdfBlob = await renderContractTemplatePdf(blob, printPreviewRef.current);
      const filename = contractFilename(sponsor.name, eventTitle, "pdf");
      downloadDocument(pdfBlob, filename);
      setShowContractOutput(false);
      setPrintReady(false);
      try {
        const { data, error } = await saveContractDocument(contract.id, "generated_pdf", pdfBlob, filename);
        if (error || !data) throw error ?? new Error("PDF konnte nicht gespeichert werden.");
        setGeneratedContracts((current) => ({ ...current, pdf: data }));
        window.dispatchEvent(new Event("sponso:event-timeline-updated"));
        setMessage("Der PDF-Vertrag wurde heruntergeladen und steht im Vertragsreiter erneut zum Download bereit.");
      } catch {
        setMessage("Der PDF-Vertrag wurde heruntergeladen, konnte aber nicht für einen späteren Download gespeichert werden.");
      }
    } catch (error) {
      setPrintReady(false);
      setMessage(error instanceof Error ? `Der Vertrag konnte nicht erstellt werden: ${error.message}` : "Der Vertrag konnte nicht erstellt werden.");
    } finally {
      setCreatingContract(null);
    }
  }

  return <section className="panel sponsor-event-detail"><div className="panel-heading"><div><div className="eyebrow">SPONSOR IM EVENT</div><div className="sponsor-event-name-row"><h2>{sponsor.name}</h2><Link className="text-link sponsor-event-customer-link" href={`/sponsors/${sponsor.id}`}>Kundenkartei →</Link></div></div><div className="sponsor-event-heading-actions"><Status value={contractStatus}/><Link className="btn" href={`/events/${eventId}?tab=sponsoren`}>← Alle Sponsoren</Link></div></div>
    <section className="panel sponsor-contract-data"><div className="table-head"><div><h2>Vertragsdaten</h2><p className="subtitle" style={{ fontSize: 11, marginTop: 4 }}>Nettowert, Bruttowert, Vertragsdatum und Fortschritt für diesen Eventvertrag.</p></div></div><div className="sponsor-contract-detail-grid"><div className="contract-volume-field"><label><span>Vertragswert netto</span><input aria-label="Vertragswert netto in Euro" inputMode="decimal" type="text" value={contractAmountFocused ? contractAmountInput : Number.isFinite(parseContractValueInput(contractAmountInput)) ? formatContractValue(parseContractValueInput(contractAmountInput)) : contractAmountInput} onFocus={() => setContractAmountFocused(true)} onChange={(event) => updateNetContractValue(event.target.value)} onBlur={() => setContractAmountFocused(false)} /></label></div><div className="contract-volume-field"><label><span>Vertragswert brutto</span><input aria-label="Vertragswert brutto in Euro" inputMode="decimal" type="text" value={grossContractAmountFocused ? grossContractAmountInput : grossContractAmountInput && Number.isFinite(parseContractValueInput(grossContractAmountInput)) ? formatContractValue(parseContractValueInput(grossContractAmountInput)) : grossContractAmountInput} onFocus={() => setGrossContractAmountFocused(true)} onChange={(event) => updateGrossContractValue(event.target.value)} onBlur={finishGrossContractValueEdit} /></label></div><div><span>Vereinbarte Leistungen</span><b>{benefits.length}</b></div><div><span>Leistungsfortschritt</span><Progress value={taskProgress}/></div><div className="event-contract-date"><label><span>Datum der Vertragsunterzeichnung</span><input aria-label="Datum der Vertragsunterzeichnung" type="date" value={signedOn} onChange={(event) => setSignedOn(event.target.value)} /></label></div></div><div className="contract-details-save"><button className="btn btn-primary" type="button" onClick={saveContractDetails}>Speichern</button></div></section>
    <section className="panel sponsor-contract-files"><div className="table-head"><div><h2>Vertrag</h2><p className="subtitle" style={{ fontSize: 11, marginTop: 4 }}>Erstelle eine Vertragsfassung oder füge eine gezeichnete Fassung hinzu.</p></div></div><div className="contract-file-actions"><button className="btn btn-primary" type="button" onClick={() => { void openContractOutput(); }}><Icon name="file" size={15}/> Vertrag erstellen</button>{generatedContracts?.pdf && <button className="btn" type="button" onClick={() => downloadGeneratedContract("pdf")}><Icon name="file" size={15}/> PDF erneut herunterladen</button>}{generatedContracts?.docx && <button className="btn" type="button" onClick={() => downloadGeneratedContract("docx")}><Icon name="file" size={15}/> Word erneut herunterladen</button>}<label className="btn contract-upload-button"><Icon name="file" size={15}/> Gezeichnete Fassung hochladen<input type="file" onChange={(event) => { void uploadSignedContractFile(event); }} /></label></div>{signedContractFile && <div className="signed-contract-file"><div><b>{signedContractFile.fileName}</b><span>Hochgeladen am {new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(new Date(signedContractFile.createdAt))}</span></div><div className="signed-contract-actions"><button className="btn" type="button" onClick={() => { void downloadSignedContractFile(); }}><Icon name="file" size={14}/> Gezeichnete Fassung herunterladen</button><button className="btn signed-contract-delete" type="button" onClick={() => { void removeSignedContractFile(); }}>Datei löschen</button></div></div>}</section>
    <div className="panel table-panel sponsor-contract-benefits"><div className="table-head"><div><h2>Vereinbarte Leistungen</h2><p className="subtitle" style={{ fontSize: 11, marginTop: 4 }}>Einzelleistungen und Nachweisstatus für diesen Eventvertrag.</p></div><button className="btn btn-primary" type="button" onClick={() => { setMessage(""); openAddBenefits(); }}><Icon name="plus" size={14}/> Leistung hinzufügen</button></div>{benefits.length ? <table className="table"><thead><tr><th>LEISTUNG</th><th>KATEGORIE</th><th>FÄLLIG</th><th>NACHWEIS</th><th>STATUS</th></tr></thead><tbody>{benefits.map((benefit) => <tr key={benefit.id ?? benefit.title}><td><b style={{ color: "#3d4c5b" }}>{benefit.title}</b><div className="task-caption">{benefit.description}</div></td><td>{benefit.category}</td><td>{benefit.dueAt ? new Intl.DateTimeFormat("de-DE").format(new Date(`${benefit.dueAt}T00:00:00`)) : "—"}</td><td>{benefit.evidence}</td><td><Status value={benefit.evidence && benefit.evidence !== "Noch kein Nachweis" ? "Erledigt" : "Offen"}/></td></tr>)}</tbody></table> : <EmptyState className="empty-state-compact" title="Noch keine Leistungen" description="Füge Leistungen aus der Bausteinbibliothek zu diesem Vertrag hinzu." action={<button className="btn btn-primary" type="button" onClick={() => { setMessage(""); openAddBenefits(); }}><Icon name="plus" size={14}/> Leistung hinzufügen</button>} />}</div>
    {message && <p className="task-feedback" role="status">{message}</p>}
    {adding && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeAddBenefits(); }}>
      <section className="create-modal add-benefit-modal" role="dialog" aria-modal="true" aria-labelledby="add-benefit-title">
        <div className="create-modal-head"><div><h2 id="add-benefit-title">Leistungen hinzufügen</h2><p>Wähle die vereinbarten Leistungen. Für jede kannst du eine eigene Fälligkeit festlegen.</p></div><button className="icon-button" type="button" aria-label="Dialog schließen" onClick={closeAddBenefits}><Icon name="close" size={16}/></button></div>
        <div className="add-benefit-options">{blocksLoading ? <p className="task-empty">Bausteine werden geladen …</p> : blocksLoadError ? <EmptyState title="Bausteine nicht verfügbar" description={blocksLoadError} action={<Link className="btn btn-primary" href="/bausteine">Zur Bausteinbibliothek</Link>} /> : availableBlocks.length ? availableBlocks.map((block, index) => {
          const alreadyAdded = existingBenefitTitles.has(normalizeBenefitTitle(block.title));
          return <div className={`add-benefit-item ${selectedBlocks.includes(block.title) ? "selected" : ""} ${alreadyAdded ? "already-added" : ""}`} key={`${block.title}-${index}`}>
          <label className="add-benefit-option"><input type="checkbox" checked={alreadyAdded || selectedBlocks.includes(block.title)} disabled={alreadyAdded} onChange={(event) => {
            if (event.target.checked) {
              setSelectedBlocks((current) => current.includes(block.title) ? current : [...current, block.title]);
              setBenefitDueDates((current) => ({ ...current, [block.title]: current[block.title] || eventEndDate }));
            } else {
              setSelectedBlocks((current) => current.filter((title) => title !== block.title));
            }
          }}/><span><b>{block.title}</b><small>{block.category}{block.detail ? ` · ${block.detail}` : ""}</small>{alreadyAdded && <small className="add-benefit-already-added">Bereits hinzugefügt</small>}<span>{block.description}</span></span></label>
          {selectedBlocks.includes(block.title) && !alreadyAdded && <label className="settings-field add-benefit-due"><span>Fällig am</span><input type="date" value={benefitDueDates[block.title] ?? eventEndDate} onChange={(event) => setBenefitDueDates((current) => ({ ...current, [block.title]: event.target.value }))}/></label>}
        </div>;
        }) : <EmptyState title="Noch keine Bausteine" description="Erstelle zuerst wiederverwendbare Leistungen in der Bausteinbibliothek." action={<Link className="btn btn-primary" href="/bausteine">Zur Bausteinbibliothek</Link>} />}</div>
        <div className="create-modal-actions"><button className="btn" type="button" onClick={closeAddBenefits}>Abbrechen</button><button className="btn btn-primary" type="button" onClick={addSelectedBlocks} disabled={selectedBlocks.length === 0}>Auswahl hinzufügen</button></div>
      </section>
    </div>}
    {showContractOutput && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowContractOutput(false); }}>
      <section className="create-modal contract-output-modal" role="dialog" aria-modal="true" aria-labelledby="contract-output-title">
        <div className="create-modal-head"><div><h2 id="contract-output-title">Vertrag erstellen</h2><p>Wähle das gewünschte Dateiformat für {sponsor.name}.</p></div><button className="icon-button" type="button" aria-label="Dialog schließen" onClick={() => setShowContractOutput(false)}><Icon name="close" size={16}/></button></div>
        {templateLoading ? <p className="task-empty">Zugeordnete Vorlage wird geladen …</p> : <>
          <p className="contract-output-note">{contractTemplate ? `Verwendete Vorlage: ${contractTemplate.name}` : templateLoadMessage || "Diesem Event ist keine Word-Vorlage zugeordnet. Die PDF-Datei wird im Standardlayout erstellt."}</p>
          {creatingContract && <p className="contract-output-note" role="status">{creatingContract === "pdf" ? "PDF wird erstellt und gleich heruntergeladen …" : "Word-Datei wird erstellt …"}</p>}
          <div className="contract-output-options">
            <button className="contract-output-option" type="button" disabled={creatingContract !== null} onClick={() => { void createTemplatedDocument("pdf"); }}><Icon name="file" size={23}/><span>PDF-Datei erstellen</span></button>
            <button className="contract-output-option" type="button" disabled={!contractTemplate || creatingContract !== null} onClick={() => { void createTemplatedDocument("docx"); }}><Icon name="file" size={23}/><span>Word-Datei erstellen</span></button>
          </div>
          {contractTemplate && <p className="contract-output-note">Die PDF-Datei wird aus der Vorlage erstellt und direkt heruntergeladen.</p>}
        </>}
      </section>
    </div>}
    <div ref={printPreviewRef} className={`contract-print-preview ${printReady ? "active" : ""}`} aria-hidden={!printReady}/>
  </section>;
}
