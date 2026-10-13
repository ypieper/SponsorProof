"use client";

import { syncLegacyBenefitsToSupabase, type LegacyBenefit as BenefitInput } from "@/lib/benefits-storage";
import { fetchContractDocuments, saveContractDocument, saveContractReportState } from "@/lib/contract-documents-storage";
import { fetchStoredEvidence, uploadStoredEvidence } from "@/lib/evidence-storage";
import { saveOrganizerSettings, type OrganizerSettings } from "@/lib/organization-settings-storage";
import { createClient } from "@/lib/supabase/client";
import { createStoredTask, fetchStoredTasks } from "@/lib/tasks-storage";
import { fetchStoredEventsFromDatabase } from "@/lib/events-storage";

const migrationKeyPrefix = "browser-data-to-supabase-v1";
const legacyKeys = [
  "sponsorproof.organizer-settings.v1", "sponsorproof.events.v1", "sponsorproof.deleted-events.v1", "sponsorproof.event-details.v1",
  "sponsorproof.blocks.v1", "sponsorproof.block-categories.v1", "sponsorproof.block-edits.v1", "sponsorproof.block-deletions.v1",
  "sponsorproof.additional-benefits.v1", "sponsorproof.manual-tasks.v1", "sponsorproof.task-status-overrides.v1",
  "sponsorproof.event-contract-values.v1", "sponsorproof.event-contract-gross-values.v1", "sponsorproof.event-contract-dates.v1",
  "sponsorproof.contract-pdfs.v1", "sponsorproof.created-reports.v1", "sponsorproof.sent-reports.v1", "sponso.event-mode.selected-event.v1",
];
const evidenceDatabaseName = "sponsorproof-evidence";
const contractDatabaseName = "sponsorproof-contract-files";
let activeMigration: Promise<void> | null = null;

type LegacyBlock = { title: string; category?: string; description?: string; detail?: string; icon?: string; value?: string };
type LegacyTask = { id: string; title: string; sponsor?: string; sponsorId?: string; eventId?: string; dueAt?: string; due?: string; status?: string };
type LegacyEvidence = { taskId: string; name: string; type?: string; blob: Blob };
type LegacyBenefit = BenefitInput & { evidence?: string; id?: string };
type LegacySignedContract = { contractId: string; file: Blob; name: string; mimeType?: string; uploadedAt?: string };
type LegacyGeneratedContract = { contractId: string; pdf?: { file: Blob; filename: string; mimeType?: string; generatedAt?: string }; docx?: { file: Blob; filename: string; mimeType?: string; generatedAt?: string } };
type LegacySavedPdf = { document: string; filename: string; generatedAt: string };

function readJson<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) as T : fallback;
  } catch { return fallback; }
}

function openLegacyDatabase(name: string, version: number) {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, version);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Browserdatenbank konnte nicht geöffnet werden."));
  });
}

async function readStore<T>(databaseName: string, version: number, storeName: string): Promise<T[]> {
  try {
    const database = await openLegacyDatabase(databaseName, version);
    if (!database.objectStoreNames.contains(storeName)) { database.close(); return []; }
    return await new Promise<T[]>((resolve, reject) => {
      const request = database.transaction(storeName, "readonly").objectStore(storeName).getAll();
      request.onsuccess = () => { resolve(request.result as T[]); database.close(); };
      request.onerror = () => { reject(request.error); database.close(); };
    });
  } catch { return []; }
}

