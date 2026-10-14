"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

export function PublicContactForm({ defaultSubject }: { defaultSubject: "Enterprise-Anfrage" | "Allgemeine Anfrage" }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [subject, setSubject] = useState(defaultSubject);
  const [message, setMessage] = useState("");
  const [privacyRead, setPrivacyRead] = useState(false);
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(""); setSent(false);
    try {
      const response = await fetch("/api/contact", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, organizationName, subject, message, privacyRead, website }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Die Nachricht konnte nicht gesendet werden.");
      setSent(true); setName(""); setEmail(""); setOrganizationName(""); setMessage(""); setPrivacyRead(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Die Nachricht konnte nicht gesendet werden.");
    } finally { setBusy(false); }
  }

  return <form className="public-contact-form panel" onSubmit={(event) => void submit(event)}>
    <div className="settings-grid">
      <label className="settings-field"><span>Name *</span><input autoComplete="name" required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label className="settings-field"><span>E-Mail-Adresse *</span><input autoComplete="email" required type="email" maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <label className="settings-field settings-field-full"><span>Veranstalter oder Organisation</span><input autoComplete="organization" maxLength={160} value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} /></label>
      <label className="settings-field settings-field-full"><span>Worum geht es? *</span><select value={subject} onChange={(event) => setSubject(event.target.value as typeof subject)}><option>Enterprise-Anfrage</option><option>Allgemeine Anfrage</option></select></label>
      <label className="settings-field settings-field-full"><span>Nachricht *</span><textarea required minLength={10} maxLength={5000} rows={6} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Wie können wir weiterhelfen?" /></label>
      <label className="contact-honeypot" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} /></label>
    </div>
    <label className="contact-privacy-check"><input type="checkbox" required checked={privacyRead} onChange={(event) => setPrivacyRead(event.target.checked)} /><span>Ich habe die <Link href="/datenschutz" target="_blank">Datenschutzhinweise</Link> gelesen.</span></label>
    {error && <p className="field-message error" role="alert">{error}</p>}
    {sent && <p className="field-message success" role="status">Danke für deine Nachricht. Sie wurde übermittelt.</p>}
    <div className="public-contact-submit"><button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Wird gesendet …" : "Nachricht senden"}</button><span>Wir nutzen deine Angaben, um auf die Anfrage zu antworten.</span></div>
  </form>;
}
