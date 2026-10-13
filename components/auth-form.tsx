"use client";

import { useState, type FormEvent } from "react";
import { Icon } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export function AuthForm({ initialMode = "login", invitation = false }: { initialMode?: "login" | "signup"; invitation?: boolean }) {
  const [mode, setMode] = useState<"login" | "signup" | "recovery">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  function postAuthPath() {
    const query = new URLSearchParams(window.location.search);
    const next = query.get("next");
    if (next?.startsWith("/") && !next.startsWith("//")) return next;
    const token = query.get("token");
    return token ? `/team/join?token=${encodeURIComponent(token)}` : "/";
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isSupabaseConfigured) return;

    setBusy(true);
    setMessage("");
    const supabase = createClient();

    if (mode === "recovery") {
      const redirectTo = `${window.location.origin}/auth/confirm?next=${encodeURIComponent("/passwort-zuruecksetzen")}`;
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      setMessage(error
        ? "Die E-Mail konnte nicht angefordert werden. Bitte versuche es später erneut."
        : "Wenn ein Konto mit dieser E-Mail-Adresse besteht, erhältst du in Kürze einen Link zum Zurücksetzen des Passworts.");
      setBusy(false);
      return;
    }

    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setMessage("Anmeldung fehlgeschlagen. Bitte prüfe E-Mail-Adresse und Passwort.");
        setBusy(false);
        return;
      }
      window.location.assign(postAuthPath());
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent(postAuthPath())}` },
    });
    if (error) {
      setMessage("Das Konto konnte nicht erstellt werden. Prüfe die Angaben oder versuche es später erneut.");
    } else if (data.session) {
      window.location.assign(postAuthPath());
      return;
    } else {
      setMessage(invitation
        ? "Fast geschafft: Bitte bestätige deine E-Mail-Adresse über den Link in deinem Postfach. Danach wirst du automatisch zum Veranstalterbereich weitergeleitet."
        : "Fast geschafft: Bitte bestätige deine E-Mail-Adresse über den Link, den Supabase dir geschickt hat.");
    }
    setBusy(false);
  }

  return <section className="auth-card">
    <div className="auth-brand"><span className="brand-mark"><Icon name="check" size={19}/></span><span>sponso</span></div>
    <div className="auth-heading"><h1>{mode === "login" ? invitation ? "Einladung annehmen" : "Willkommen zurück" : mode === "signup" ? invitation ? "Konto für die Einladung erstellen" : "Konto erstellen" : "Passwort zurücksetzen"}</h1><p>{mode === "login" ? invitation ? "Melde dich mit der eingeladenen E-Mail-Adresse an, um dem Veranstalterbereich beizutreten." : "Melde dich an, um deine Events zu verwalten." : mode === "signup" ? invitation ? "Lege mit der eingeladenen E-Mail-Adresse ein eigenes Konto an. Danach erhältst du Zugriff auf den gemeinsamen Veranstalterbereich." : "Erstelle dein Veranstalterkonto für sponso." : "Wir senden dir einen Link an deine E-Mail-Adresse."}</p></div>
    {!isSupabaseConfigured ? <div className="auth-setup-message"><b>Supabase-Verbindung noch unvollständig</b><p>Ergänze Projekt-URL und Publishable Key in der lokalen Datei <code>.env.local</code>. Danach den Entwicklungsserver neu starten.</p></div> : <form className="auth-form" onSubmit={submit}>
      <label className="settings-field"><span>E-Mail-Adresse</span><input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@veranstalter.de" /></label>
      {mode !== "recovery" && <label className="settings-field"><span>Passwort</span><input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Mindestens 8 Zeichen" /></label>}
      {message && <p className="auth-message" role="status">{message}</p>}
      <button className="btn btn-primary auth-submit" type="submit" disabled={busy}>{busy ? "Einen Moment …" : mode === "login" ? "Anmelden" : mode === "signup" ? invitation ? "Konto erstellen und beitreten" : "Konto erstellen" : "Reset-Link anfordern"}</button>
      {mode === "login" && <button className="auth-mode-switch" type="button" onClick={() => { setMode("recovery"); setMessage(""); }}>Passwort vergessen?</button>}
      {mode !== "recovery" ? <button className="auth-mode-switch" type="button" onClick={() => { setMode((current) => current === "login" ? "signup" : "login"); setMessage(""); }}>{mode === "login" ? "Noch kein Konto? Konto erstellen" : "Schon registriert? Anmelden"}</button> : <button className="auth-mode-switch" type="button" onClick={() => { setMode("login"); setMessage(""); }}>Zurück zur Anmeldung</button>}
    </form>}
  </section>;
}
