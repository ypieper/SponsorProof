import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { isUuid, sponsorUploadBucket, sponsorUploadMaxBytes } from "@/lib/sponsor-upload-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type Context = { params: Promise<{ id: string; sponsorId: string }> };
type InvoiceBody = {
  action?: unknown;
  invoiceNumber?: unknown;
  invoiceDate?: unknown;
  dueDate?: unknown;
  sentDate?: unknown;
  netAmount?: unknown;
  grossAmount?: unknown;
  fileName?: unknown;
  contentType?: unknown;
  size?: unknown;
  storagePath?: unknown;
  published?: unknown;
  paid?: unknown;
  invoiceId?: unknown;
};

export const runtime = "nodejs";

async function extractInvoiceXml(file: Blob, extension: string): Promise<string | null> {
  if (extension === "xml") {
    const xml = await file.text();
    return xml.length <= 2 * 1024 * 1024 ? xml : null;
  }
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  try {
    const pdf = await loadingTask.promise;
    const attachments = await pdf.getAttachments();
    if (!attachments) return null;
    const entries = attachments instanceof Map ? Array.from(attachments.values()) : Object.values(attachments);
    for (const attachment of entries as Array<{ filename?: string; content: Uint8Array }>) {
      if (!attachment.filename?.toLowerCase().endsWith(".xml")) continue;
      const xml = new TextDecoder("utf-8").decode(attachment.content);
      if (xml.length <= 2 * 1024 * 1024) return xml;
    }
    return null;
  } finally {
    await loadingTask.destroy();
  }
}

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
function optionalDate(value: unknown) {
  if (value === null || value === "") return null;
  if (typeof value !== "string" || !datePattern.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? undefined : value;
}

function invoiceFields(body: InvoiceBody) {
  const invoiceDate = optionalDate(body.invoiceDate);
  const dueDate = optionalDate(body.dueDate);
  const sentDate = optionalDate(body.sentDate);
  const netAmount = body.netAmount === null || body.netAmount === "" ? null : Number(body.netAmount);
  const suppliedGrossAmount = body.grossAmount === null || body.grossAmount === "" || body.grossAmount === undefined ? null : Number(body.grossAmount);
  if (invoiceDate === undefined || dueDate === undefined || sentDate === undefined || (netAmount !== null && (!Number.isFinite(netAmount) || netAmount < 0)) || (suppliedGrossAmount !== null && (!Number.isFinite(suppliedGrossAmount) || suppliedGrossAmount < 0))) return null;
  const roundedNetAmount = netAmount === null ? null : Math.round(netAmount * 100) / 100;
  const grossAmount = suppliedGrossAmount === null
    ? roundedNetAmount === null ? null : Math.round((roundedNetAmount * 1.19 + Number.EPSILON) * 100) / 100
    : Math.round(suppliedGrossAmount * 100) / 100;
  return {
    invoice_number: typeof body.invoiceNumber === "string" ? body.invoiceNumber.trim().slice(0, 120) : "",
    invoice_date: invoiceDate,
    due_date: dueDate,
    sent_date: sentDate,
    net_amount: roundedNetAmount,
    gross_amount: grossAmount === null ? null : Math.round(grossAmount * 100) / 100,
  };
}

async function authorize(context: Context) {
  const { id: eventId, sponsorId } = await context.params;
  if (!isUuid(eventId) || !isUuid(sponsorId)) return { eventId, sponsorId, response: NextResponse.json({ error: "Ungültiges Event oder Sponsor." }, { status: 400 }), sponsorMember: false, organizerMember: false };
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { eventId, sponsorId, response: NextResponse.json({ error: "Bitte melde dich erneut an." }, { status: 401 }), sponsorMember: false, organizerMember: false };
  try {
    const admin = createAdminClient();
    const [{ data: organizer }, { data: memberships, error: membershipsError }] = await Promise.all([
      supabase.rpc("owns_event", { target_event_id: eventId }),
      admin.from("sponsor_account_members").select("account_id").eq("user_id", user.id),
    ]);
    if (membershipsError) throw membershipsError;
    const accountIds = (memberships ?? []).map((membership) => membership.account_id);
    const { data: assignment, error: assignmentError } = accountIds.length
      ? await admin.from("sponsor_event_accounts").select("account_id").eq("event_id", eventId).eq("sponsor_id", sponsorId).in("account_id", accountIds).limit(1).maybeSingle()
      : { data: null, error: null };
    if (assignmentError) throw assignmentError;
    const sponsorMember = Boolean(assignment);
    if (organizer !== true && !sponsorMember) return { eventId, sponsorId, response: NextResponse.json({ error: "Du hast keinen Zugriff auf diesen Sponsor in diesem Event." }, { status: 403 }), sponsorMember: false, organizerMember: false };
    return { eventId, sponsorId, response: null, sponsorMember, organizerMember: organizer === true };
  } catch {
    return { eventId, sponsorId, response: NextResponse.json({ error: "Der Zugriff konnte nicht geprüft werden." }, { status: 503 }), sponsorMember: false, organizerMember: false };
  }
}

export async function GET(request: Request, context: Context) {
  const { eventId, sponsorId, response, sponsorMember, organizerMember } = await authorize(context);
  if (response) return response;
  const admin = createAdminClient();
  const { data: invoices, error } = await admin.from("event_sponsor_invoices")
    .select("id, invoice_number, invoice_date, due_date, sent_date, net_amount, gross_amount, storage_path, file_name, content_type, sponsor_visible, paid_at, updated_at")
    .eq("event_id", eventId).eq("sponsor_id", sponsorId).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Rechnungsdaten konnten nicht geladen werden. Prüfe die Datenbankmigration." }, { status: 500 });
  const url = new URL(request.url);
  if (url.searchParams.get("download") === "1") {
    const invoiceId = url.searchParams.get("invoiceId");
    if (!invoiceId || !isUuid(invoiceId)) return NextResponse.json({ error: "Ungültige Rechnung." }, { status: 400 });
    const invoice = (invoices ?? []).find((item) => item.id === invoiceId);
    if (!invoice?.storage_path || !invoice.file_name) return NextResponse.json({ error: "Es wurde noch keine Rechnungsdatei hochgeladen." }, { status: 404 });
    if (sponsorMember && !organizerMember && !invoice.sponsor_visible) return NextResponse.json({ error: "Die Rechnung wurde noch nicht für den Sponsor veröffentlicht." }, { status: 403 });
    const { data: file, error: downloadError } = await admin.storage.from(sponsorUploadBucket).download(invoice.storage_path);
    if (downloadError || !file) return NextResponse.json({ error: "Die Rechnungsdatei konnte nicht heruntergeladen werden." }, { status: 500 });
    const safeFileName = invoice.file_name.replace(/[\r\n"\\]/g, "_");
    return new Response(file, { headers: { "Content-Type": invoice.content_type || "application/pdf", "Content-Disposition": `attachment; filename="${safeFileName}"; filename*=UTF-8''${encodeURIComponent(invoice.file_name)}`, "Cache-Control": "private, no-store" } });
  }
  const visibleInvoices = (invoices ?? [])
    .filter((invoice) => organizerMember || !sponsorMember || invoice.sponsor_visible)
    .map((invoice) => ({
      id: invoice.id,
      invoice_number: invoice.invoice_number,
      invoice_date: invoice.invoice_date,
      due_date: invoice.due_date,
      sent_date: invoice.sent_date,
      net_amount: invoice.net_amount,
      gross_amount: invoice.gross_amount,
      file_name: invoice.file_name,
      file_available: Boolean(invoice.storage_path),
      sponsor_visible: invoice.sponsor_visible,
      paid_at: invoice.paid_at,
      updated_at: invoice.updated_at,
    }));
  return NextResponse.json({ invoices: visibleInvoices }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, context: Context) {
  const { eventId, sponsorId, response, organizerMember } = await authorize(context);
  if (response) return response;
  const body = await request.json().catch(() => null) as InvoiceBody | null;
  if (!body) return NextResponse.json({ error: "Bitte prüfe die Rechnungsangaben und versuche es erneut." }, { status: 400 });
  const admin = createAdminClient();
  if (body.action === "delete") {
    if (!organizerMember) return NextResponse.json({ error: "Nur der Veranstalter kann Rechnungen löschen." }, { status: 403 });
    if (typeof body.invoiceId !== "string" || !isUuid(body.invoiceId)) return NextResponse.json({ error: "Ungültige Rechnung." }, { status: 400 });
    const { data: invoice, error: invoiceError } = await admin.from("event_sponsor_invoices").select("id, storage_path").eq("event_id", eventId).eq("sponsor_id", sponsorId).eq("id", body.invoiceId).maybeSingle();
    if (invoiceError) return NextResponse.json({ error: "Die Rechnung konnte nicht geladen werden." }, { status: 500 });
    if (!invoice) return NextResponse.json({ error: "Die Rechnung wurde nicht gefunden." }, { status: 404 });
    if (invoice.storage_path) {
      const { error: fileError } = await admin.storage.from(sponsorUploadBucket).remove([invoice.storage_path]);
      if (fileError) return NextResponse.json({ error: "Die Rechnungsdatei konnte nicht gelöscht werden. Die Rechnung blieb erhalten." }, { status: 500 });
    }
    const { error: deleteError } = await admin.from("event_sponsor_invoices").delete().eq("event_id", eventId).eq("sponsor_id", sponsorId).eq("id", invoice.id);
    if (deleteError) return NextResponse.json({ error: "Die Rechnungsangaben konnten nicht gelöscht werden." }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  if (body.action === "publish") {
    if (!organizerMember) return NextResponse.json({ error: "Nur der Veranstalter kann die Rechnung veröffentlichen." }, { status: 403 });
    if (typeof body.published !== "boolean") return NextResponse.json({ error: "Bitte wähle einen gültigen Veröffentlichungsstatus." }, { status: 400 });
    if (typeof body.invoiceId !== "string" || !isUuid(body.invoiceId)) return NextResponse.json({ error: "Ungültige Rechnung." }, { status: 400 });
    const { data: invoice, error: invoiceError } = await admin.from("event_sponsor_invoices").select("id, storage_path").eq("event_id", eventId).eq("sponsor_id", sponsorId).eq("id", body.invoiceId).maybeSingle();
    if (invoiceError) return NextResponse.json({ error: "Die Rechnung konnte nicht geladen werden." }, { status: 500 });
    if (!invoice?.storage_path) return NextResponse.json({ error: "Lade zuerst eine Rechnungsdatei hoch." }, { status: 409 });
    const publishedAt = new Date();
    const sentDate = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(publishedAt);
    const { error: publishError } = await admin.from("event_sponsor_invoices").update({
      sponsor_visible: body.published,
      ...(body.published ? { sent_date: sentDate } : {}),
      updated_at: publishedAt.toISOString(),
    }).eq("id", invoice.id);
    if (publishError) return NextResponse.json({ error: "Die Veröffentlichung konnte nicht gespeichert werden." }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  if (body.action === "payment_status") {
    if (!organizerMember) return NextResponse.json({ error: "Nur der Veranstalter kann den Zahlungsstatus ändern." }, { status: 403 });
    if (typeof body.paid !== "boolean") return NextResponse.json({ error: "Bitte wähle einen gültigen Zahlungsstatus." }, { status: 400 });
    if (typeof body.invoiceId !== "string" || !isUuid(body.invoiceId)) return NextResponse.json({ error: "Ungültige Rechnung." }, { status: 400 });
    const paidAt = body.paid ? new Date().toISOString() : null;
    const { data: invoice, error: paymentError } = await admin.from("event_sponsor_invoices")
      .update({ paid_at: paidAt, updated_at: new Date().toISOString() })
      .eq("event_id", eventId).eq("sponsor_id", sponsorId).eq("id", body.invoiceId)
      .select("id").maybeSingle();
    if (paymentError) return NextResponse.json({ error: "Der Zahlungsstatus konnte nicht gespeichert werden." }, { status: 500 });
    if (!invoice) return NextResponse.json({ error: "Die Rechnung wurde nicht gefunden." }, { status: 404 });
    return NextResponse.json({ ok: true });
  }
  if (!organizerMember) return NextResponse.json({ error: "Nur der Veranstalter kann die Rechnungsdatei und Angaben bearbeiten." }, { status: 403 });
  const { data: event, error: eventError } = await admin.from("events").select("organization_id").eq("id", eventId).maybeSingle();
  if (eventError || !event?.organization_id) return NextResponse.json({ error: "Die Veranstaltungsdaten konnten nicht geladen werden." }, { status: 500 });

  if (body.action === "extract") {
    const expectedPrefix = `${event.organization_id}/events/${eventId}/invoices/${sponsorId}/`;
    const storagePath = typeof body.storagePath === "string" ? body.storagePath : "";
    const stagedPath = storagePath.slice(expectedPrefix.length);
    const pathMatch = /^([0-9a-f-]{36})\.(pdf|xml)$/i.exec(stagedPath);
    if (!storagePath.startsWith(expectedPrefix) || !pathMatch) return NextResponse.json({ error: "Ungültiger Dateipfad." }, { status: 400 });
    const folder = storagePath.slice(0, storagePath.lastIndexOf("/"));
    const filename = storagePath.slice(storagePath.lastIndexOf("/") + 1);
    const { data: uploadedFiles, error: listError } = await admin.storage.from(sponsorUploadBucket).list(folder, { limit: 10, search: filename });
    const uploadedFile = (uploadedFiles ?? []).find((file) => file.name === filename);
    if (listError || !uploadedFile) return NextResponse.json({ error: "Die hochgeladene Rechnungsdatei wurde nicht gefunden." }, { status: 404 });
    const uploadedSize = Number(uploadedFile.metadata?.size ?? 0);
    if (uploadedSize <= 0 || uploadedSize > sponsorUploadMaxBytes) return NextResponse.json({ error: "Die Rechnungsdatei ist leer oder größer als 25 MB." }, { status: 400 });
    const { data: storedFile, error: downloadError } = await admin.storage.from(sponsorUploadBucket).download(storagePath);
    if (downloadError || !storedFile) return NextResponse.json({ error: "Die hochgeladene Rechnungsdatei konnte nicht gelesen werden." }, { status: 500 });
    try {
      const xml = await extractInvoiceXml(storedFile, pathMatch[2].toLowerCase());
      return NextResponse.json({ xml }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      console.error("Invoice PDF extraction failed:", error);
      return NextResponse.json({ error: "Die PDF-Datei konnte nicht nach eingebetteten Rechnungsdaten durchsucht werden." }, { status: 422 });
    }
  }

  if (body.action === "discard") {
    if (typeof body.storagePath !== "string") return NextResponse.json({ error: "Ungültiger Dateipfad." }, { status: 400 });
    const expectedPrefix = `${event.organization_id}/events/${eventId}/invoices/${sponsorId}/`;
    const stagedPath = body.storagePath.slice(expectedPrefix.length);
    if (!body.storagePath.startsWith(expectedPrefix) || !/^[0-9a-f-]{36}\.(pdf|xml)$/i.test(stagedPath)) return NextResponse.json({ error: "Ungültiger Dateipfad." }, { status: 400 });
    const { data: existingInvoice, error: invoiceError } = await admin.from("event_sponsor_invoices").select("id").eq("event_id", eventId).eq("sponsor_id", sponsorId).eq("storage_path", body.storagePath).maybeSingle();
    if (invoiceError) return NextResponse.json({ error: "Die Rechnungsdatei konnte nicht geprüft werden." }, { status: 500 });
    if (existingInvoice) return NextResponse.json({ error: "Diese Datei gehört bereits zu einer gespeicherten Rechnung." }, { status: 409 });
    const { error: removeError } = await admin.storage.from(sponsorUploadBucket).remove([body.storagePath]);
    if (removeError) return NextResponse.json({ error: "Die nicht gespeicherte Rechnungsdatei konnte nicht entfernt werden." }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "prepare") {
    if (typeof body.invoiceId !== "string" || !isUuid(body.invoiceId)) return NextResponse.json({ error: "Ungültige Rechnung." }, { status: 400 });
    const extension = typeof body.fileName === "string" ? body.fileName.split(".").pop()?.toLowerCase() : "";
    const isPdf = extension === "pdf" && (!body.contentType || body.contentType === "application/pdf" || body.contentType === "application/octet-stream");
    const isXml = extension === "xml" && (!body.contentType || body.contentType === "application/xml" || body.contentType === "text/xml" || body.contentType === "application/octet-stream");
    if (typeof body.fileName !== "string" || typeof body.size !== "number" || (!isPdf && !isXml) || body.size <= 0 || body.size > sponsorUploadMaxBytes) {
      return NextResponse.json({ error: "Bitte wähle ein PDF oder eine XML-Rechnung bis 25 MB aus." }, { status: 400 });
    }
    const storagePath = `${event.organization_id}/events/${eventId}/invoices/${sponsorId}/${randomUUID()}.${extension}`;
    const { data: signedUpload, error: signedUploadError } = await admin.storage.from(sponsorUploadBucket).createSignedUploadUrl(storagePath);
    if (signedUploadError || !signedUpload) return NextResponse.json({ error: "Der sichere Datei-Upload konnte nicht gestartet werden." }, { status: 500 });
    return NextResponse.json({ storagePath: signedUpload.path, uploadToken: signedUpload.token }, { headers: { "Cache-Control": "no-store" } });
  }

  if (body.action !== "save" && body.action !== "complete") return NextResponse.json({ error: "Unbekannte Aktion." }, { status: 400 });
  if (typeof body.invoiceId !== "string" || !isUuid(body.invoiceId)) return NextResponse.json({ error: "Ungültige Rechnung." }, { status: 400 });
  const fields = invoiceFields(body);
  if (!fields) return NextResponse.json({ error: "Bitte prüfe Rechnungsdatum, Fälligkeit, Versanddatum und Nettobetrag." }, { status: 400 });
  const { data: previous } = await admin.from("event_sponsor_invoices").select("id, storage_path, file_name, content_type, sponsor_visible").eq("event_id", eventId).eq("sponsor_id", sponsorId).eq("id", body.invoiceId).maybeSingle();
  if (body.action === "save" && !previous) return NextResponse.json({ error: "Die Rechnung wurde nicht gefunden." }, { status: 404 });
  let storagePath = previous?.storage_path ?? null;
  let fileName: string | null = null;
  let contentType: string | null = null;
  if (body.action === "complete") {
    if (typeof body.storagePath !== "string" || typeof body.fileName !== "string") return NextResponse.json({ error: "Die Rechnungsdatei fehlt." }, { status: 400 });
    const expectedPrefix = `${event.organization_id}/events/${eventId}/invoices/${sponsorId}/`;
    const extension = body.fileName.split(".").pop()?.toLowerCase();
    const extensionPattern = extension === "xml" ? "xml" : extension === "pdf" ? "pdf" : null;
    if (!extensionPattern || !body.storagePath.startsWith(expectedPrefix) || !body.storagePath.endsWith(`.${extensionPattern}`)) return NextResponse.json({ error: "Ungültiger Dateipfad." }, { status: 400 });
    const requestedContentType = typeof body.contentType === "string" ? body.contentType : "";
    const allowedContentTypes = extensionPattern === "xml" ? ["application/xml", "text/xml"] : ["application/pdf"];
    if (requestedContentType && !allowedContentTypes.includes(requestedContentType)) return NextResponse.json({ error: "Dateiendung und Dateityp passen nicht zusammen." }, { status: 400 });
    const filePath = body.storagePath.slice(expectedPrefix.length);
    if (!new RegExp(`^[0-9a-f-]{36}\\.${extensionPattern}$`, "i").test(filePath)) return NextResponse.json({ error: "Ungültiger Dateipfad." }, { status: 400 });
    const folder = body.storagePath.slice(0, body.storagePath.lastIndexOf("/"));
    const filename = body.storagePath.slice(body.storagePath.lastIndexOf("/") + 1);
    const { data: uploadedFiles, error: listError } = await admin.storage.from(sponsorUploadBucket).list(folder, { limit: 10, search: filename });
    const uploadedFile = (uploadedFiles ?? []).find((file) => file.name === filename);
    const uploadedSize = Number(uploadedFile?.metadata?.size ?? 0);
    if (listError || !uploadedFile || uploadedSize <= 0 || uploadedSize > sponsorUploadMaxBytes) return NextResponse.json({ error: "Die Rechnungsdatei ist noch nicht vollständig angekommen oder größer als 25 MB." }, { status: 409 });
    storagePath = body.storagePath;
    fileName = body.fileName.replace(/[\r\n]/g, "_").trim().slice(0, 180) || "Rechnung.pdf";
    contentType = requestedContentType || (extensionPattern === "xml" ? "application/xml" : "application/pdf");
  }
  const invoiceRecord = {
    id: body.invoiceId, event_id: eventId, sponsor_id: sponsorId, ...fields, storage_path: storagePath,
    file_name: fileName ?? previous?.file_name ?? null,
    content_type: contentType ?? previous?.content_type ?? null,
    sponsor_visible: body.action === "complete" ? false : previous?.sponsor_visible ?? false,
    updated_at: new Date().toISOString(),
  };
  const { error: saveError } = previous
    ? await admin.from("event_sponsor_invoices").update(invoiceRecord).eq("id", body.invoiceId).eq("event_id", eventId).eq("sponsor_id", sponsorId)
    : await admin.from("event_sponsor_invoices").insert(invoiceRecord);
  if (saveError) {
    if (body.action === "complete" && storagePath) await admin.storage.from(sponsorUploadBucket).remove([storagePath]);
    return NextResponse.json({ error: "Die Rechnungsdaten konnten nicht gespeichert werden." }, { status: 500 });
  }
  if (body.action === "complete" && previous?.storage_path && previous.storage_path !== storagePath) await admin.storage.from(sponsorUploadBucket).remove([previous.storage_path]);
  return NextResponse.json({ ok: true });
}
