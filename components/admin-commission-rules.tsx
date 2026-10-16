"use client";

import { useCallback, useEffect, useState } from "react";

type Rule = { id: string; name: string; product_code: string; commission_model: string; commission_value: number; valid_from: string; valid_until: string | null; is_active: boolean };

const products = [
  ["all_events", "Alle Event-Tarife"],
  ["contracts_5", "Starter"],
  ["contracts_7", "Plus"],
  ["contracts_10", "Pro"],
  ["contracts_15", "Event"],
  ["enterprise", "Enterprise"],
];

export function AdminCommissionRules() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [days, setDays] = useState(30);
  const [name, setName] = useState("");
  const [product, setProduct] = useState("all_events");
  const [model, setModel] = useState("percentage");
  const [value, setValue] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [deletingRuleId, setDeletingRuleId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/commission-rules", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    setRules(data.rules ?? []);
    setDays(data.settings?.attribution_window_days ?? 30);
  }, []);

  useEffect(() => { void load().catch((error) => setMessage(error.message)); }, [load]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/commission-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, productCode: product, model, value: Number(value), validFrom: validFrom || undefined, validUntil: validUntil || undefined }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setName(""); setValue(""); setValidFrom(""); setValidUntil("");
      setMessage("Provisionsregel gespeichert.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Regel konnte nicht gespeichert werden.");
    } finally {
      setBusy(false);
    }
  }

  async function saveDays() {
    const response = await fetch("/api/admin/commission-rules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "settings", attributionWindowDays: days }) });
    const data = await response.json();
    setMessage(response.ok ? "Attributionsfenster gespeichert." : data.error);
  }

  async function toggleRule(rule: Rule) {
    const response = await fetch("/api/admin/commission-rules", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: rule.id, isActive: !rule.is_active }) });
    const data = await response.json();
    setMessage(response.ok ? "Regelstatus gespeichert." : data.error);
    if (response.ok) await load();
  }

  async function deleteRule(rule: Rule) {
    const confirmed = window.confirm(`Provisionsregel „${rule.name}“ wirklich löschen? Bereits erfasste Provisionen bleiben erhalten.`);
    if (!confirmed) return;
    setDeletingRuleId(rule.id);
    setMessage("");
    try {
      const response = await fetch("/api/admin/commission-rules", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: rule.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setMessage(data.auditWarning
        ? "Provisionsregel gelöscht. Bereits erfasste Provisionen bleiben erhalten; der Audit-Eintrag konnte nicht gespeichert werden."
        : "Provisionsregel gelöscht. Bereits erfasste Provisionen bleiben erhalten.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Regel konnte nicht gelöscht werden.");
    } finally {
      setDeletingRuleId(null);
    }
  }

  return <>
    <section className="panel partner-config-card">
      <h2>Attribution</h2>
      <p>Eine gültige Vermittlung gilt für den ersten neu angelegten Veranstalterbereich. Der Zeitraum wird zentral festgelegt.</p>
      <div className="partner-inline-form"><label className="settings-field"><span>Attributionsfenster in Tagen</span><input type="number" min="1" max="365" value={days} onChange={(event) => setDays(Number(event.target.value))}/></label><button className="btn" type="button" onClick={() => void saveDays()}>Speichern</button></div>
    </section>
    <form className="panel partner-config-card" onSubmit={save}>
      <h2>Provisionsregel hinzufügen</h2>
      <p>Die Provision entsteht bei bestätigten Zahlungen für jedes neu bestellte Event des vermittelten Veranstalterbereichs. Die Berechnungsgrundlage ist immer der bestätigte Nettobetrag.</p>
      <div className="partner-rule-form">
        <label className="settings-field"><span>Bezeichnung</span><input required value={name} onChange={(event) => setName(event.target.value)} placeholder="z. B. Standard-Provision"/></label>
        <label className="settings-field"><span>Tarif</span><select value={product} onChange={(event) => setProduct(event.target.value)}>{products.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>
        <label className="settings-field"><span>Modell</span><select value={model} onChange={(event) => setModel(event.target.value)}><option value="percentage">Prozent</option><option value="fixed">Festbetrag je Zahlung (€)</option></select></label>
        <label className="settings-field"><span>{model === "percentage" ? "Provisionssatz (%)" : "Betrag (€)"}</span><input type="number" min="0.01" step="0.01" required value={value} onChange={(event) => setValue(event.target.value)}/></label>
        <label className="settings-field"><span>Gültig ab</span><input type="datetime-local" value={validFrom} onChange={(event) => setValidFrom(event.target.value)}/></label>
        <label className="settings-field"><span>Gültig bis (optional)</span><input type="datetime-local" value={validUntil} onChange={(event) => setValidUntil(event.target.value)}/></label>
      </div>
      <button className="btn btn-primary" disabled={busy}>{busy ? "Wird gespeichert …" : "Regel speichern"}</button>
    </form>
    {message && <p className="admin-feedback" role="status">{message}</p>}
    <section className="panel partner-admin-list">
      <h2>Aktive und frühere Regeln</h2>
      {rules.length === 0 ? <p className="admin-empty">Noch keine Regeln. Damit werden aktuell keine Provisionen erzeugt.</p> : rules.map((rule) => <div className="partner-rule-wrap" key={rule.id}>
        <div className="partner-rule-row"><strong>{rule.name}</strong><span>{products.find(([code]) => code === rule.product_code)?.[1] ?? rule.product_code}</span><span>{rule.commission_model === "percentage" ? `${rule.commission_value}%` : `${Number(rule.commission_value).toFixed(2)} €`}</span><span>{new Date(rule.valid_from).toLocaleDateString("de-DE")}{rule.valid_until ? ` – ${new Date(rule.valid_until).toLocaleDateString("de-DE")}` : " · offen"}</span><span className={`admin-access-badge ${rule.is_active ? "active" : "suspended"}`}>{rule.is_active ? "Aktiv" : "Inaktiv"}</span><div className="partner-rule-actions"><button className="btn" type="button" onClick={() => void toggleRule(rule)}>{rule.is_active ? "Deaktivieren" : "Aktivieren"}</button><button className="btn btn-danger" type="button" disabled={deletingRuleId === rule.id} onClick={() => void deleteRule(rule)}>{deletingRuleId === rule.id ? "Wird gelöscht …" : "Löschen"}</button></div></div>
        <RuleEditor rule={rule} onSaved={load}/>
      </div>)}
    </section>
  </>;
}

function localDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function RuleEditor({ rule, onSaved }: { rule: Rule; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(rule.name);
  const [model, setModel] = useState(rule.commission_model);
  const [value, setValue] = useState(String(rule.commission_value));
  const [from, setFrom] = useState(localDate(rule.valid_from));
  const [until, setUntil] = useState(localDate(rule.valid_until));
  const [message, setMessage] = useState("");

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/admin/commission-rules", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: rule.id, name, model, value: Number(value), validFrom: from, validUntil: until }) });
    const data = await response.json();
    if (!response.ok) { setMessage(data.error); return; }
    setMessage("Änderungen gespeichert.");
    await onSaved();
  }

  return <details className="partner-rule-editor"><summary>Regel bearbeiten</summary><form onSubmit={save}>
    <label className="settings-field"><span>Bezeichnung</span><input required value={name} onChange={(event) => setName(event.target.value)}/></label>
    <label className="settings-field"><span>Modell</span><select value={model} onChange={(event) => setModel(event.target.value)}><option value="percentage">Prozent</option><option value="fixed">Festbetrag (€)</option></select></label>
    <label className="settings-field"><span>{model === "percentage" ? "Satz (%)" : "Festbetrag (€)"}</span><input type="number" min="0.01" step="0.01" required value={value} onChange={(event) => setValue(event.target.value)}/></label>
    <label className="settings-field"><span>Gültig ab</span><input type="datetime-local" required value={from} onChange={(event) => setFrom(event.target.value)}/></label>
    <label className="settings-field"><span>Gültig bis</span><input type="datetime-local" value={until} onChange={(event) => setUntil(event.target.value)}/></label>
    <button className="btn" type="submit">Änderungen speichern</button>{message && <small role="status">{message}</small>}
  </form></details>;
}
