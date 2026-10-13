"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (!isSupabaseConfigured) return null;

  async function logout() {
    setBusy(true);
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return <button className="btn logout-button" type="button" disabled={busy} onClick={() => { void logout(); }}>{busy ? "Abmelden …" : "Abmelden"}</button>;
}
