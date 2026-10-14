import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { createAdminClient, isPlatformAdminConfigured } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const sponsorUploadBucket = "sponsorproof-files";
export const sponsorUploadMaxBytes = 25 * 1024 * 1024;
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const supportedTypes: Record<string, { contentType: string; extensions: string[] }> = {
  pdf: { contentType: "application/pdf", extensions: ["pdf"] },
  doc: { contentType: "application/msword", extensions: ["doc"] },
  docx: { contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", extensions: ["docx"] },
  jpg: { contentType: "image/jpeg", extensions: ["jpg", "jpeg"] },
  jpeg: { contentType: "image/jpeg", extensions: ["jpg", "jpeg"] },
  png: { contentType: "image/png", extensions: ["png"] },
  webp: { contentType: "image/webp", extensions: ["webp"] },
};

export function isUuid(value: string) {
  return uuidPattern.test(value);
}

export function hashSponsorUploadToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function sponsorUploadTokenEncryptionKey() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) throw new Error("Die serverseitige Verschlüsselung der Upload-Links ist nicht konfiguriert.");
  return createHash("sha256").update(`sponso:sponsor-upload-links:v1:${serviceRoleKey}`, "utf8").digest();
}

export function encryptSponsorUploadToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", sponsorUploadTokenEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptSponsorUploadToken(payload: string) {
  const [version, encodedIv, encodedTag, encodedCiphertext] = payload.split(".");
  if (version !== "v1" || !encodedIv || !encodedTag || !encodedCiphertext) throw new Error("Ungültig gespeicherter Sponsor-Upload-Link.");
  const decipher = createDecipheriv("aes-256-gcm", sponsorUploadTokenEncryptionKey(), Buffer.from(encodedIv, "base64url"));
  decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encodedCiphertext, "base64url")), decipher.final()]).toString("utf8");
}

export function isSponsorUploadToken(token: string) {
  return tokenPattern.test(token);
}

export function validateSponsorUploadFile(file: { name: string; contentType: string; size: number }) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const type = supportedTypes[extension];
  if (!type || file.size <= 0 || file.size > sponsorUploadMaxBytes) return null;
  if (file.contentType && file.contentType !== type.contentType && file.contentType !== "application/octet-stream") return null;
  const safeName = file.name.replace(/[^a-zA-Z0-9._ -]+/g, "-").trim().slice(0, 180) || `Datei.${extension}`;
  return { extension, contentType: type.contentType, fileName: safeName };
}

export async function authorizeEventSponsor(eventId: string, sponsorId: string) {
  if (!isPlatformAdminConfigured()) return { user: null, error: "server" as const };
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { user: null, error: "auth" as const };
  const { data: assignment, error } = await supabase
    .from("event_sponsors")
    .select("event_id")
    .eq("event_id", eventId)
    .eq("sponsor_id", sponsorId)
    .maybeSingle();
  if (error) return { user: null, error: "database" as const };
  if (!assignment) return { user: null, error: "access" as const };
  return { user, error: null };
}

export async function findActiveSponsorUploadLink(token: string) {
  if (!isSponsorUploadToken(token) || !isPlatformAdminConfigured()) return null;
  const admin = createAdminClient();
  const { data: link, error: linkError } = await admin
    .from("sponsor_upload_links")
    .select("id, organization_id, event_id, sponsor_id, is_active, expires_at")
    .eq("token_hash", hashSponsorUploadToken(token))
    .maybeSingle();
  if (linkError || !link?.is_active) return null;
  if (new Date(link.expires_at).getTime() <= Date.now()) {
    await admin.from("sponsor_upload_links").update({ is_active: false }).eq("id", link.id);
    return null;
  }
  const [{ data: event, error: eventError }, { data: sponsor, error: sponsorError }, { data: benefits, error: benefitsError }] = await Promise.all([
    admin.from("events").select("title, organization_id, organizer_logo_path").eq("id", link.event_id).maybeSingle(),
    admin.from("sponsors").select("name, organization_id, contact_first_name, contact_last_name").eq("id", link.sponsor_id).maybeSingle(),
    admin.from("benefits").select("id, title, description, category").eq("event_id", link.event_id).eq("sponsor_id", link.sponsor_id).order("created_at", { ascending: true }),
  ]);
  if (eventError || sponsorError || benefitsError || !event || !sponsor || event.organization_id !== link.organization_id || sponsor.organization_id !== link.organization_id) return null;
  return {
    admin,
    link,
    eventTitle: event.title,
    organizerLogoPath: event.organizer_logo_path ?? null,
    sponsorName: sponsor.name,
    contactFirstName: sponsor.contact_first_name?.trim() ?? "",
    contactLastName: sponsor.contact_last_name?.trim() ?? "",
    benefits: benefits ?? [],
  };
}
