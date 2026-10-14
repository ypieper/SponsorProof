"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui";

type CodeRow = {
  id: string; code_hint: string; code: string | null; plan_code: "event" | "event_pro"; is_active: boolean;
  expires_at: string | null; max_uses: number | null; use_count: number;
  organization_id: string | null; organization_name: string | null;
  event_id: string | null; event_name: string | null; internal_note: string;
  created_at: string; deactivated_at: string | null;
};
type Organization = { id: string; name: string };
type EventOption = { id: string; title: string; organization_id: string };
type PlanOption = { code: "event" | "event_pro"; name: string; price_cents: number };

export function AdminActivationCodes() {
  const [codes, setCodes] = useState<CodeRow[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [plan, setPlan] = useState<"event" | "event_pro">("event");
  const [maxUses, setMaxUses] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [eventId, setEventId] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [createdCode, setCreatedCode] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deactivating, setDeactivating] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/activation-codes", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Freischaltcodes konnten nicht geladen werden.");
      setCodes(result.codes ?? []);
      setOrganizations(result.organizations ?? []);
      setEvents(result.events ?? []);
      setPlans(result.plans ?? []);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Freischaltcodes konnten nicht geladen werden.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function createCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError(""); setMessage(""); setCreatedCode("");
    try {
      const response = await fetch("/api/admin/activation-codes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, maxUses: maxUses || null, expiresAt: expiresAt || null, organizationId: organizationId || null, eventId: eventId || null, internalNote }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Der Freischaltcode konnte nicht erstellt werden.");
      setCreatedCode(result.code);
      setMessage("Der Code wurde erstellt und ist ab jetzt vollständig in der Adminübersicht sichtbar.");
      setMaxUses(""); setExpiresAt(""); setOrganizationId(""); setEventId(""); setInternalNote("");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Der Freischaltcode konnte nicht erstellt werden.");
    } finally { setSaving(false); }
  }

  async function deactivate(id: string) {
    if (deactivating) return;
    setDeactivating(id); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/admin/activation-codes/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: false }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Der Code konnte nicht deaktiviert werden.");
      setMessage("Der Freischaltcode wurde deaktiviert.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Der Code konnte nicht deaktiviert werden.");
    } finally { setDeactivating(null); }
  }

  const eligibleEvents = events.filter((item) => !organizationId || item.organization_id === organizationId);

  return <div className="admin-activation-codes">
    <section className="panel admin-toolbar"><div><strong>Freischaltcodes</strong><p>Alle Plattform-Admins sehen und verwalten dieselbe Codeübersicht – unabhängig davon, wer einen Code erstellt hat. Vollständige Codes sind nur für Plattform-Admins sichtbar.</p></div><span className="status status-progress">{codes.length} Codes</span></section>
    <section className="panel admin-code-create"><div className="panel-heading"><div><h2>Freischaltcode erstellen</h2><p>Der Code wird automatisch im Format S-Jahr-Zahlencode erstellt. Lege Tarif, Nutzungsgrenze und optionale Bindungen fest.</p></div></div>
      <form onSubmit={createCode}>
        <div className="settings-grid">
          <label className="settings-field"><span>Tarif</span><select value={plan} onChange={(event) => setPlan(event.target.value as "event" | "event_pro")}>{plans.map((item) => <option key={item.code} value={item.code}>{item.name} – {new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(item.price_cents / 100)}</option>)}</select></label>
          <label className="settings-field"><span>Maximale Nutzungen</span><input type="number" min="1" step="1" value={maxUses} onChange={(event) => setMaxUses(event.target.value)} placeholder="Unbegrenzt" /></label>
          <label className="settings-field"><span>Ablaufdatum (optional)</span><input type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /></label>
          <label className="settings-field"><span>Veranstalterbereich (optional)</span><select value={organizationId} onChange={(event) => { setOrganizationId(event.target.value); setEventId(""); }}><option value="">Alle Veranstalterbereiche</option>{organizations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="settings-field"><span>Event (optional)</span><select value={eventId} onChange={(event) => setEventId(event.target.value)}><option value="">Nicht an ein Event gebunden</option>{eligibleEvents.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
          <label className="settings-field settings-field-full"><span>Interne Notiz (optional)</span><input maxLength={500} value={internalNote} onChange={(event) => setInternalNote(event.target.value)} placeholder="Interne Zuordnung oder Anlass" /></label>
        </div>
        {error && <p className="field-message error" role="alert">{error}</p>}
        {message && <p className="field-message success" role="status">{message}</p>}
        {createdCode && <div className="admin-issued-code"><code>{createdCode}</code><button className="btn" type="button" onClick={() => { void navigator.clipboard.writeText(createdCode); setMessage("Code in die Zwischenablage kopiert."); }}><Icon name="check" size={14}/> Code kopieren</button></div>}
        <div className="create-modal-actions"><button className="btn btn-primary" type="submit" disabled={saving}>{saving ? "Wird erstellt …" : "Freischaltcode erstellen"}</button></div>
      </form>
    </section>
    <section className="panel table-panel admin-code-list"><div className="panel-heading"><div><h2>Alle Codes</h2><p>Alle Plattform-Admins sehen hier alle Codes. Vollständige Codes sind auf dem Server verschlüsselt und werden nur für Plattform-Admins entschlüsselt.</p></div></div>
      {loading ? <p className="task-empty">Codes werden geladen …</p> : codes.length === 0 ? <p className="task-empty">Es wurden noch keine Freischaltcodes erstellt.</p> : <div className="admin-code-table-wrap"><table className="table"><thead><tr><th>CODE</th><th>TARIF</th><th>STATUS</th><th>NUTZUNG</th><th>GEBUNDEN AN</th><th>ABLAUF</th><th>ERSTELLT</th><th>AKTION</th></tr></thead><tbody>{codes.map((item) => { const exhausted = item.max_uses !== null && item.use_count >= item.max_uses; const expired = Boolean(item.expires_at && new Date(item.expires_at).getTime() <= Date.now()); const status = !item.is_active ? "Deaktiviert" : exhausted ? "Aufgebraucht" : expired ? "Abgelaufen" : "Aktiv"; return <tr key={item.id}><td><div className="admin-code-value"><code>{item.code ?? "Code nicht verfügbar"}</code>{item.code && <button className="btn admin-code-copy" type="button" onClick={() => { void navigator.clipboard.writeText(item.code!); setMessage("Freischaltcode kopiert."); }} aria-label="Freischaltcode kopieren">Kopieren</button>}</div>{!item.code && <div className="task-caption">Dieser ältere Code kann nicht aus seinem Hash rekonstruiert werden.</div>}{item.internal_note && <div className="task-caption">{item.internal_note}</div>}</td><td>{item.plan_code === "event_pro" ? "Event Pro" : "Event"}</td><td><span className={`status ${status === "Aktiv" ? "status-done" : "status-open"}`}>{status}</span></td><td>{item.use_count}{item.max_uses ? ` / ${item.max_uses}` : " / ∞"}</td><td>{item.event_name ?? item.organization_name ?? "Alle Bereiche"}</td><td>{item.expires_at ? new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(new Date(item.expires_at)) : "Kein Ablaufdatum"}</td><td>{new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(new Date(item.created_at))}</td><td>{item.is_active && !exhausted && !expired && <button className="btn btn-danger-soft" type="button" disabled={deactivating === item.id} onClick={() => void deactivate(item.id)}>{deactivating === item.id ? "Wird deaktiviert …" : "Deaktivieren"}</button>}</td></tr>; })}</tbody></table></div>}
    </section>
  </div>;
}
