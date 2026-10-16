import "server-only";

import { createAdminClient, isPlatformAdminConfigured } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const sponsorUploadBucket = "sponsorproof-files";
export const sponsorUploadMaxBytes = 25 * 1024 * 1024;
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

export async function authorizeSponsorAccountEvent(eventId: string, sponsorId: string) {
  if (!isPlatformAdminConfigured()) return { user: null, error: "server" as const };
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { user: null, error: "auth" as const };
  const admin = createAdminClient();
  const { data: memberships, error: membershipError } = await admin.from("sponsor_account_members")
    .select("account_id").eq("user_id", user.id);
  if (membershipError) return { user: null, error: "database" as const };
  const accountIds = (memberships ?? []).map((membership) => membership.account_id);
  if (!accountIds.length) return { user: null, error: "access" as const };
  const { data: assignment, error: assignmentError } = await admin.from("sponsor_event_accounts")
    .select("event_id").eq("event_id", eventId).eq("sponsor_id", sponsorId).in("account_id", accountIds).maybeSingle();
  if (assignmentError) return { user: null, error: "database" as const };
  if (!assignment) return { user: null, error: "access" as const };
  return { user, error: null };
}
