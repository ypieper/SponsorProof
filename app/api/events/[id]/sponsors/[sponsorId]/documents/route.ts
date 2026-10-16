import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { authorizeEventSponsor, isUuid, sponsorUploadBucket, validateSponsorUploadFile } from "@/lib/sponsor-upload-server";
import { createAdminClient } from "@/lib/supabase/admin";

type Context = { params: Promise<{ id: string; sponsorId: string }> };
type DocumentRequest = { action?: unknown; documentId?: unknown; fileName?: unknown; contentType?: unknown; size?: unknown; category?: unknown; published?: unknown };
const documentCategories = ["tickets", "event_info", "other"] as const;

export async function GET(_request: Request, context: Context) {
  const { id: eventId, sponsorId } = await context.params;
  if (!isUuid(eventId) || !isUuid(sponsorId)) return NextResponse.json({ error: "Ungültiges Event oder Sponsor." }, { status: 400 });
  const auth = await authorizeEventSponsor(eventId, sponsorId);
  if (auth.error === "auth") return NextResponse.json({ error: "Bitte melde dich erneut an." }, { status: 401 });
  if (auth.error === "access") return NextResponse.json({ error: "Du hast keinen Zugriff auf diesen Sponsor in diesem Event." }, { status: 403 });
  if (auth.error) return NextResponse.json({ error: "Der Zugriff konnte nicht geprüft werden." }, { status: auth.error === "server" ? 503 : 500 });
  const admin = createAdminClient();
  const { data, error } = await admin.from("sponsor_documents")
    .select("id, storage_path, file_name, content_type, size_bytes, uploaded_at, uploaded_by_type, uploaded_by_name, uploaded_by_user_id, document_role, document_category, published_to_sponsor, contract_id")
    .eq("event_id", eventId).eq("sponsor_id", sponsorId).eq("status", "uploaded")
    .order("uploaded_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Sponsorendokumente konnten nicht geladen werden. Prüfe die Datenbankmigration." }, { status: 500 });
  const nameLookups = new Map<string, Promise<string>>();
  const documents = await Promise.all((data ?? []).map(async (document) => {
    if (document.uploaded_by_type !== "organizer") return document;
    const savedName = String(document.uploaded_by_name ?? "").trim();
    if (savedName && !savedName.includes("@") && savedName !== "Veranstalter-Nutzer") {
      return document;
    }
    const userId = document.uploaded_by_user_id;
    if (!userId) return { ...document, uploaded_by_name: "Veranstalter-Nutzer" };
    if (!nameLookups.has(userId)) {
      nameLookups.set(userId, admin.auth.admin.getUserById(userId).then(({ data: result }) => {
        const metadata = result.user?.user_metadata ?? {};
        const firstName = String(metadata.first_name ?? "").trim();
        const lastName = String(metadata.last_name ?? "").trim();
        const fullName = [firstName, lastName].filter(Boolean).join(" ");
        const alternateName = String(metadata.full_name ?? metadata.name ?? "").trim();
        return fullName || (alternateName && !alternateName.includes("@") ? alternateName : "Veranstalter-Nutzer");
      }).catch(() => "Veranstalter-Nutzer"));
    }
    return { ...document, uploaded_by_name: await nameLookups.get(userId)! };
  }));
  return NextResponse.json({ documents }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, context: Context) {
  const { id: eventId, sponsorId } = await context.params;
  if (!isUuid(eventId) || !isUuid(sponsorId)) return NextResponse.json({ error: "Ungültiges Event oder Sponsor." }, { status: 400 });
  const auth = await authorizeEventSponsor(eventId, sponsorId);
  if (auth.error === "auth") return NextResponse.json({ error: "Bitte melde dich erneut an." }, { status: 401 });
  if (auth.error === "access") return NextResponse.json({ error: "Du hast keinen Zugriff auf diesen Sponsor in diesem Event." }, { status: 403 });
  if (auth.error) return NextResponse.json({ error: "Der Zugriff konnte nicht geprüft werden." }, { status: auth.error === "server" ? 503 : 500 });

  const body = await request.json().catch(() => null) as DocumentRequest | null;
  if (!body) return NextResponse.json({ error: "Bitte prüfe die Datei und versuche es erneut." }, { status: 400 });
  const admin = createAdminClient();

  if (body.action === "publication") {
    if (typeof body.documentId !== "string" || !isUuid(body.documentId) || typeof body.published !== "boolean") {
      return NextResponse.json({ error: "Ungültige Dokumentenfreigabe." }, { status: 400 });
    }
    const { data: document, error: documentError } = await admin.from("sponsor_documents")
      .select("id, document_role")
      .eq("id", body.documentId).eq("event_id", eventId).eq("sponsor_id", sponsorId)
      .eq("uploaded_by_type", "organizer").eq("status", "uploaded").maybeSingle();
    if (documentError) return NextResponse.json({ error: "Das Dokument konnte nicht geprüft werden." }, { status: 500 });
    if (!document || document.document_role === "signed_contract") return NextResponse.json({ error: "Dieses Dokument kann hier nicht veröffentlicht werden." }, { status: 404 });
    const { error: updateError } = await admin.from("sponsor_documents")
      .update({ published_to_sponsor: body.published })
      .eq("id", document.id).eq("event_id", eventId).eq("sponsor_id", sponsorId);
    if (updateError) return NextResponse.json({ error: "Der Veröffentlichungsstatus konnte nicht gespeichert werden." }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "prepare") {
    if (typeof body.fileName !== "string" || typeof body.contentType !== "string" || typeof body.size !== "number") {
      return NextResponse.json({ error: "Dateiinformationen fehlen." }, { status: 400 });
    }
    const file = validateSponsorUploadFile({ name: body.fileName, contentType: body.contentType, size: body.size });
    if (!file) return NextResponse.json({ error: "Erlaubt sind PDF-, Word- und Bilddateien bis 25 MB." }, { status: 400 });
    const category = documentCategories.find((option) => option === body.category) ?? "other";
    const { data: event, error: eventError } = await admin.from("events").select("organization_id").eq("id", eventId).maybeSingle();
    if (eventError || !event?.organization_id) return NextResponse.json({ error: "Die Veranstaltungsdaten konnten nicht geladen werden." }, { status: 500 });

    const metadata = auth.user!.user_metadata ?? {};
    const firstName = String(metadata.first_name ?? "").trim();
    const lastName = String(metadata.last_name ?? "").trim();
    const profileName = String(metadata.full_name ?? metadata.name ?? "").trim();
    const userName = [firstName, lastName].filter(Boolean).join(" ") || (profileName && !profileName.includes("@") ? profileName : "Veranstalter-Nutzer");
    const documentId = randomUUID();
    const storagePath = `${event.organization_id}/events/${eventId}/sponsor-documents/${sponsorId}/${randomUUID()}.${file.extension}`;
    const { error: insertError } = await admin.from("sponsor_documents").insert({
      id: documentId,
      organization_id: event.organization_id,
      event_id: eventId,
      sponsor_id: sponsorId,
      storage_path: storagePath,
      file_name: file.fileName,
      content_type: file.contentType,
      size_bytes: body.size,
      uploaded_by_type: "organizer",
      uploaded_by_user_id: auth.user!.id,
      uploaded_by_name: String(userName).slice(0, 180),
      uploaded_by_email: null,
      document_category: category,
      published_to_sponsor: false,
      status: "pending",
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
      .select("id, storage_path, size_bytes")
      .eq("id", body.documentId).eq("event_id", eventId).eq("sponsor_id", sponsorId)
      .eq("uploaded_by_type", "organizer").eq("uploaded_by_user_id", auth.user!.id).eq("status", "pending").maybeSingle();
    if (documentError) return NextResponse.json({ error: "Der Upload konnte nicht bestätigt werden." }, { status: 500 });
    if (!document) return NextResponse.json({ error: "Der Upload wurde nicht gefunden oder ist bereits abgeschlossen." }, { status: 404 });
    const pathParts = document.storage_path.split("/");
    const filename = pathParts[pathParts.length - 1];
    const folder = pathParts.slice(0, -1).join("/");
    const { data: files, error: fileError } = await admin.storage.from(sponsorUploadBucket).list(folder, { limit: 100, search: filename });
    const uploaded = (files ?? []).find((file) => file.name === filename);
    const actualSize = Number(uploaded?.metadata?.size ?? 0);
    if (fileError || !uploaded || !actualSize || actualSize !== Number(document.size_bytes)) {
      return NextResponse.json({ error: "Die Datei ist nicht vollständig angekommen oder hat eine ungültige Größe." }, { status: 409 });
    }
    const { error: updateError } = await admin.from("sponsor_documents")
      .update({ status: "uploaded", uploaded_at: new Date().toISOString() }).eq("id", document.id);
    if (updateError) return NextResponse.json({ error: "Die Datei wurde geladen, konnte aber nicht im Archiv gespeichert werden." }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unbekannte Upload-Aktion." }, { status: 400 });
}

export async function DELETE(request: Request, context: Context) {
  const { id: eventId, sponsorId } = await context.params;
  if (!isUuid(eventId) || !isUuid(sponsorId)) return NextResponse.json({ error: "Ungültiges Event oder Sponsor." }, { status: 400 });
  const body = await request.json().catch(() => null) as { documentId?: unknown } | null;
  if (typeof body?.documentId !== "string" || !isUuid(body.documentId)) return NextResponse.json({ error: "Ungültiges Dokument." }, { status: 400 });
  const auth = await authorizeEventSponsor(eventId, sponsorId);
  if (auth.error === "auth") return NextResponse.json({ error: "Bitte melde dich erneut an." }, { status: 401 });
  if (auth.error === "access") return NextResponse.json({ error: "Du hast keinen Zugriff auf diesen Sponsor in diesem Event." }, { status: 403 });
  if (auth.error) return NextResponse.json({ error: "Der Zugriff konnte nicht geprüft werden." }, { status: auth.error === "server" ? 503 : 500 });
  const admin = createAdminClient();
  const { data: document, error: loadError } = await admin.from("sponsor_documents")
    .select("id, storage_path")
    .eq("id", body.documentId).eq("event_id", eventId).eq("sponsor_id", sponsorId).maybeSingle();
  if (loadError) return NextResponse.json({ error: "Das Dokument konnte nicht geladen werden." }, { status: 500 });
  if (!document) return NextResponse.json({ error: "Das Dokument wurde nicht gefunden." }, { status: 404 });
  const { error: deleteError } = await admin.from("sponsor_documents").delete().eq("id", document.id);
  if (deleteError) return NextResponse.json({ error: "Das Dokument konnte nicht aus der Liste entfernt werden." }, { status: 500 });
  const { error: storageError } = await admin.storage.from(sponsorUploadBucket).remove([document.storage_path]);
  if (storageError) return NextResponse.json({ error: "Der Eintrag wurde entfernt, die Datei konnte aber nicht vollständig gelöscht werden." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
