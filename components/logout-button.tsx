"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export function LogoutButton() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  if (!isSupabaseConfigured) return null;

  async function logout() {
    setBusy(true);
    setMessage("");
    try {
      const { error } = await createClient().auth.signOut();
      if (error) throw error;
      window.location.assign("/login");
    } catch {
      setMessage("Abmeldung fehlgeschlagen. Bitte versuche es erneut.");
      setBusy(false);
    }
  }

  return <>{message && <span className="logout-error" role="status">{message}</span>}<button className="btn logout-button" type="button" disabled={busy} onClick={() => { void logout(); }}>{busy ? "Abmelden …" : "Abmelden"}</button></>;
}
