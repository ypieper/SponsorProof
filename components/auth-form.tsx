"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export function AuthForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
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

    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setMessage("Anmeldung fehlgeschlagen. Bitte prüfe E-Mail-Adresse und Passwort.");
        setBusy(false);
        return;
      }
      router.replace(postAuthPath());
      router.refresh();
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
      router.replace(postAuthPath());
      router.refresh();
      return;
    } else {
      setMessage("Fast geschafft: Bitte bestätige deine E-Mail-Adresse über den Link, den Supabase dir geschickt hat.");
    }
    setBusy(false);
  }

  return <section className="auth-card">
    <div className="auth-brand"><span className="brand-mark"><Icon name="check" size={19}/></span><span>sponso</span></div>
    <div className="auth-heading"><h1>{mode === "login" ? "Willkommen zurück" : "Konto erstellen"}</h1><p>{mode === "login" ? "Melde dich an, um deine Events zu verwalten." : "Erstelle dein Veranstalterkonto für sponso."}</p></div>
    {!isSupabaseConfigured ? <div className="auth-setup-message"><b>Supabase-Verbindung noch unvollständig</b><p>Ergänze Projekt-URL und Publishable Key in der lokalen Datei <code>.env.local</code>. Danach den Entwicklungsserver neu starten.</p></div> : <form className="auth-form" onSubmit={submit}>
      <label className="settings-field"><span>E-Mail-Adresse</span><input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@veranstalter.de" /></label>
      <label className="settings-field"><span>Passwort</span><input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Mindestens 8 Zeichen" /></label>
      {message && <p className="auth-message" role="status">{message}</p>}
      <button className="btn btn-primary auth-submit" type="submit" disabled={busy}>{busy ? "Einen Moment …" : mode === "login" ? "Anmelden" : "Konto erstellen"}</button>
      <button className="auth-mode-switch" type="button" onClick={() => { setMode((current) => current === "login" ? "signup" : "login"); setMessage(""); }}>{mode === "login" ? "Noch kein Konto? Konto erstellen" : "Schon registriert? Anmelden"}</button>
    </form>}
  </section>;
}
