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
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordMessageIsError, setPasswordMessageIsError] = useState(false);
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

  async function savePersonalData(event: FormEvent<HTMLFormElement>) {
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
      });
      if (error) throw error;

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

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isSupabaseConfigured || passwordSaving) return;
    if (newPassword !== confirmPassword) {
      setPasswordMessage("Die beiden neuen Passwörter stimmen nicht überein.");
      setPasswordMessageIsError(true);
      return;
    }

    setPasswordSaving(true);
    setPasswordMessage("");
    setPasswordMessageIsError(false);
    try {
      const client = createClient();
      const { data, error: userError } = await client.auth.getUser();
      const email = data.user?.email;
      if (userError || !email) throw new Error("Dein Konto konnte nicht geprüft werden. Bitte melde dich erneut an.");

      const { error: verifyError } = await client.auth.signInWithPassword({ email, password: currentPassword });
      if (verifyError) throw new Error("Das aktuelle Passwort ist nicht korrekt.");

      const { error } = await client.auth.updateUser({ password: newPassword });
      if (error) throw error;

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMessage("Dein Passwort wurde geändert.");
    } catch (cause) {
      setPasswordMessage(cause instanceof Error ? cause.message : "Das Passwort konnte nicht geändert werden.");
      setPasswordMessageIsError(true);
    } finally {
      setPasswordSaving(false);
    }
  }

  return <div className="settings-tab-sections account-settings-sections">
    <form className="account-settings-area" onSubmit={savePersonalData}>
      <div className="settings-section-heading"><span className="settings-section-icon"><Icon name="users" size={16}/></span><div><h2>Persönliche Daten</h2><p>Dein Name und die E-Mail-Adresse für deine Anmeldung.</p></div></div>
      {!isSupabaseConfigured ? <p className="auth-setup-message">Die Kontoverwaltung ist verfügbar, sobald Supabase eingerichtet ist.</p> : <div className="settings-grid">
        <Field label="Vorname" value={account.firstName} onChange={(value) => update("firstName", value)} autoComplete="given-name" />
        <Field label="Nachname" value={account.lastName} onChange={(value) => update("lastName", value)} autoComplete="family-name" />
        <div className="settings-field-full"><Field label="E-Mail-Adresse" value={account.email} onChange={(value) => update("email", value)} type="email" required autoComplete="email" /></div>
      </div>}
      <div className="account-settings-save-row"><p role="status" aria-live="polite">{message || (ready ? "Deine Angaben werden sicher in deinem Konto gespeichert." : "Kontodaten werden geladen …")}</p><button className="btn btn-primary" type="submit" disabled={!ready || saving || !isSupabaseConfigured}><Icon name="check" size={15}/>{saving ? "Wird gespeichert …" : "Angaben speichern"}</button></div>
    </form>

    {isSupabaseConfigured && <form className="account-settings-area" onSubmit={changePassword}>
      <div className="settings-section-heading"><span className="settings-section-icon"><Icon name="settings" size={16}/></span><div><h2>Passwort ändern</h2><p>Bestätige dein aktuelles Passwort und gib das neue zweimal ein.</p></div></div>
      <div className="settings-grid account-password-fields">
        <Field label="Aktuelles Passwort" value={currentPassword} onChange={setCurrentPassword} type="password" required autoComplete="current-password" />
        <Field label="Neues Passwort" value={newPassword} onChange={setNewPassword} type="password" placeholder="Mindestens 8 Zeichen" required autoComplete="new-password" />
        <Field label="Neues Passwort wiederholen" value={confirmPassword} onChange={setConfirmPassword} type="password" placeholder="Neues Passwort erneut eingeben" required autoComplete="new-password" />
      </div>
      <div className="account-settings-save-row"><p className={passwordMessageIsError ? "error" : ""} role={passwordMessageIsError ? "alert" : "status"} aria-live="polite">{passwordMessage || "Mindestens 8 Zeichen. Das neue Passwort muss in beiden Feldern übereinstimmen."}</p><button className="btn btn-primary" type="submit" disabled={!ready || passwordSaving || !currentPassword || !newPassword || !confirmPassword}><Icon name="check" size={15}/>{passwordSaving ? "Passwort wird geändert …" : "Passwort ändern"}</button></div>
    </form>}

    {isSupabaseConfigured && <WorkspaceDataExport />}
    {isSupabaseConfigured && <AccountDeletionSettings />}
  </div>;
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
