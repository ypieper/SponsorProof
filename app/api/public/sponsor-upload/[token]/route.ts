import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { findActiveSponsorUploadLink, isUuid, sponsorUploadBucket, validateSponsorUploadFile } from "@/lib/sponsor-upload-server";

type Context = { params: Promise<{ token: string }> };
type UploadRequest = { action?: unknown; documentId?: unknown; fileName?: unknown; contentType?: unknown; size?: unknown };

export async function GET(_request: Request, context: Context) {
  const { token } = await context.params;
  const record = await findActiveSponsorUploadLink(token);
  if (!record) return NextResponse.json({ error: "Dieser Upload-Link ist ungültig oder wurde deaktiviert." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  const { data: uploadedDocuments, error: documentsError } = await record.admin.from("sponsor_documents")
    .select("id, file_name, size_bytes, uploaded_at")
    .eq("event_id", record.link.event_id).eq("sponsor_id", record.link.sponsor_id)
    .eq("uploaded_by_type", "sponsor").eq("status", "uploaded")
    .order("uploaded_at", { ascending: false });
  if (documentsError) return NextResponse.json({ error: "Deine bereits übermittelten Dateien konnten nicht geladen werden." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  const { data: organizerLogo } = record.organizerLogoPath
    ? await record.admin.storage.from(sponsorUploadBucket).createSignedUrl(record.organizerLogoPath, 60 * 60 * 24)
    : { data: null };
  return NextResponse.json({
    eventTitle: record.eventTitle,
    organizerLogoUrl: organizerLogo?.signedUrl ?? null,
    sponsorName: record.sponsorName,
    contactFirstName: record.contactFirstName,
    contactLastName: record.contactLastName,
    benefits: record.benefits,
    uploadedDocuments: uploadedDocuments ?? [],
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, context: Context) {
  const { token } = await context.params;
  const record = await findActiveSponsorUploadLink(token);
  if (!record) return NextResponse.json({ error: "Dieser Upload-Link ist ungültig oder wurde deaktiviert." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  const body = await request.json().catch(() => null) as UploadRequest | null;
  if (!body) return NextResponse.json({ error: "Bitte prüfe die Datei und versuche es erneut." }, { status: 400 });

  if (body.action === "prepare") {
    if (typeof body.fileName !== "string" || typeof body.contentType !== "string" || typeof body.size !== "number") {
      return NextResponse.json({ error: "Dateiinformationen fehlen." }, { status: 400 });
    }
    const file = validateSponsorUploadFile({ name: body.fileName, contentType: body.contentType, size: body.size });
    if (!file) return NextResponse.json({ error: "Erlaubt sind PDF-, Word- und Bilddateien bis 25 MB." }, { status: 400 });
    const documentId = randomUUID();
    const fileKey = `${randomUUID()}.${file.extension}`;
    const storagePath = `${record.link.organization_id}/events/${record.link.event_id}/sponsor-documents/${record.link.sponsor_id}/${fileKey}`;
    const { error: insertError } = await record.admin.from("sponsor_documents").insert({
      id: documentId,
      organization_id: record.link.organization_id,
      event_id: record.link.event_id,
      sponsor_id: record.link.sponsor_id,
      upload_link_id: record.link.id,
      storage_path: storagePath,
      file_name: file.fileName,
      content_type: file.contentType,
      size_bytes: body.size,
      uploaded_by_type: "sponsor",
      uploaded_by_name: "Sponsor",
      status: "pending",
    });
    if (insertError) return NextResponse.json({ error: "Der Upload konnte nicht vorbereitet werden." }, { status: 500 });
    const { data: signedUpload, error: signedUploadError } = await record.admin.storage.from(sponsorUploadBucket).createSignedUploadUrl(storagePath);
    if (signedUploadError || !signedUpload) {
      await record.admin.from("sponsor_documents").delete().eq("id", documentId);
      return NextResponse.json({ error: "Der sichere Datei-Upload konnte nicht gestartet werden." }, { status: 500 });
    }
    return NextResponse.json({ documentId, storagePath: signedUpload.path, uploadToken: signedUpload.token, contentType: file.contentType }, { headers: { "Cache-Control": "no-store" } });
  }

  if (body.action === "complete") {
    if (typeof body.documentId !== "string" || !isUuid(body.documentId)) return NextResponse.json({ error: "Ungültige Upload-Kennung." }, { status: 400 });
    const { data: document, error: documentError } = await record.admin.from("sponsor_documents")
      .select("id, storage_path, size_bytes, file_name")
      .eq("id", body.documentId).eq("upload_link_id", record.link.id).eq("status", "pending").maybeSingle();
    if (documentError) return NextResponse.json({ error: "Der Upload konnte nicht bestätigt werden." }, { status: 500 });
    if (!document) return NextResponse.json({ error: "Der Upload wurde nicht gefunden oder ist bereits abgeschlossen." }, { status: 404 });
    const pathParts = document.storage_path.split("/");
    const folder = pathParts.slice(0, -1).join("/");
    const filename = pathParts[pathParts.length - 1];
    const { data: files, error: fileError } = await record.admin.storage.from(sponsorUploadBucket).list(folder, { limit: 100, search: filename });
    const uploaded = (files ?? []).find((file) => file.name === filename);
    if (fileError || !uploaded) return NextResponse.json({ error: "Die Datei ist noch nicht vollständig angekommen. Bitte versuche den Upload erneut." }, { status: 409 });
    const actualSize = Number(uploaded.metadata?.size ?? 0);
    if (!actualSize || actualSize !== Number(document.size_bytes)) {
      await record.admin.storage.from(sponsorUploadBucket).remove([document.storage_path]);
      await record.admin.from("sponsor_documents").delete().eq("id", document.id);
      return NextResponse.json({ error: "Die übermittelte Datei hat eine ungültige Dateigröße." }, { status: 400 });
    }
    const { error: updateError } = await record.admin.from("sponsor_documents").update({ status: "uploaded", uploaded_at: new Date().toISOString() }).eq("id", document.id);
    if (updateError) return NextResponse.json({ error: "Die Datei wurde geladen, konnte aber nicht in der Dokumentenliste gespeichert werden." }, { status: 500 });
    await record.admin.from("sponsor_upload_links").update({ last_used_at: new Date().toISOString() }).eq("id", record.link.id);
    return NextResponse.json({ fileName: document.file_name }, { headers: { "Cache-Control": "no-store" } });
  }

  return NextResponse.json({ error: "Unbekannte Upload-Aktion." }, { status: 400 });
}
