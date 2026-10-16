"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { normalizeCityName } from "@/lib/location";

export type SponsorMasterData = {
  name: string;
  street: string;
  streetNumber: string;
  postalCode: string;
  city: string;
  vatId: string;
  contactFirstName: string;
  contactLastName: string;
  email: string;
  phone: string;
};

export type PostalCodeStatus = "idle" | "loading" | "valid" | "invalid" | "unavailable";

export const emptySponsorMasterData: SponsorMasterData = {
  name: "", street: "", streetNumber: "", postalCode: "", city: "", vatId: "",
  contactFirstName: "", contactLastName: "", email: "", phone: "",
};

function Field({ label, value, onChange, type = "text", required = false, readOnly = false, autoComplete, maxLength, message }: {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  type?: string;
  required?: boolean;
  readOnly?: boolean;
  autoComplete?: string;
  maxLength?: number;
  message?: { text: string; kind: "hint" | "error" };
}) {
  return <label className="settings-field">
    <span>{label}{required && <span className="required-mark"> *</span>}</span>
    <input type={type} value={value} onChange={onChange ? (event) => onChange(event.target.value) : undefined} required={required} readOnly={readOnly} autoComplete={autoComplete} maxLength={maxLength} />
    {message && <span className={`field-message ${message.kind}`} role={message.kind === "error" ? "alert" : "status"}>{message.text}</span>}
  </label>;
}

export function SponsorMasterDataFields({ value, onChange, onPostalCodeStatusChange }: {
  value: SponsorMasterData;
  onChange: Dispatch<SetStateAction<SponsorMasterData>>;
  onPostalCodeStatusChange: (status: PostalCodeStatus) => void;
}) {
  const [postalCodeStatus, setPostalCodeStatus] = useState<PostalCodeStatus>("idle");

  useEffect(() => {
    const postalCode = value.postalCode;
    if (!/^\d{5}$/.test(postalCode)) {
      const status = postalCode ? "invalid" : "idle";
      setPostalCodeStatus(status);
      onPostalCodeStatusChange(status);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setPostalCodeStatus("loading");
      onPostalCodeStatusChange("loading");
      void fetch(`/api/postal-code?postalCode=${encodeURIComponent(postalCode)}`, { signal: controller.signal })
        .then(async (response) => {
          if (response.status === 404) return { valid: false, city: "" };
          if (!response.ok) throw new Error("lookup-unavailable");
          return await response.json() as { valid: boolean; city?: string };
        })
        .then((result) => {
          if (controller.signal.aborted) return;
          if (!result.valid || !result.city) {
            setPostalCodeStatus("invalid");
            onPostalCodeStatusChange("invalid");
            onChange((current) => current.postalCode === postalCode ? { ...current, city: "" } : current);
            return;
          }
          const city = normalizeCityName(result.city);
          setPostalCodeStatus("valid");
          onPostalCodeStatusChange("valid");
          onChange((current) => current.postalCode === postalCode ? { ...current, city } : current);
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setPostalCodeStatus("unavailable");
            onPostalCodeStatusChange("unavailable");
          }
        });
    }, 300);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [value.postalCode, onChange, onPostalCodeStatusChange]);

  const postalMessage = postalCodeStatus === "invalid"
    ? { text: "Bitte gib eine gültige PLZ ein.", kind: "error" as const }
    : postalCodeStatus === "unavailable"
      ? { text: "PLZ-Prüfung nicht verfügbar. Ort bitte manuell eintragen.", kind: "hint" as const }
      : postalCodeStatus === "loading"
        ? { text: "PLZ wird geprüft …", kind: "hint" as const }
        : undefined;

  function update<K extends keyof SponsorMasterData>(key: K, next: SponsorMasterData[K]) {
    onChange((current) => ({ ...current, [key]: next }));
  }

  function updatePostalCode(next: string) {
    setPostalCodeStatus("idle");
    onPostalCodeStatusChange("idle");
    const postalCode = next.replace(/\D/g, "").slice(0, 5);
    onChange((current) => ({ ...current, postalCode, city: "" }));
  }

  return <>
    <section className="settings-section">
      <div className="settings-section-heading"><div><h2>Unternehmen und Anschrift</h2><p>Firmenname und vollständige Anschrift.</p></div></div>
      <div className="settings-grid">
        <Field label="Unternehmensname / Bezeichnung" value={value.name} onChange={(next) => update("name", next)} required autoComplete="organization" maxLength={120} />
        <Field label="Straße" value={value.street} onChange={(next) => update("street", next)} required autoComplete="address-line1" />
        <Field label="Hausnummer" value={value.streetNumber} onChange={(next) => update("streetNumber", next)} required autoComplete="address-line2" />
        <Field label="PLZ" value={value.postalCode} onChange={updatePostalCode} required autoComplete="postal-code" maxLength={5} message={postalMessage} />
        <Field label="Ort" value={value.city} onChange={(next) => update("city", next)} required autoComplete="address-level2" />
        <Field label="USt-IdNr." value={value.vatId} onChange={(next) => update("vatId", next)} />
      </div>
    </section>
    <section className="settings-section">
      <div className="settings-section-heading"><div><h2>Ansprechperson</h2><p>Kontakt für Rückfragen und Vertragsunterlagen.</p></div></div>
      <div className="settings-grid">
        <Field label="Vorname" value={value.contactFirstName} onChange={(next) => update("contactFirstName", next)} required autoComplete="given-name" />
        <Field label="Nachname" value={value.contactLastName} onChange={(next) => update("contactLastName", next)} required autoComplete="family-name" />
        <Field label="E-Mail" value={value.email} onChange={(next) => update("email", next)} type="email" required autoComplete="email" />
        <Field label="Telefon" value={value.phone} onChange={(next) => update("phone", next)} type="tel" autoComplete="tel" />
      </div>
    </section>
  </>;
}
