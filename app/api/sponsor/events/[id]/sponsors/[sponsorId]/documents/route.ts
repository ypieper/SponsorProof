import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { authorizeSponsorAccountEvent, isUuid, sponsorUploadBucket, validateSponsorUploadFile } from "@/lib/sponsor-upload-server";
import { createAdminClient } from "@/lib/supabase/admin";

type Context = { params: Promise<{ id: string; sponsorId: string }> };
type DocumentRequest = { action?: unknown; documentId?: unknown; fileName?: unknown; displayName?: unknown; contentType?: unknown; size?: unknown };

async function authorize(context: Context) {
  const { id: eventId, sponsorId } = await context.params;
  if (!isUuid(eventId) || !isUuid(sponsorId)) return { eventId, sponsorId, user: null, response: NextResponse.json({ error: "Ungültiges Event oder Sponsor." }, { status: 400 }) };
  const auth = await authorizeSponsorAccountEvent(eventId, sponsorId);
  if (auth.error) {
    const status = auth.error === "auth" ? 401 : auth.error === "access" ? 403 : 503;
    const error = auth.error === "auth" ? "Bitte melde dich erneut an." : auth.error === "access" ? "Du hast keinen Zugriff auf diesen Sponsor in diesem Event." : "Der Zugriff konnte nicht geprüft werden.";
    return { eventId, sponsorId, user: null, response: NextResponse.json({ error }, { status }) };
  }
  return { eventId, sponsorId, user: auth.user, response: null };
}

