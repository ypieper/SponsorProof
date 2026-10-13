"use client";

import { useEffect, useState, type FormEvent, type MouseEvent } from "react";
import { Icon } from "@/components/ui";
import { AccountSettings } from "@/components/account-settings";
import { TeamSettings } from "@/components/team-settings";
import { ContractTemplateSettings } from "@/components/contract-template-settings";
import { formatIban, lookupGermanBank, normalizeIban, validateIban } from "@/lib/bank-lookup";
import { normalizeCityName } from "@/lib/location";

type TabName = "Stammdaten" | "Ansprechperson" | "Vertragsvorlage" | "Meine Daten" | "Team";
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
  organization: "",
  street: "",
  streetNumber: "",
  postalCode: "",
  city: "",
  iban: "",
  bic: "",
  bank: "",
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
};
const settingsStorageKey = "sponsorproof.organizer-settings.v1";

function Field({ label, value, onChange, type = "text", placeholder, required = false, readOnly = false, autoComplete, onBlur, message, messageKind = "hint" }: {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  readOnly?: boolean;
  autoComplete?: string;
  onBlur?: () => void;
  message?: string;
  messageKind?: "hint" | "error" | "success";
}) {
  return <label className="settings-field">
    <span>{label}{required && <span className="required-mark"> *</span>}</span>
    <input type={type} value={value} onChange={onChange ? (event) => onChange(event.target.value) : undefined} onBlur={onBlur} placeholder={placeholder} required={required} readOnly={readOnly} autoComplete={autoComplete} />
    {message && <span className={`field-message ${messageKind}`} role={messageKind === "error" ? "alert" : "status"}>{message}</span>}
  </label>;
}