function removeLegacyDatabase(name: string) {
  return new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

function normalizeTitle(value: string) { return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("de-DE"); }
function validUuid(value: unknown): value is string { return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }

async function runLegacyBrowserDataMigration() {
  const hasLegacyLocalData = legacyKeys.some((key) => key !== "sponso.event-mode.selected-event.v1" && localStorage.getItem(key) !== null);
  const [evidence, signedContracts, generatedContracts] = await Promise.all([
    readStore<LegacyEvidence>(evidenceDatabaseName, 1, "proofs"),
    readStore<LegacySignedContract>(contractDatabaseName, 2, "signed-contracts"),
    readStore<LegacyGeneratedContract>(contractDatabaseName, 2, "generated-contracts"),
  ]);
  if (!hasLegacyLocalData && !evidence.length && !signedContracts.length && !generatedContracts.length) {
    localStorage.removeItem("sponso.event-mode.selected-event.v1");
    await Promise.all([removeLegacyDatabase(evidenceDatabaseName), removeLegacyDatabase(contractDatabaseName)]);
    return;
  }
  const fingerprintInput = JSON.stringify({
    local: legacyKeys.filter((key) => key !== "sponso.event-mode.selected-event.v1").map((key) => [key, localStorage.getItem(key)]),
    evidence: evidence.map((item) => [item.taskId, item.name, item.type, item.blob?.size]),
    signedContracts: signedContracts.map((item) => [item.contractId, item.name, item.file?.size]),
    generatedContracts: generatedContracts.map((item) => [item.contractId, item.pdf?.filename, item.pdf?.file?.size, item.docx?.filename, item.docx?.file?.size]),
  });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(fingerprintInput));
  const fingerprint = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const migrationKey = `${migrationKeyPrefix}:${fingerprint}`;

  const supabase = createClient();
  const { data: organizationId, error: organizationError } = await supabase.rpc("current_organization_id");
  if (organizationError || typeof organizationId !== "string") throw organizationError ?? new Error("Veranstalterbereich wurde nicht gefunden.");
  const { data: marker, error: markerError } = await supabase.from("organization_data_migrations").select("migration_key").eq("organization_id", organizationId).eq("migration_key", migrationKey).maybeSingle();
  if (markerError) throw markerError;
  if (marker) return;

  const rawEvents = readJson<Record<string, unknown>[]>("sponsorproof.events.v1", []);
  const eventDetails = readJson<Record<string, Partial<Record<"title" | "startDate" | "endDate" | "location" | "responsible", string>>>>("sponsorproof.event-details.v1", {});
  const eventResult = await fetchStoredEventsFromDatabase();
  if (eventResult.error) throw eventResult.error;
  const knownEventIds = new Set((eventResult.data ?? []).map((event) => event.id));
  const deletedEventIds = new Set(readJson<string[]>("sponsorproof.deleted-events.v1", []).filter(validUuid));
  for (const event of rawEvents) {
    if (!validUuid(event.id) || typeof event.title !== "string") continue;
    const details = eventDetails[event.id] ?? {};
    if (deletedEventIds.has(event.id)) {
      if (knownEventIds.has(event.id)) {
        const { error } = await supabase.from("events").delete().eq("id", event.id);
        if (error) throw error;
      }
      continue;
    }
    if (knownEventIds.has(event.id)) {
      if (Object.keys(details).length) {
        const { error } = await supabase.from("events").update({ title: details.title ?? event.title, start_date: details.startDate ?? event.startDate ?? null, end_date: details.endDate ?? event.endDate ?? null, location: details.location ?? event.location ?? "", responsible: details.responsible ?? event.responsible ?? "" }).eq("id", event.id);
        if (error) throw error;
      }
      continue;
    }
    const { error } = await supabase.from("events").insert({ id: event.id, title: details.title ?? event.title, start_date: details.startDate ?? event.startDate ?? null, end_date: details.endDate ?? event.endDate ?? null, location: details.location ?? event.location ?? "", responsible: details.responsible ?? event.responsible ?? "" });
    if (error && error.code !== "23505") throw error;
  }
  for (const id of deletedEventIds) {
    if (!knownEventIds.has(id)) continue;
    const { error } = await supabase.from("events").delete().eq("id", id);
    if (error) throw error;
  }

  const legacySettings = readJson<Partial<OrganizerSettings> | null>("sponsorproof.organizer-settings.v1", null);
  if (legacySettings && Object.values(legacySettings).some(Boolean)) {
    const settings = { organization: "", street: "", streetNumber: "", postalCode: "", city: "", iban: "", bic: "", bank: "", firstName: "", lastName: "", email: "", phone: "", ...legacySettings };
    const { error } = await saveOrganizerSettings(settings);
    if (error) throw error;
  }

  const categoryNames = readJson<string[]>("sponsorproof.block-categories.v1", []);
  if (categoryNames.length) {
    const { error } = await supabase.from("organization_benefit_categories").upsert(categoryNames.map((name) => ({ organization_id: organizationId, name })), { onConflict: "organization_id,name", ignoreDuplicates: true });
    if (error) throw error;
  }

  const templates = readJson<LegacyBlock[]>("sponsorproof.blocks.v1", []);
  if (templates.length) {
    const { data: existingRows, error: existingError } = await supabase.from("benefit_templates").select("title");
    if (existingError) throw existingError;
    const knownTitles = new Set((existingRows ?? []).map((row) => normalizeTitle(row.title)));
    const missing = templates.filter((item) => item.title?.trim() && !knownTitles.has(normalizeTitle(item.title)));
    if (missing.length) {
      const { error } = await supabase.from("benefit_templates").insert(missing.map((item) => ({ title: item.title.trim(), category: item.category || "Werbung", description: item.description || "", detail: item.detail || "", icon: item.icon || "stack" })));
      if (error) throw error;
    }
  }

  const legacyBenefits = readJson<LegacyBenefit[]>("sponsorproof.additional-benefits.v1", []);
  const benefitImport = await syncLegacyBenefitsToSupabase(legacyBenefits);
  if (benefitImport.error) throw benefitImport.error;
  const { data: benefitRows, error: benefitError } = await supabase.from("benefits").select("id, event_id, sponsor_id, title, status, evidence_summary, due_at");
  if (benefitError) throw benefitError;
  const benefitByKey = new Map((benefitRows ?? []).map((row) => [`${row.event_id}:${row.sponsor_id ?? ""}:${normalizeTitle(row.title)}`, row]));
  const benefitIdMap = new Map<string, string>();
  for (const oldBenefit of legacyBenefits) {
    const saved = benefitByKey.get(`${oldBenefit.eventId}:${oldBenefit.sponsorId ?? ""}:${normalizeTitle(oldBenefit.title)}`);
    if (!saved) continue;
    if (oldBenefit.id) benefitIdMap.set(oldBenefit.id, saved.id);
    const changes: Record<string, unknown> = {};
    if (oldBenefit.status) changes.status = oldBenefit.status;
    if (oldBenefit.evidence) changes.evidence_summary = oldBenefit.evidence;
    if (oldBenefit.dueAt) changes.due_at = oldBenefit.dueAt;
    if (Object.keys(changes).length) {
      const { error } = await supabase.from("benefits").update(changes).eq("id", saved.id);
      if (error) throw error;
    }
  }

  const legacyTasks = readJson<LegacyTask[]>("sponsorproof.manual-tasks.v1", []);
  const taskResult = await fetchStoredTasks();
  if (taskResult.error) throw taskResult.error;
  const taskIdMap = new Map<string, string>();
  for (const task of legacyTasks) {
    if (!task.title?.trim()) continue;
    const existing = (taskResult.data ?? []).find((item) => item.source === "Manuell" && item.event_id === (task.eventId || null) && normalizeTitle(item.title) === normalizeTitle(task.title) && (item.sponsor_id ?? "") === (task.sponsorId ?? ""));
    let savedId = existing?.id;
    if (!savedId) {
      const { data, error } = await createStoredTask({ title: task.title, eventId: task.eventId, sponsorId: task.sponsorId, sponsorName: task.sponsor, dueAt: task.dueAt || task.due, source: "Manuell" });
      if (error || !data) throw error ?? new Error("Aufgabe konnte nicht übernommen werden.");
      savedId = data.id;
    }
    if (task.id) taskIdMap.set(task.id, savedId);
    if (task.status === "Erledigt") {
      const { error } = await supabase.from("tasks").update({ status: "Erledigt" }).eq("id", savedId);
      if (error) throw error;
    }
  }
  const statusOverrides = readJson<Record<string, string>>("sponsorproof.task-status-overrides.v1", {});
  for (const [oldTaskId, status] of Object.entries(statusOverrides)) {
    const taskId = taskIdMap.get(oldTaskId);
    if (taskId && (status === "Offen" || status === "Erledigt")) {
      const { error } = await supabase.from("tasks").update({ status }).eq("id", taskId);
      if (error) throw error;
    }
    const oldBenefitId = oldTaskId.startsWith("benefit-") ? oldTaskId.slice("benefit-".length) : "";
    const benefitId = benefitIdMap.get(oldBenefitId) ?? (validUuid(oldBenefitId) ? oldBenefitId : "");
    if (benefitId && (status === "Offen" || status === "Erledigt")) {
      const { error } = await supabase.from("benefits").update({ status }).eq("id", benefitId);
      if (error) throw error;
    }
  }

  const netValues = readJson<Record<string, number>>("sponsorproof.event-contract-values.v1", {});
  const grossValues = readJson<Record<string, number>>("sponsorproof.event-contract-gross-values.v1", {});
  const signedDates = readJson<Record<string, string>>("sponsorproof.event-contract-dates.v1", {});
  const contractIds = new Set([...Object.keys(netValues), ...Object.keys(grossValues), ...Object.keys(signedDates)].filter(validUuid));
  for (const id of contractIds) {
    const update: Record<string, unknown> = {};
    if (Number.isFinite(netValues[id])) update.value_cents = Math.round(netValues[id] * 100);
    if (Number.isFinite(grossValues[id])) update.gross_value_cents = Math.round(grossValues[id] * 100);
    if (signedDates[id] !== undefined) update.signed_at = signedDates[id] || null;
    if (Object.keys(update).length) {
      const { error } = await supabase.from("contracts").update(update).eq("id", id);
      if (error) throw error;
    }
  }

  const createdReports = readJson<Record<string, string>>("sponsorproof.created-reports.v1", {});
  const sentReports = new Set(readJson<string[]>("sponsorproof.sent-reports.v1", []));
  for (const id of new Set([...Object.keys(createdReports), ...sentReports])) {
    if (!validUuid(id)) continue;
    const reportState: { generatedAt?: string | null; sentAt?: string | null } = {};
    if (createdReports[id]) reportState.generatedAt = createdReports[id];
    if (sentReports.has(id)) reportState.sentAt = new Date().toISOString();
    const { error } = await saveContractReportState(id, reportState);
    if (error) throw error;
  }

  const { data: existingEvidence, error: existingEvidenceError } = await fetchStoredEvidence();
  if (existingEvidenceError) throw existingEvidenceError;
  for (const item of evidence) {
    const legacyTaskId = item.taskId ?? "";
    let taskId = taskIdMap.get(legacyTaskId) ?? legacyTaskId;
    let benefitId: string | undefined;
    if (legacyTaskId.startsWith("benefit-")) {
      const oldBenefitId = legacyTaskId.slice("benefit-".length);
      benefitId = benefitIdMap.get(oldBenefitId) ?? (validUuid(oldBenefitId) ? oldBenefitId : undefined);
      if (benefitId) taskId = `benefit-${benefitId}`;
    }
    if (!item.blob || !taskId) continue;
    if ((existingEvidence ?? []).some((saved) => saved.taskId === taskId && saved.name === item.name)) continue;
    const eventId = benefitId ? (benefitRows ?? []).find((row) => row.id === benefitId)?.event_id : (legacyTasks.find((task) => task.id === legacyTaskId)?.eventId ?? undefined);
    const file = new File([item.blob], item.name || "Nachweis", { type: item.type || item.blob.type || "application/octet-stream" });
    const { error } = await uploadStoredEvidence({ file, eventId, taskId, benefitId });
    if (error && !String(error.message).toLowerCase().includes("duplicate")) throw error;
  }

  for (const document of signedContracts) {
    if (!validUuid(document.contractId) || !document.file) continue;
    const currentDocuments = await fetchContractDocuments(document.contractId);
    if (currentDocuments.error) throw currentDocuments.error;
    if (currentDocuments.data?.some((item) => item.kind === "signed")) continue;
    const { error } = await saveContractDocument(document.contractId, "signed", document.file, document.name || "Unterschriebener Vertrag");
    if (error) throw error;
  }
  for (const contract of generatedContracts) {
    if (!validUuid(contract.contractId)) continue;
    for (const [format, kind] of [["pdf", "generated_pdf"], ["docx", "generated_docx"]] as const) {
      const file = contract[format];
      if (!file?.file) continue;
      const currentDocuments = await fetchContractDocuments(contract.contractId);
      if (currentDocuments.error) throw currentDocuments.error;
      if (currentDocuments.data?.some((item) => item.kind === kind)) continue;
      const { error } = await saveContractDocument(contract.contractId, kind, file.file, file.filename || `Vertrag.${format}`);
      if (error) throw error;
    }
  }
  const legacyPdfs = readJson<Record<string, LegacySavedPdf>>("sponsorproof.contract-pdfs.v1", {});
  for (const [contractId, saved] of Object.entries(legacyPdfs)) {
    if (!validUuid(contractId) || !saved.document) continue;
    const currentDocuments = await fetchContractDocuments(contractId);
    if (currentDocuments.error) throw currentDocuments.error;
    if (currentDocuments.data?.some((item) => item.kind === "generated_pdf")) continue;
    const blob = new Blob([saved.document], { type: "application/pdf" });
    const { error } = await saveContractDocument(contractId, "generated_pdf", blob, saved.filename || "Vertrag.pdf");
    if (error) throw error;
  }

  const { error: markerInsertError } = await supabase.from("organization_data_migrations").insert({ organization_id: organizationId, migration_key: migrationKey });
  if (markerInsertError && markerInsertError.code !== "23505") throw markerInsertError;
  for (const key of legacyKeys) localStorage.removeItem(key);
  await Promise.all([removeLegacyDatabase(evidenceDatabaseName), removeLegacyDatabase(contractDatabaseName)]);
}

export function migrateLegacyBrowserDataToSupabase() {
  if (!activeMigration) activeMigration = runLegacyBrowserDataMigration().finally(() => { activeMigration = null; });
  return activeMigration;
}
