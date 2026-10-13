"use client";

import { createBrowserClient } from "@supabase/ssr";
import { supabasePublishableKey, supabaseUrl } from "./config";

export function createClient() {
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error("Supabase ist noch nicht vollständig konfiguriert.");
  }

  return createBrowserClient(supabaseUrl, supabasePublishableKey);
}
