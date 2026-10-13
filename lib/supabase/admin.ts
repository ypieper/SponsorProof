import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { supabaseUrl } from "@/lib/supabase/config";

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export function isPlatformAdminConfigured() {
  return Boolean(supabaseUrl && serviceRoleKey);
}

export function createAdminClient() {
  if (!isPlatformAdminConfigured()) {
    throw new Error("Die serverseitige Admin-Verwaltung ist nicht konfiguriert.");
  }

  return createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

export async function isCurrentUserPlatformAdmin() {
  if (!isPlatformAdminConfigured()) return false;
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return false;

  const admin = createAdminClient();
  const { data, error: lookupError } = await admin
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  return !lookupError && Boolean(data);
}

export async function getAuthorizedPlatformAdmin() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { user: null, admin: null, responseStatus: 401 as const };
  if (!isPlatformAdminConfigured()) return { user, admin: null, responseStatus: 503 as const };

  const admin = createAdminClient();
  const { data, error: lookupError } = await admin
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (lookupError) return { user, admin: null, responseStatus: 503 as const };
  if (!data) return { user, admin: null, responseStatus: 403 as const };
  return { user, admin, responseStatus: null };
}
