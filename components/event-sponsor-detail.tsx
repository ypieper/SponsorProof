"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import Link from "next/link";
import type { Sponsor, SponsorContract } from "@/lib/demo-data";
import { Icon, Progress, Status } from "@/components/ui";
import { contractDateForInput, eventContractDatesKey } from "@/lib/event-contract-dates";
import { contractPdfStorageKey, type SavedContractPdf, type SavedContractPdfs } from "@/lib/contract-pdf-storage";
import { eventContractValuesKey, formatContractValue, parseContractValue, parseContractValueInput, type EventContractValues } from "@/lib/event-contract-values";

type Block = { title: string; category: string; description: string; detail: string; value: string };
type EventBenefit = { id?: string; title: string; category: string; description: string; status: string; evidence: string; sponsorId: string; eventId: string };
const storageKey = "sponsorproof.additional-benefits.v1";
const blocksStorageKey = "sponsorproof.blocks.v1";
const manualTasksKey = "sponsorproof.manual-tasks.v1";
const evidenceDatabase = "sponsorproof-evidence";
const evidenceStore = "proofs";
const contractFileDatabase = "sponsorproof-contract-files";
const contractFileStore = "signed-contracts";

type ManualTask = { id: string; sponsor: string; sponsorId?: string; eventId?: string };
type StoredSignedContract = { contractId: string; file: Blob; name: string; mimeType: string; uploadedAt: string };

function openContractFileDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(contractFileDatabase, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(contractFileStore, { keyPath: "contractId" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readSignedContract(contractId: string) {
  const database = await openContractFileDatabase();
  return new Promise<StoredSignedContract | null>((resolve, reject) => {
    const request = database.transaction(contractFileStore, "readonly").objectStore(contractFileStore).get(contractId);
    request.onsuccess = () => { resolve((request.result as StoredSignedContract | undefined) ?? null); database.close(); };
    request.onerror = () => { reject(request.error); database.close(); };
  });
}

async function saveSignedContract(contract: StoredSignedContract) {
  const database = await openContractFileDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(contractFileStore, "readwrite");
    transaction.objectStore(contractFileStore).put(contract);
    transaction.oncomplete = () => { resolve(); database.close(); };
    transaction.onerror = () => { reject(transaction.error); database.close(); };
  });
}

async function deleteSignedContract(contractId: string) {
  const database = await openContractFileDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(contractFileStore, "readwrite");
    transaction.objectStore(contractFileStore).delete(contractId);
    transaction.oncomplete = () => { resolve(); database.close(); };
    transaction.onerror = () => { reject(transaction.error); database.close(); };
    transaction.onabort = () => { reject(transaction.error); database.close(); };
  });
}

function readEvidenceTaskIds(): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(evidenceDatabase, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(evidenceStore, { keyPath: "taskId" });
    request.onsuccess = () => {
      const database = request.result;
      const read = database.transaction(evidenceStore, "readonly").objectStore(evidenceStore).getAll();
      read.onsuccess = () => { resolve((read.result as { taskId: string }[]).map((item) => item.taskId)); database.close(); };
      read.onerror = () => { reject(read.error); database.close(); };
    };
    request.onerror = () => reject(request.error);
  });
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

  let document = "%PDF-1.4\n% SponsorProof\n";
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

