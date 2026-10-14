"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { AccountDeletionSettings } from "@/components/account-deletion-settings";
import { WorkspaceDataExport } from "@/components/workspace-data-export";

type Account = { firstName: string; lastName: string; email: string };

export function AccountSettings() {
  const [account, setAccount] = useState<Account>({ firstName: "", lastName: "", email: "" });
  const [password, setPassword] = useState("");
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setReady(true);
      return;
    }

    void createClient().auth.getUser().then(({ data, error }) => {
      if (error || !data.user) {
        setMessage("Deine Kontodaten konnten nicht geladen werden. Bitte melde dich erneut an.");
      } else {
        setAccount({
          firstName: String(data.user.user_metadata?.first_name ?? ""),
          lastName: String(data.user.user_metadata?.last_name ?? ""),
          email: data.user.email ?? "",
        });
      }
      setReady(true);
    }).catch(() => {
      setMessage("Deine Kontodaten konnten nicht geladen werden.");
      setReady(true);
    });
  }, []);

  function update<K extends keyof Account>(key: K, value: Account[K]) {
    setAccount((current) => ({ ...current, [key]: value }));
    setMessage("");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isSupabaseConfigured) return;

    setSaving(true);
    setMessage("");
    try {
      const client = createClient();
      const { data: currentData, error: currentError } = await client.auth.getUser();
      if (currentError || !currentData.user) throw new Error("load");

      const emailChanged = account.email.trim().toLowerCase() !== (currentData.user.email ?? "").toLowerCase();
      const { error } = await client.auth.updateUser({
        data: { first_name: account.firstName.trim(), last_name: account.lastName.trim() },
        ...(emailChanged ? { email: account.email.trim() } : {}),
        ...(password ? { password } : {}),
      });
      if (error) throw error;

      setPassword("");
      window.dispatchEvent(new Event("sponsorproof:user-account-updated"));
      setMessage(emailChanged
        ? "Deine Angaben wurden gespeichert. Bitte bestätige die neue E-Mail-Adresse über den zugesandten Link."
        : "Deine Kontodaten wurden gespeichert.");
    } catch {
      setMessage("Die Kontodaten konnten nicht gespeichert werden. Bitte prüfe deine Eingaben und versuche es erneut.");
    } finally {
      setSaving(false);
    }
  }

  return <form className="settings-form account-settings-form" onSubmit={save}>
      <div className="settings-panel-content">
        <div className="settings-section">
          <div className="settings-section-heading"><span className="settings-section-icon"><Icon name="users" size={16}/></span><div><h2>Persönliche Daten</h2><p>Dein Name und die E-Mail-Adresse für deine Anmeldung.</p></div></div>
          {!isSupabaseConfigured ? <p className="auth-setup-message">Die Kontoverwaltung ist verfügbar, sobald Supabase eingerichtet ist.</p> : <div className="settings-grid">
            <Field label="Vorname" value={account.firstName} onChange={(value) => update("firstName", value)} autoComplete="given-name" />
            <Field label="Nachname" value={account.lastName} onChange={(value) => update("lastName", value)} autoComplete="family-name" />
            <div className="settings-field-full"><Field label="E-Mail-Adresse" value={account.email} onChange={(value) => update("email", value)} type="email" required autoComplete="email" /></div>
          </div>}
        </div>

        {isSupabaseConfigured && <div className="settings-section">
          <div className="settings-section-heading"><span className="settings-section-icon"><Icon name="settings" size={16}/></span><div><h2>Passwort ändern</h2><p>Lass das Feld leer, wenn du dein Passwort behalten möchtest.</p></div></div>
          <div className="settings-grid"><div className="settings-field-full"><Field label="Neues Passwort" value={password} onChange={setPassword} type="password" placeholder="Mindestens 8 Zeichen" autoComplete="new-password" /></div></div>
        </div>}

        {isSupabaseConfigured && <WorkspaceDataExport />}
        {isSupabaseConfigured && <AccountDeletionSettings />}
      </div>

      <div className="settings-save-row"><p role="status" aria-live="polite">{message || (ready ? "Deine Kontodaten werden sicher in deinem Konto gespeichert." : "Kontodaten werden geladen …")}</p><button className="btn btn-primary" type="submit" disabled={!ready || saving || !isSupabaseConfigured}><Icon name="check" size={15}/>{saving ? "Wird gespeichert …" : "Speichern"}</button></div>
  </form>;
}

function Field({ label, value, onChange, type = "text", placeholder, required = false, autoComplete }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  autoComplete?: string;
}) {
  return <label className="settings-field"><span>{label}{required && <span className="required-mark"> *</span>}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} required={required} minLength={type === "password" ? 8 : undefined} autoComplete={autoComplete} /></label>;
}