export function SettingsForm() {
  const [activeTab, setActiveTab] = useState<TabName>("Stammdaten");
  const [settings, setSettings] = useState<Settings>(initialSettings);
  const [ibanDisplay, setIbanDisplay] = useState("");
  const [ibanTouched, setIbanTouched] = useState(false);
  const [bankLookup, setBankLookup] = useState<"found" | "not-found" | "unsupported" | null>(null);
  const [postalCodeStatus, setPostalCodeStatus] = useState<"idle" | "loading" | "valid" | "invalid" | "unavailable">("idle");
  const [postalCodeTouched, setPostalCodeTouched] = useState(false);
  const [settingsReady, setSettingsReady] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const ibanStatus = validateIban(settings.iban);

  useEffect(() => {
    const selectTabFromUrl = () => {
      const selected = new URLSearchParams(window.location.search).get("tab");
      const tabByUrl: Record<string, TabName> = {
        stammdaten: "Stammdaten",
        ansprechperson: "Ansprechperson",
        vertragsvorlage: "Vertragsvorlage",
        profile: "Meine Daten",
        "meine-daten": "Meine Daten",
        team: "Team",
      };
      setActiveTab(tabByUrl[selected ?? ""] ?? "Stammdaten");
    };
    selectTabFromUrl();
    window.addEventListener("popstate", selectTabFromUrl);
    return () => window.removeEventListener("popstate", selectTabFromUrl);
  }, []);

  function openSettingsTab(tab: TabName, event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    const tabParam: Record<TabName, string> = {
      Stammdaten: "stammdaten",
      Ansprechperson: "ansprechperson",
      Vertragsvorlage: "vertragsvorlage",
      "Meine Daten": "profile",
      Team: "team",
    };
    const href = `/einstellungen?tab=${tabParam[tab]}`;
    window.history.pushState({}, "", href);
    setActiveTab(tab);
  }

  useEffect(() => {
    const postalCode = settings.postalCode;
    if (!/^\d{5}$/.test(postalCode)) {
      setPostalCodeStatus("idle");
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setPostalCodeStatus("loading");
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
            setSettings((current) => current.postalCode === postalCode ? { ...current, city: "" } : current);
            return;
          }
          setPostalCodeStatus("valid");
          setSettings((current) => current.postalCode === postalCode ? { ...current, city: result.city! } : current);
        })
        .catch(() => {
          if (!controller.signal.aborted) setPostalCodeStatus("unavailable");
        });
    }, 300);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [settings.postalCode]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(settingsStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<Settings>;
        const loaded = { ...initialSettings, ...parsed, city: normalizeCityName(parsed.city ?? "") };
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

  function handlePostalCodeChange(value: string) {
    const postalCode = value.replace(/\D/g, "").slice(0, 5);
    setPostalCodeTouched(true);
    setSettings((current) => ({ ...current, postalCode, city: "" }));
    setPostalCodeStatus("idle");
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
    setPostalCodeTouched(true);
    if (!/^\d{5}$/.test(settings.postalCode)) {
      setPostalCodeStatus("invalid");
      setSaveMessage("");
      return;
    }
    if (postalCodeStatus === "invalid") {
      setSaveMessage("");
      return;
    }
    if (postalCodeStatus !== "valid") {
      setSaveMessage(postalCodeStatus === "unavailable" ? "Die PLZ konnte gerade nicht geprüft werden. Bitte versuche es erneut." : "Die PLZ wird geprüft. Bitte warte kurz.");
      return;
    }
    try {
      localStorage.setItem(settingsStorageKey, JSON.stringify(settings));
      window.dispatchEvent(new Event("sponsorproof:organizer-settings-updated"));
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
  const postalCodeMessage = postalCodeStatus === "invalid" && postalCodeTouched
    ? "Bitte gib eine gültige PLZ ein."
    : postalCodeStatus === "unavailable" && postalCodeTouched
      ? "Die PLZ konnte gerade nicht geprüft werden. Bitte versuche es erneut."
      : postalCodeStatus === "loading" && postalCodeTouched
        ? "PLZ wird geprüft …"
        : undefined;

  return <section className="settings-card panel">
    <div className="settings-tabs" role="tablist" aria-label="Einstellungsbereiche">
      {(["Stammdaten", "Ansprechperson", "Vertragsvorlage", "Meine Daten", "Team"] as const).map((tab) => {
        const tabId = tab === "Meine Daten" ? "meine-daten" : tab === "Team" ? "team" : tab === "Vertragsvorlage" ? "vertragsvorlage" : tab;
        const panelId = `settings-panel-${tabId}`;
        const tabParam = tab === "Meine Daten" ? "profile" : tab === "Team" ? "team" : tab === "Vertragsvorlage" ? "vertragsvorlage" : tab === "Ansprechperson" ? "ansprechperson" : "stammdaten";
        return <a key={tab} href={`/einstellungen?tab=${tabParam}`} role="tab" id={`settings-tab-${tabId}`} aria-selected={activeTab === tab} aria-controls={panelId} aria-current={activeTab === tab ? "page" : undefined} className={`settings-tab ${activeTab === tab ? "active" : ""}`} onClick={(event) => openSettingsTab(tab, event)}>{tab}</a>;
      })}
    </div>

    {activeTab === "Team" ? <div id="settings-panel-team" role="tabpanel" aria-labelledby="settings-tab-team"><TeamSettings /></div> : activeTab === "Meine Daten" ? <div id="settings-panel-meine-daten" role="tabpanel" aria-labelledby="settings-tab-meine-daten"><AccountSettings /></div> : activeTab === "Vertragsvorlage" ? <ContractTemplateSettings /> : <form className="settings-form" onSubmit={saveSettings}>
    {activeTab === "Stammdaten" ? <div id="settings-panel-Stammdaten" role="tabpanel" aria-labelledby="settings-tab-Stammdaten" className="settings-panel-content">
      <div className="settings-section">
        <div className="settings-section-heading"><span className="settings-section-icon"><Icon name="pin" size={16}/></span><div><h2>Anschrift</h2><p>Bezeichnung und offizielle Anschrift des Veranstalters.</p></div></div>
        <div className="settings-grid">
          <div className="settings-field-full"><Field label="Bezeichnung" value={settings.organization} onChange={(value) => update("organization", value)} required autoComplete="organization" /></div>
          <Field label="Straße" value={settings.street} onChange={(value) => update("street", value)} required autoComplete="address-line1" />
          <Field label="Nr." value={settings.streetNumber} onChange={(value) => update("streetNumber", value)} required autoComplete="address-line2" />
          <Field label="PLZ" value={settings.postalCode} onChange={handlePostalCodeChange} message={postalCodeMessage} messageKind={postalCodeStatus === "invalid" || postalCodeStatus === "unavailable" ? "error" : "hint"} required autoComplete="postal-code" />
          <Field label="Ort" value={settings.city} required readOnly placeholder={postalCodeStatus === "loading" ? "Wird ermittelt …" : "Wird aus der PLZ übernommen"} autoComplete="address-level2" />
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
    </form>}
  </section>;
}
