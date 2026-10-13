"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui";
import { formatIban, lookupGermanBank, normalizeIban, validateIban } from "@/lib/bank-lookup";

type TabName = "Stammdaten" | "Ansprechperson";
type Settings = {
  organization: string;
  street: string;
  streetNumber: string;
  postalCode: string;
  city: string;
  iban: string;
  bic: string;
  bank: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
};

const initialSettings: Settings = {
  organization: "Stadtlicht Events",
  street: "",
  streetNumber: "",
  postalCode: "",
  city: "",
  iban: "",
  bic: "",
  bank: "",
  firstName: "Maria",
  lastName: "Krüger",
  email: "maria@stadtlicht-events.de",
  phone: "",
};
const settingsStorageKey = "sponsorproof.organizer-settings.v1";

function Field({ label, value, onChange, type = "text", placeholder, required = false, readOnly = false, autoComplete, onBlur }: {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  readOnly?: boolean;
  autoComplete?: string;
  onBlur?: () => void;
}) {
  return <label className="settings-field">
    <span>{label}{required && <span className="required-mark"> *</span>}</span>
    <input type={type} value={value} onChange={onChange ? (event) => onChange(event.target.value) : undefined} onBlur={onBlur} placeholder={placeholder} required={required} readOnly={readOnly} autoComplete={autoComplete} />
  </label>;
}