export function EventSponsorDetail({ eventId, eventTitle, sponsor, contract, baseBenefits, blocks }: {
  eventId: string;
  eventTitle: string;
  sponsor: Sponsor;
  contract: SponsorContract;
  baseBenefits: EventBenefit[];
  blocks: Block[];
}) {
  const [addedBenefits, setAddedBenefits] = useState<EventBenefit[]>([]);
  const [availableBlocks, setAvailableBlocks] = useState(blocks);
  const [adding, setAdding] = useState(false);
  const [selectedBlocks, setSelectedBlocks] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [signedOn, setSignedOn] = useState(() => contractDateForInput(contract.signedAt));
  const [evidenceTaskIds, setEvidenceTaskIds] = useState<string[]>([]);
  const [manualTasks, setManualTasks] = useState<ManualTask[]>([]);
  const [savedContractPdf, setSavedContractPdf] = useState<SavedContractPdf | null>(null);
  const [contractAmountInput, setContractAmountInput] = useState(() => String(parseContractValue(contract.value)));
  const [contractAmountFocused, setContractAmountFocused] = useState(false);
  const [signedContractFile, setSignedContractFile] = useState<StoredSignedContract | null>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? "[]") as EventBenefit[];
      setAddedBenefits(saved.filter((benefit) => benefit.eventId === eventId && benefit.sponsorId === sponsor.id));
      const savedBlocks = JSON.parse(localStorage.getItem(blocksStorageKey) ?? "[]") as Block[];
      setAvailableBlocks([...blocks, ...savedBlocks]);
      const savedPdfs = JSON.parse(localStorage.getItem(contractPdfStorageKey) ?? "{}") as SavedContractPdfs;
      setSavedContractPdf(savedPdfs[contract.id] ?? null);
      const savedAmounts = JSON.parse(localStorage.getItem(eventContractValuesKey) ?? "{}") as EventContractValues;
      const savedAmount = savedAmounts[contract.id];
      if (typeof savedAmount === "number" && Number.isFinite(savedAmount)) {
        setContractAmountInput(String(savedAmount));
      }
    } catch {
      setMessage("Gespeicherte zusätzliche Leistungen konnten nicht geladen werden.");
    }
  }, [contract.id, eventId, sponsor.id]);

  useEffect(() => {
    let cancelled = false;
    try {
      const savedDates = JSON.parse(localStorage.getItem(eventContractDatesKey) ?? "{}") as Record<string, string>;
      setSignedOn(savedDates[contract.id] !== undefined ? savedDates[contract.id] : contractDateForInput(contract.signedAt));
      const savedManualTasks = JSON.parse(localStorage.getItem(manualTasksKey) ?? "[]") as ManualTask[];
      setManualTasks(savedManualTasks.filter((task) => task.eventId === eventId && (task.sponsorId === sponsor.id || (!task.sponsorId && task.sponsor === sponsor.name))));
    } catch {
      setMessage("Gespeicherte Vertrags- und Aufgabendaten konnten nicht vollständig geladen werden.");
    }
    readEvidenceTaskIds().then((ids) => { if (!cancelled) setEvidenceTaskIds(ids); }).catch(() => { if (!cancelled) setMessage("Nachweise konnten nicht für den Vertragsstatus geladen werden."); });
    return () => { cancelled = true; };
  }, [contract.id, contract.signedAt, eventId, sponsor.id, sponsor.name]);

  useEffect(() => {
    let cancelled = false;
    readSignedContract(contract.id).then((file) => { if (!cancelled) setSignedContractFile(file); }).catch(() => {
      if (!cancelled) setMessage("Die hochgeladene Vertragsfassung konnte nicht geladen werden.");
    });
    return () => { cancelled = true; };
  }, [contract.id]);

  const benefits = useMemo(() => [...baseBenefits, ...addedBenefits], [baseBenefits, addedBenefits]);
  const taskIds = [...benefits.map((benefit) => benefitTaskId(eventId, benefit)), ...manualTasks.map((task) => task.id)];
  const completedTasks = taskIds.filter((taskId) => evidenceTaskIds.includes(taskId) || benefits.some((benefit) => benefitTaskId(eventId, benefit) === taskId && Boolean(benefit.evidence && benefit.evidence !== "Noch kein Nachweis"))).length;
  const taskProgress = taskIds.length ? Math.round(completedTasks / taskIds.length * 100) : 0;
  const contractStatus = !signedOn ? "Offen" : taskIds.length > 0 && completedTasks === taskIds.length ? "Erledigt" : "In Arbeit";

  function saveContractDetails() {
    const amount = parseContractValueInput(contractAmountInput);
    if (!Number.isFinite(amount) || amount < 0) {
      setMessage("Bitte gib ein gültiges Vertragsvolumen ein.");
      return;
    }
    try {
      const savedAmounts = JSON.parse(localStorage.getItem(eventContractValuesKey) ?? "{}") as EventContractValues;
      const savedDates = JSON.parse(localStorage.getItem(eventContractDatesKey) ?? "{}") as Record<string, string>;
      savedAmounts[contract.id] = amount;
      localStorage.setItem(eventContractValuesKey, JSON.stringify(savedAmounts));
      savedDates[contract.id] = signedOn;
      localStorage.setItem(eventContractDatesKey, JSON.stringify(savedDates));
      setContractAmountInput(String(amount));
      setContractAmountFocused(false);
      setMessage(savedContractPdf ? "Vertragsvolumen und Vertragsdatum gespeichert. Erstelle den Vertrag erneut, damit das PDF die Änderungen enthält." : "Vertragsvolumen und Vertragsdatum gespeichert.");
    } catch {
      setMessage("Vertragsvolumen und Vertragsdatum konnten nicht gespeichert werden.");
    }
  }

  async function uploadSignedContractFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const savedFile = { contractId: contract.id, file, name: file.name, mimeType: file.type || "application/octet-stream", uploadedAt: new Date().toISOString() };
      await saveSignedContract(savedFile);
      setSignedContractFile(savedFile);
      setMessage("Die gezeichnete Vertragsfassung wurde hochgeladen.");
    } catch {
      setMessage("Die gezeichnete Vertragsfassung konnte nicht gespeichert werden.");
    } finally {
      event.target.value = "";
    }
  }

  function downloadSignedContractFile() {
    if (!signedContractFile) return;
    const url = URL.createObjectURL(signedContractFile.file);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = signedContractFile.name;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function removeSignedContractFile() {
    try {
      await deleteSignedContract(contract.id);
      setSignedContractFile(null);
      setMessage("Die gezeichnete Fassung wurde gelöscht. Du kannst eine neue Datei hochladen.");
    } catch {
      setMessage("Die gezeichnete Fassung konnte nicht gelöscht werden.");
    }
  }

  function addSelectedBlocks() {
    const additions = availableBlocks.filter((block) => selectedBlocks.includes(block.title)).map((block, index): EventBenefit => ({
      id: `custom-${Date.now()}-${index}`,
      title: block.title,
      category: block.category,
      description: block.description,
      status: "Offen",
      evidence: "Noch kein Nachweis",
      sponsorId: sponsor.id,
      eventId,
    }));
    if (additions.length === 0) return;
    try {
      const allSaved = JSON.parse(localStorage.getItem(storageKey) ?? "[]") as EventBenefit[];
      const updated = [...allSaved, ...additions];
      localStorage.setItem(storageKey, JSON.stringify(updated));
      setAddedBenefits((current) => [...current, ...additions]);
      setSelectedBlocks([]);
      setAdding(false);
      setMessage(`${additions.length} ${additions.length === 1 ? "Leistung hinzugefügt" : "Leistungen hinzugefügt"}.`);
    } catch {
      setMessage("Die Leistungen konnten nicht gespeichert werden.");
    }
  }

  function downloadSavedContractPdf() {
    if (!savedContractPdf) return;
    const url = URL.createObjectURL(new Blob([savedContractPdf.document], { type: "application/pdf" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = savedContractPdf.filename;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function createContractPdf() {
    const amount = parseContractValueInput(contractAmountInput);
    if (!Number.isFinite(amount) || amount < 0) {
      setMessage("Bitte gib ein gültiges Vertragsvolumen ein.");
      return;
    }
    const lines = [
      { text: "SPONSORINGVERTRAG", size: 20, bold: true, gap: 7 },
      { text: "Vereinbarte Leistungen", size: 14, bold: true, gap: 20 },
      { text: `Event: ${eventTitle}`, size: 11, bold: true },
      { text: `Sponsor: ${sponsor.name}` },
      { text: `Vertragsvolumen: ${formatContractValue(amount)}`, gap: 18 },
      { text: "LEISTUNGSÜBERSICHT", size: 11, bold: true, gap: 10 },
      ...(benefits.length ? benefits.flatMap((benefit, index) => [
        { text: `${index + 1}. ${benefit.title} · ${benefit.category}`, size: 11, bold: true, gap: 4 },
        { text: benefit.description || "Keine Leistungsbeschreibung hinterlegt.", gap: 12 },
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
      const savedPdfs = JSON.parse(localStorage.getItem(contractPdfStorageKey) ?? "{}") as SavedContractPdfs;
      const savedAmounts = JSON.parse(localStorage.getItem(eventContractValuesKey) ?? "{}") as EventContractValues;
      const savedPdf = { document: await blob.text(), filename, generatedAt: new Date().toISOString() };
      savedPdfs[contract.id] = savedPdf;
      savedAmounts[contract.id] = amount;
      localStorage.setItem(eventContractValuesKey, JSON.stringify(savedAmounts));
      localStorage.setItem(contractPdfStorageKey, JSON.stringify(savedPdfs));
      setSavedContractPdf(savedPdf);
      setMessage("Der Vertrag wurde als PDF heruntergeladen und im Vertragsreiter des Sponsors gespeichert.");
    } catch {
      setMessage("Der Vertrag wurde als PDF heruntergeladen, konnte aber nicht im Vertragsreiter gespeichert werden.");
    }
  }

  return <section className="panel sponsor-event-detail"><div className="panel-heading"><div><Link className="text-link" href={`/events/${eventId}?tab=sponsoren`}>← Alle Sponsoren</Link><div className="eyebrow" style={{ marginTop: 12 }}>SPONSOR IM EVENT</div><div className="sponsor-event-name-row"><h2>{sponsor.name}</h2><Link className="text-link sponsor-event-customer-link" href={`/sponsors/${sponsor.id}`}>Kundenkartei →</Link></div></div><Status value={contractStatus}/></div>
    <section className="panel sponsor-contract-data"><div className="table-head"><div><h2>Vertragsdaten</h2><p className="subtitle" style={{ fontSize: 11, marginTop: 4 }}>Volumen, Vertragsdatum und Fortschritt für diesen Eventvertrag.</p></div></div><div className="sponsor-contract-detail-grid"><div className="contract-volume-field"><label><span>Vertragsvolumen</span><input aria-label="Vertragsvolumen in Euro" inputMode="decimal" type="text" value={contractAmountFocused ? contractAmountInput : Number.isFinite(parseContractValueInput(contractAmountInput)) ? formatContractValue(parseContractValueInput(contractAmountInput)) : contractAmountInput} onFocus={() => setContractAmountFocused(true)} onChange={(event) => setContractAmountInput(event.target.value)} onBlur={() => setContractAmountFocused(false)} /></label></div><div><span>Vereinbarte Leistungen</span><b>{benefits.length}</b></div><div><span>Leistungsfortschritt</span><Progress value={taskProgress}/></div><div className="event-contract-date"><label><span>Datum der Vertragsunterzeichnung</span><input aria-label="Datum der Vertragsunterzeichnung" type="date" value={signedOn} onChange={(event) => setSignedOn(event.target.value)} /></label></div></div><div className="contract-details-save"><button className="btn btn-primary" type="button" onClick={saveContractDetails}>Speichern</button></div></section>
    <section className="panel sponsor-contract-files"><div className="table-head"><div><h2>Vertrag</h2><p className="subtitle" style={{ fontSize: 11, marginTop: 4 }}>Erstelle und lade die aktuelle Vertragsfassung herunter oder füge eine gezeichnete Fassung hinzu.</p></div></div><div className="contract-file-actions"><button className="btn btn-primary" type="button" onClick={createContractPdf}><Icon name="file" size={15}/> Vertrag erstellen</button>{savedContractPdf && <button className="btn" type="button" onClick={downloadSavedContractPdf}><Icon name="file" size={15}/> Aktuelle Fassung herunterladen</button>}<label className="btn contract-upload-button"><Icon name="file" size={15}/> Gezeichnete Fassung hochladen<input type="file" accept=".pdf,application/pdf,image/*" onChange={(event) => { void uploadSignedContractFile(event); }} /></label></div>{signedContractFile && <div className="signed-contract-file"><div><b>{signedContractFile.name}</b><span>Hochgeladen am {new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(new Date(signedContractFile.uploadedAt))}</span></div><div className="signed-contract-actions"><button className="btn" type="button" onClick={downloadSignedContractFile}><Icon name="file" size={14}/> Gezeichnete Fassung herunterladen</button><button className="btn signed-contract-delete" type="button" onClick={() => { void removeSignedContractFile(); }}>Datei löschen</button></div></div>}</section>
    <div className="panel table-panel sponsor-contract-benefits"><div className="table-head"><div><h2>Vereinbarte Leistungen</h2><p className="subtitle" style={{ fontSize: 11, marginTop: 4 }}>Einzelleistungen und Nachweisstatus für diesen Eventvertrag.</p></div><button className="btn btn-primary" type="button" onClick={() => { setMessage(""); setAdding(true); }}><Icon name="plus" size={14}/> Leistung hinzufügen</button></div>{benefits.length ? <table className="table"><thead><tr><th>LEISTUNG</th><th>KATEGORIE</th><th>NACHWEIS</th><th>STATUS</th></tr></thead><tbody>{benefits.map((benefit) => <tr key={benefit.id ?? benefit.title}><td><b style={{ color: "#3d4c5b" }}>{benefit.title}</b><div className="task-caption">{benefit.description}</div></td><td>{benefit.category}</td><td>{benefit.evidence}</td><td><Status value={benefit.evidence && benefit.evidence !== "Noch kein Nachweis" ? "Erledigt" : "Offen"}/></td></tr>)}</tbody></table> : <p className="sponsor-event-empty">Für diesen Sponsor sind noch keine einzelnen Leistungen im Eventvertrag erfasst.</p>}</div>
    {message && <p className="task-feedback" role="status">{message}</p>}
    {adding && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setAdding(false); }}><section className="create-modal add-benefit-modal" role="dialog" aria-modal="true" aria-labelledby="add-benefit-title"><div className="create-modal-head"><div><h2 id="add-benefit-title">Leistungen aus Bausteinen hinzufügen</h2><p>Wähle die Bausteine, die du diesem Eventvertrag zuordnen möchtest.</p></div><button className="icon-button" type="button" aria-label="Dialog schließen" onClick={() => setAdding(false)}><Icon name="close" size={16}/></button></div><div className="add-benefit-options">{availableBlocks.map((block, index) => <label className="add-benefit-option" key={`${block.title}-${index}`}><input type="checkbox" checked={selectedBlocks.includes(block.title)} onChange={(event) => setSelectedBlocks((current) => event.target.checked ? [...current, block.title] : current.filter((title) => title !== block.title))}/><span><b>{block.title}</b><small>{block.category} · {block.value}</small><span>{block.description}</span></span></label>)}</div><div className="create-modal-actions"><button className="btn" type="button" onClick={() => setAdding(false)}>Abbrechen</button><button className="btn btn-primary" type="button" onClick={addSelectedBlocks} disabled={selectedBlocks.length === 0}>Auswahl hinzufügen</button></div></section></div>}
  </section>;
}
