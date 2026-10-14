"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type DeletionInfo = {
  email: string;
  role: "owner" | "member" | null;
  ownerCount: number;
  canDeleteAccount: boolean;
  canDeleteOrganization: boolean;
};
type DeletionMode = "account" | "organization";

export function AccountDeletionSettings() {
  const [info, setInfo] = useState<DeletionInfo | null>(null);
  const [mode, setMode] = useState<DeletionMode>("account");
  const [phrase, setPhrase] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const expectedPhrase = mode === "account" ? "KONTO LÖSCHEN" : "VERANSTALTERBEREICH LÖSCHEN";
  const canDeleteSelectedMode = mode === "account" ? info?.canDeleteAccount : info?.canDeleteOrganization;
  const buttonReady = phrase === expectedPhrase && confirmed && Boolean(canDeleteSelectedMode) && !busy;

  useEffect(() => {
    let active = true;
    void fetch("/api/account/deletion", { cache: "no-store" }).then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Kontostatus konnte nicht geladen werden.");
      if (active) {
        setInfo(result as DeletionInfo);
        if (!result.canDeleteAccount && result.canDeleteOrganization) setMode("organization");
      }
    }).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : "Kontostatus konnte nicht geladen werden.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const explanation = useMemo(() => mode === "account"
    ? "Dein Benutzerkonto und deine persönlichen Anmeldedaten werden gelöscht. Der Veranstalterbereich, Events, Sponsoren, Verträge, Aufgaben und Nachweise bleiben für die übrigen Mitglieder erhalten."
    : "Der Veranstalterbereich, alle Events, Sponsoren, Verträge, Aufgaben, Nachweise und Dateien werden unwiderruflich gelöscht. Dein Benutzerkonto bleibt bestehen; weitere Mitglieder verlieren den Zugriff auf diesen Veranstalterbereich.", [mode]);

  async function deleteData() {
    if (!buttonReady) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/account/deletion", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, confirmationPhrase: phrase, confirmed }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Die Löschung konnte nicht abgeschlossen werden.");
      if (mode === "organization") {
        const statusResponse = await fetch("/api/account/deletion", { cache: "no-store" });
        const status = await statusResponse.json();
        if (statusResponse.ok) setInfo(status as DeletionInfo);
        setMode("account");
        setPhrase("");
        setConfirmed(false);
        setNotice("Der Veranstalterbereich wurde gelöscht. Dein Benutzerkonto besteht weiterhin und kann separat gelöscht werden.");
        setBusy(false);
        return;
      }
      await createClient().auth.signOut();
      window.location.replace("/login");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Die Löschung konnte nicht abgeschlossen werden.");
      setBusy(false);
      setPhrase("");
      setConfirmed(false);
      void fetch("/api/account/deletion", { cache: "no-store" }).then(async (response) => {
        const result = await response.json();
        if (!response.ok) return;
        setInfo(result as DeletionInfo);
        if (result.canDeleteAccount && mode === "organization") setMode("account");
      }).catch(() => undefined);
    }
  }

  return <section className="settings-section account-deletion-section" aria-labelledby="account-deletion-heading">
    <div className="settings-section-heading"><span className="settings-section-icon account-delete-icon">!</span><div><h2 id="account-deletion-heading">Konto oder Veranstalterbereich löschen</h2><p>Diese Löschung kann nicht rückgängig gemacht werden.</p></div></div>
    {loading ? <p className="account-delete-status">Berechtigungen werden geprüft …</p> : !info ? <p className="field-message error" role="alert">{error}</p> : <>
      {notice && <p className="field-message success account-delete-notice" role="status">{notice}</p>}
      <div className="account-delete-options">
        <label className={`account-delete-option ${mode === "account" ? "selected" : ""} ${!info.canDeleteAccount ? "unavailable" : ""}`}>
          <input type="radio" name="deletion-mode" value="account" checked={mode === "account"} disabled={!info.canDeleteAccount || busy} onChange={() => { setMode("account"); setPhrase(""); setConfirmed(false); setError(""); }} />
          <span><strong>Nur mein Konto löschen</strong><small>Der Veranstalterbereich und seine Daten bleiben bestehen.</small></span>
        </label>
        <label className={`account-delete-option ${mode === "organization" ? "selected" : ""} ${!info.canDeleteOrganization ? "unavailable" : ""}`}>
          <input type="radio" name="deletion-mode" value="organization" checked={mode === "organization"} disabled={!info.canDeleteOrganization || busy} onChange={() => { setMode("organization"); setPhrase(""); setConfirmed(false); setError(""); }} />
          <span><strong>Gesamten Veranstalterbereich löschen</strong><small>Nur Inhaber können den Bereich entfernen. Dein Benutzerkonto bleibt bestehen.</small></span>
        </label>
      </div>
      {!info.canDeleteAccount && info.role === "owner" && <p className="account-delete-status">Du bist die letzte Inhaberin oder der letzte Inhaber. Dein Konto kann deshalb nicht einzeln gelöscht werden. Du kannst den gesamten Veranstalterbereich löschen und dein Konto anschließend separat entfernen.</p>}
      {info.role === "member" && info.ownerCount === 0 && <p className="account-delete-status error">Im Veranstalterbereich ist kein Inhaber hinterlegt. Bitte lass zuerst eine Person zur Inhaberin oder zum Inhaber ernennen.</p>}
      <div className="account-delete-warning"><strong>Das wird gelöscht</strong><p>{explanation}</p><p>Die Daten werden unwiderruflich entfernt. Erstelle vorher benötigte Exporte oder sichere Dateien.</p></div>
      <label className="settings-field account-delete-phrase"><span>Zur Bestätigung gib <b>{expectedPhrase}</b> ein.</span><input value={phrase} onChange={(event) => setPhrase(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} autoComplete="off" spellCheck={false} disabled={!canDeleteSelectedMode || busy} /></label>
      <label className="account-delete-check"><input type="checkbox" checked={confirmed} disabled={!canDeleteSelectedMode || busy} onChange={(event) => setConfirmed(event.target.checked)} /><span>Ich bestätige, dass ich die oben beschriebene Löschung verstanden habe und sie unwiderruflich ist.</span></label>
      {error && <p className="field-message error account-delete-error" role="alert">{error}</p>}
      <button className="btn btn-danger-soft account-delete-submit" type="button" disabled={!buttonReady} onClick={() => void deleteData()}>{busy ? "Daten werden gelöscht …" : mode === "account" ? "Konto unwiderruflich löschen" : "Veranstalterbereich unwiderruflich löschen"}</button>
    </>}
  </section>;
}