export function SettingsForm() {
  const [activeTab, setActiveTab] = useState<TabName>("Stammdaten");
  const [settings, setSettings] = useState<Settings>(initialSettings);
  const [ibanDisplay, setIbanDisplay] = useState("");
  const [ibanTouched, setIbanTouched] = useState(false);
  const [bankLookup, setBankLookup] = useState<"found" | "not-found" | "unsupported" | null>(null);
  const [settingsReady, setSettingsReady] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const ibanStatus = validateIban(settings.iban);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(settingsStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<Settings>;
        const loaded = { ...initialSettings, ...parsed };
        setSettings(loaded);
        setIbanDisplay(formatIban(loaded.iban));
      }
    } catch {
      setSaveMessage("Gespeicherte Einstellungen konnten nicht geladen werden.");
    } finally {
      setSettingsReady(true);
    }
  }, []);

  useEffect(() => {
    if (ibanStatus !== "valid") {
      setBankLookup(null);
      return;
    }

    const iban = normalizeIban(settings.iban);
    if (!iban.startsWith("DE")) {
      setBankLookup("unsupported");
      return;
    }

    const bank = lookupGermanBank(iban.slice(4, 12));
    if (!bank) {
      setBankLookup("not-found");
      return;
    }

    setBankLookup("found");
    setSettings((current) => ({ ...current, bank: bank.name, bic: bank.bic }));
  }, [ibanStatus, settings.iban]);

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
    setSaveMessage("");
  }

  function handleIbanChange(value: string) {
    const iban = normalizeIban(value);
    setIbanDisplay(value.toUpperCase());
    setSettings((current) => ({ ...current, iban, bank: "", bic: "" }));
    setBankLookup(null);
    setIbanTouched(true);
    setSaveMessage("");
  }

  function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      localStorage.setItem(settingsStorageKey, JSON.stringify(settings));
      setSaveMessage("Einstellungen auf diesem Gerät gespeichert.");
    } catch {
      setSaveMessage("Die Einstellungen konnten nicht gespeichert werden.");
    }
  }

  const ibanMessage = (() => {
    if (!ibanTouched || ibanStatus === "empty") return null;
    if (ibanStatus === "incomplete") return { kind: "hint", text: "Bitte die vollständige IBAN eingeben." };
    if (ibanStatus === "invalid") return { kind: "error", text: "Die IBAN ist ungültig. Bitte Länderkennung, Länge und Prüfziffer kontrollieren." };
    if (ibanStatus === "unsupported") return { kind: "hint", text: "Dieses IBAN-Land ist nicht in der lokalen Prüfliste enthalten." };
    if (bankLookup === "unsupported") return { kind: "hint", text: "Die automatische Ermittlung von Kreditinstitut und Bankverbindung wird nur für deutsche Bankverbindungen unterstützt. Du kannst Kreditinstitut und BIC manuell ergänzen." };
    if (bankLookup === "not-found") return { kind: "hint", text: "IBAN gültig, aber die Bankleitzahl wurde im lokalen Verzeichnis nicht gefunden." };
    if (bankLookup === "found") return { kind: "success", text: "IBAN erfolgreich geprüft. Kreditinstitut und BIC wurden auf der Grundlage automatisch ermittelt." };
    return null;
  })();

  const bankPlaceholder = bankLookup === "unsupported" ? undefined : bankLookup === "not-found" ? "Bitte manuell ergänzen" : "Wird automatisch ermittelt";

  return <section className="settings-card panel">
    <div className="settings-tabs" role="tablist" aria-label="Einstellungsbereiche">
      {(["Stammdaten", "Ansprechperson"] as const).map((tab) => <button key={tab} type="button" role="tab" id={`settings-tab-${tab}`} aria-selected={activeTab === tab} aria-controls={`settings-panel-${tab}`} className={`settings-tab ${activeTab === tab ? "active" : ""}`} onClick={() => setActiveTab(tab)}>{tab}</button>)}
    </div>

    <form className="settings-form" onSubmit={saveSettings}>
    {activeTab === "Stammdaten" ? <div id="settings-panel-Stammdaten" role="tabpanel" aria-labelledby="settings-tab-Stammdaten" className="settings-panel-content">
      <div className="settings-section">
        <div className="settings-section-heading"><span className="settings-section-icon"><Icon name="pin" size={16}/></span><div><h2>Anschrift</h2><p>Bezeichnung und offizielle Anschrift des Veranstalters.</p></div></div>
        <div className="settings-grid">
          <div className="settings-field-full"><Field label="Bezeichnung" value={settings.organization} onChange={(value) => update("organization", value)} required autoComplete="organization" /></div>
          <Field label="Straße" value={settings.street} onChange={(value) => update("street", value)} required autoComplete="address-line1" />
          <Field label="Nr." value={settings.streetNumber} onChange={(value) => update("streetNumber", value)} required autoComplete="address-line2" />
          <Field label="PLZ" value={settings.postalCode} onChange={(value) => update("postalCode", value)} required autoComplete="postal-code" />
          <Field label="Ort" value={settings.city} onChange={(value) => update("city", value)} required autoComplete="address-level2" />
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-heading"><span className="settings-section-icon"><Icon name="file" size={16}/></span><div><h2>Bankverbindung</h2><p>Bankdaten werden nach Eingabe der IBAN lokal ermittelt.</p></div></div>
        <div className="settings-grid">
          <div className="settings-field settings-field-full">
            <Field label="IBAN" value={ibanDisplay} onChange={handleIbanChange} onBlur={() => setIbanDisplay(formatIban(settings.iban))} placeholder="DE00 0000 0000 0000 0000 00" autoComplete="iban" />
            {ibanMessage && <p className={`field-message ${ibanMessage.kind}`} role="status">{ibanMessage.text}</p>}
          </div>
          <Field label="Kreditinstitut" value={settings.bank} onChange={(value) => update("bank", value)} placeholder={bankPlaceholder} autoComplete="off" />
          <Field label="BIC" value={settings.bic} onChange={(value) => update("bic", value.toUpperCase())} placeholder={bankPlaceholder} autoComplete="off" />
        </div>
      </div>
    </div> : <div id="settings-panel-Ansprechperson" role="tabpanel" aria-labelledby="settings-tab-Ansprechperson" className="settings-panel-content">
      <div className="settings-section">
        <div className="settings-section-heading"><span className="settings-section-icon"><Icon name="users" size={16}/></span><div><h2>Ansprechperson</h2><p>Kontakt für Rückfragen und Vertragsunterlagen.</p></div></div>
        <div className="settings-grid">
          <Field label="Vorname" value={settings.firstName} onChange={(value) => update("firstName", value)} required autoComplete="given-name" />
          <Field label="Nachname" value={settings.lastName} onChange={(value) => update("lastName", value)} required autoComplete="family-name" />
          <Field label="E-Mail" value={settings.email} onChange={(value) => update("email", value)} type="email" required autoComplete="email" />
          <Field label="Telefon" value={settings.phone} onChange={(value) => update("phone", value)} type="tel" autoComplete="tel" />
        </div>
      </div>
    </div>}
    <div className="settings-save-row"><p role="status" aria-live="polite">{saveMessage || (settingsReady ? "Wird nur in diesem Browser gespeichert." : "Einstellungen werden geladen …")}</p><button className="btn btn-primary" type="submit" disabled={!settingsReady}><Icon name="check" size={15}/>Speichern</button></div>
    </form>
  </section>;
}