export async function GET(request: Request, context: Context) {
  const { eventId, sponsorId, user, response } = await authorize(context);
  if (response) return response;
  const admin = createAdminClient();
  const requestUrl = new URL(request.url);
  const downloadId = requestUrl.searchParams.get("download");
  const viewId = requestUrl.searchParams.get("view");
  const documentId = downloadId ?? viewId;
  if (documentId) {
    if (!isUuid(documentId)) return NextResponse.json({ error: "Ungültiges Dokument." }, { status: 400 });
    const { data: document, error } = await admin.from("sponsor_documents")
      .select("storage_path, file_name, content_type, uploaded_by_type, document_role, published_to_sponsor")
      .eq("id", documentId).eq("event_id", eventId).eq("sponsor_id", sponsorId).eq("status", "uploaded").maybeSingle();
    if (error) return NextResponse.json({ error: "Das Dokument konnte nicht geladen werden." }, { status: 500 });
    if (!document) return NextResponse.json({ error: "Das Dokument wurde nicht gefunden." }, { status: 404 });
    if (document.uploaded_by_type === "organizer" && document.document_role !== "signed_contract" && !document.published_to_sponsor) {
      return NextResponse.json({ error: "Das Dokument wurde nicht für den Sponsorenbereich veröffentlicht." }, { status: 404 });
    }
    const { data: file, error: fileError } = await admin.storage.from(sponsorUploadBucket).download(document.storage_path);
    if (fileError || !file) return NextResponse.json({ error: "Die Datei konnte nicht heruntergeladen werden." }, { status: 500 });
    const fallbackName = document.file_name.replace(/[\r\n"\\]/g, "_").replace(/[^\x20-\x7E]/g, "_");
    return new Response(file, { headers: {
      "Content-Type": document.content_type || "application/octet-stream",
      "Content-Disposition": `${viewId ? "inline" : "attachment"}; filename="${fallbackName}"; filename*=UTF-8''${encodeURIComponent(document.file_name)}`,
      "Cache-Control": "private, no-store",
    } });
  }
  const { data, error } = await admin.from("sponsor_documents")
    .select("id, file_name, display_name, content_type, size_bytes, uploaded_at, uploaded_by_type, uploaded_by_name, uploaded_by_user_id, document_role, document_category, published_to_sponsor, contract_id")
    .eq("event_id", eventId).eq("sponsor_id", sponsorId).eq("status", "uploaded")
    .or("uploaded_by_type.eq.sponsor,document_role.eq.signed_contract,published_to_sponsor.eq.true")
    .order("uploaded_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Dokumente konnten nicht geladen werden." }, { status: 500 });
  return NextResponse.json({ documents: (data ?? []).map(({ uploaded_by_user_id, ...document }) => ({ ...document, can_delete: document.uploaded_by_type === "sponsor" && uploaded_by_user_id === user!.id })) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, context: Context) {
  const { eventId, sponsorId, user, response } = await authorize(context);
  if (response) return response;
  const body = await request.json().catch(() => null) as DocumentRequest | null;
  if (!body) return NextResponse.json({ error: "Bitte prüfe die Datei und versuche es erneut." }, { status: 400 });
  const admin = createAdminClient();

  if (body.action === "prepare") {
    if (typeof body.fileName !== "string" || typeof body.displayName !== "string" || !body.displayName.trim() || body.displayName.trim().length > 120 || typeof body.contentType !== "string" || typeof body.size !== "number") return NextResponse.json({ error: "Bitte gib eine Dateibezeichnung mit maximal 120 Zeichen an." }, { status: 400 });
    const file = validateSponsorUploadFile({ name: body.fileName, contentType: body.contentType, size: body.size });
    if (!file) return NextResponse.json({ error: "Erlaubt sind PDF-, Word- und Bilddateien bis 25 MB." }, { status: 400 });
    const { data: event, error: eventError } = await admin.from("events").select("organization_id").eq("id", eventId).maybeSingle();
    if (eventError || !event?.organization_id) return NextResponse.json({ error: "Die Veranstaltungsdaten konnten nicht geladen werden." }, { status: 500 });
    const { data: sponsor, error: sponsorError } = await admin.from("sponsors").select("name").eq("id", sponsorId).maybeSingle();
    if (sponsorError || !sponsor) return NextResponse.json({ error: "Die Sponsorendaten konnten nicht geladen werden." }, { status: 500 });
    const documentId = randomUUID();
    const storagePath = `${event.organization_id}/events/${eventId}/sponsor-documents/${sponsorId}/${randomUUID()}.${file.extension}`;
    const { error: insertError } = await admin.from("sponsor_documents").insert({
      id: documentId, organization_id: event.organization_id, event_id: eventId, sponsor_id: sponsorId,
      storage_path: storagePath, file_name: file.fileName, display_name: body.displayName.trim(), content_type: file.contentType, size_bytes: body.size,
      uploaded_by_type: "sponsor", uploaded_by_user_id: user!.id, uploaded_by_name: sponsor.name,
      uploaded_by_email: user!.email ?? null, status: "pending",
    });
    if (insertError) return NextResponse.json({ error: "Der Upload konnte nicht vorbereitet werden." }, { status: 500 });
    const { data: signedUpload, error: signedUploadError } = await admin.storage.from(sponsorUploadBucket).createSignedUploadUrl(storagePath);
    if (signedUploadError || !signedUpload) {
      await admin.from("sponsor_documents").delete().eq("id", documentId);
      return NextResponse.json({ error: "Der sichere Datei-Upload konnte nicht gestartet werden." }, { status: 500 });
    }
    return NextResponse.json({ documentId, storagePath: signedUpload.path, uploadToken: signedUpload.token, contentType: file.contentType }, { headers: { "Cache-Control": "no-store" } });
  }

  if (body.action === "complete") {
    if (typeof body.documentId !== "string" || !isUuid(body.documentId)) return NextResponse.json({ error: "Ungültige Upload-Kennung." }, { status: 400 });
    const { data: document, error: documentError } = await admin.from("sponsor_documents")
      .select("id, storage_path, size_bytes").eq("id", body.documentId).eq("event_id", eventId).eq("sponsor_id", sponsorId)
      .eq("uploaded_by_type", "sponsor").eq("uploaded_by_user_id", user!.id).eq("status", "pending").maybeSingle();
    if (documentError) return NextResponse.json({ error: "Der Upload konnte nicht bestätigt werden." }, { status: 500 });
    if (!document) return NextResponse.json({ error: "Der Upload wurde nicht gefunden oder ist bereits abgeschlossen." }, { status: 404 });
    const pathParts = document.storage_path.split("/");
    const filename = pathParts.at(-1)!;
    const { data: files, error: fileError } = await admin.storage.from(sponsorUploadBucket).list(pathParts.slice(0, -1).join("/"), { limit: 100, search: filename });
    const uploaded = (files ?? []).find((file) => file.name === filename);
    const actualSize = Number(uploaded?.metadata?.size ?? 0);
    if (fileError || !uploaded || !actualSize || actualSize !== Number(document.size_bytes)) return NextResponse.json({ error: "Die Datei ist nicht vollständig angekommen oder hat eine ungültige Größe." }, { status: 409 });
    const { error: updateError } = await admin.from("sponsor_documents").update({ status: "uploaded", uploaded_at: new Date().toISOString() }).eq("id", document.id);
    if (updateError) return NextResponse.json({ error: "Die Datei konnte nicht im Dokumentenbereich gespeichert werden." }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unbekannte Upload-Aktion." }, { status: 400 });
}

export async function DELETE(request: Request, context: Context) {
  const { eventId, sponsorId, user, response } = await authorize(context);
  if (response) return response;
  const body = await request.json().catch(() => null) as { documentId?: unknown } | null;
  if (typeof body?.documentId !== "string" || !isUuid(body.documentId)) return NextResponse.json({ error: "Ungültiges Dokument." }, { status: 400 });
  const admin = createAdminClient();
  const { data: document, error: loadError } = await admin.from("sponsor_documents").select("id, storage_path")
    .eq("id", body.documentId).eq("event_id", eventId).eq("sponsor_id", sponsorId)
    .eq("uploaded_by_type", "sponsor").eq("uploaded_by_user_id", user!.id).maybeSingle();
  if (loadError) return NextResponse.json({ error: "Das Dokument konnte nicht geladen werden." }, { status: 500 });
  if (!document) return NextResponse.json({ error: "Du kannst nur eigene Uploads löschen." }, { status: 404 });
  const { error: deleteError } = await admin.from("sponsor_documents").delete().eq("id", document.id);
  if (deleteError) return NextResponse.json({ error: "Das Dokument konnte nicht aus der Liste entfernt werden." }, { status: 500 });
  const { error: storageError } = await admin.storage.from(sponsorUploadBucket).remove([document.storage_path]);
  if (storageError) return NextResponse.json({ error: "Der Eintrag wurde entfernt, die Datei konnte aber nicht vollständig gelöscht werden." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
