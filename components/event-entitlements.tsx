"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { EVENT_PRO_UPGRADE_SURCHARGE_CENTS } from "@/lib/pricing";
import { eventPlanLabel } from "@/lib/event-plan-labels";
import { Icon } from "@/components/ui";

export type EventPlanCode = "free" | "event" | "event_pro" | "enterprise";
export type EventFeature = "contracts" | "benefits" | "tasks" | "evidence" | "reports";
export type EventPlan = { code: EventPlanCode; name: string; price_cents: number | null; max_events: number | null; max_sponsors: number | null; features: Partial<Record<EventFeature, boolean>> };
export type EventEntitlement = { event_id: string; plan_code: EventPlanCode; entitlement_status: "active" | "revoked"; activated_at: string; activation_source: string; paid_amount_cents: number | null; payment_reference: string | null; payment_provider: string | null; plan: EventPlan };

type Entry = { data: EventEntitlement | null; loading: boolean; error?: string };
type EventEntitlementsContextValue = {
  getEntitlement: (eventId: string) => EventEntitlement | null;
  loadEntitlement: (eventId: string) => Promise<EventEntitlement | null>;
  ensureFeature: (eventId: string, eventTitle: string, feature: EventFeature) => Promise<boolean>;
  requestUpgrade: (eventId: string, eventTitle: string, reason?: string) => void;
};

const EventEntitlementsContext = createContext<EventEntitlementsContextValue | null>(null);
const featureNames: Record<EventFeature, string> = {
  contracts: "Verträge erstellen und verwalten",
  benefits: "Leistungsbausteine zuweisen",
  tasks: "Aufgaben aus Leistungen erzeugen",
  evidence: "Nachweise hochladen",
  reports: "Sponsorberichte erstellen",
};
const planFeatureLabels: Record<EventFeature, string> = {
  contracts: "Verträge erstellen",
  benefits: "Leistungsbausteine zuweisen",
  tasks: "Aufgaben aus Leistungen",
  evidence: "Nachweise hochladen",
  reports: "Sponsorberichte erstellen",
};

export function EventEntitlementsProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const [dialog, setDialog] = useState<{ eventId: string; title: string; reason?: string } | null>(null);
  const [plans, setPlans] = useState<EventPlan[]>([]);
  const [code, setCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [dialogMessage, setDialogMessage] = useState("");
  const [dialogError, setDialogError] = useState("");
  const currentEntitlement = dialog ? entries[dialog.eventId]?.data : null;
  const proPlan = plans.find((plan) => plan.code === "event_pro");
  const proUpgradePrice = currentEntitlement?.plan_code === "event" && proPlan
    ? EVENT_PRO_UPGRADE_SURCHARGE_CENTS
    : null;

  const loadEntitlement = useCallback(async (eventId: string) => {
    setEntries((current) => ({ ...current, [eventId]: { data: current[eventId]?.data ?? null, loading: true } }));
    try {
      const supabase = createClient();
      const [{ data: entitlement, error: entitlementError }, { data: catalog, error: plansError }, { data: event, error: eventError }] = await Promise.all([
        supabase.from("event_entitlements").select("event_id, plan_code, entitlement_status, activated_at, activation_source, paid_amount_cents, payment_reference, payment_provider").eq("event_id", eventId).maybeSingle(),
        supabase.from("event_plans").select("code, name, price_cents, max_events, max_sponsors, features").order("price_cents"),
        supabase.from("events").select("organization_id").eq("id", eventId).maybeSingle(),
      ]);
      if (plansError) throw plansError;
      if (eventError) throw eventError;
      if (catalog) setPlans((catalog as EventPlan[]).map((plan) => ({ ...plan, name: eventPlanLabel(plan.code) })));
      if (entitlementError) throw entitlementError;
      if (event?.organization_id) {
        const { data: organizationEntitlement, error: organizationEntitlementError } = await supabase
          .from("organization_entitlements")
          .select("is_active, activated_at, expires_at, annual_fee_cents, invoice_reference")
          .eq("organization_id", event.organization_id)
          .maybeSingle();
        if (organizationEntitlementError) throw organizationEntitlementError;
        if (organizationEntitlement?.is_active && new Date(organizationEntitlement.expires_at).getTime() > Date.now()) {
          const allFeatures = Object.fromEntries((Object.keys(featureNames) as EventFeature[]).map((feature) => [feature, true])) as Record<EventFeature, boolean>;
          const enterprisePlan: EventPlan = { code: "enterprise", name: "Enterprise", price_cents: null, max_events: null, max_sponsors: null, features: allFeatures };
          const data: EventEntitlement = {
            event_id: eventId, plan_code: "enterprise", entitlement_status: "active",
            activated_at: organizationEntitlement.activated_at, activation_source: "admin",
            paid_amount_cents: organizationEntitlement.annual_fee_cents,
            payment_reference: organizationEntitlement.invoice_reference, payment_provider: "invoice", plan: enterprisePlan,
          };
          setEntries((current) => ({ ...current, [eventId]: { data, loading: false } }));
          return data;
        }
      }
      const plan = (catalog as EventPlan[] | null)?.find((item) => item.code === entitlement?.plan_code);
      const data = entitlement && plan ? { ...entitlement, plan } as EventEntitlement : null;
      setEntries((current) => ({ ...current, [eventId]: { data, loading: false } }));
      return data;
    } catch (error) {
      setEntries((current) => ({ ...current, [eventId]: { data: current[eventId]?.data ?? null, loading: false, error: error instanceof Error ? error.message : "Tarif konnte nicht geladen werden." } }));
      return null;
    }
  }, []);

  const requestUpgrade = useCallback((eventId: string, title: string, reason?: string) => {
    setDialog({ eventId, title, reason });
    setCode("");
    setDialogMessage("");
    setDialogError("");
    void loadEntitlement(eventId);
    const supabase = createClient();
    void supabase.from("event_plans").select("code, name, price_cents, max_events, max_sponsors, features").order("price_cents")
      .then(({ data }) => { if (data) setPlans((data as EventPlan[]).map((plan) => ({ ...plan, name: eventPlanLabel(plan.code) }))); });
  }, [loadEntitlement]);

  const ensureFeature = useCallback(async (eventId: string, title: string, feature: EventFeature) => {
    let entitlement = entries[eventId]?.data;
    if (!entitlement || entries[eventId]?.loading) entitlement = await loadEntitlement(eventId);
    if (entitlement?.entitlement_status === "active" && entitlement.plan.features[feature]) return true;
    requestUpgrade(eventId, title, featureNames[feature]);
    return false;
  }, [entries, loadEntitlement, requestUpgrade]);

  const getEntitlement = useCallback((eventId: string) => entriesRef.current[eventId]?.data ?? null, []);

  useEffect(() => {
    if (!dialog) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !redeeming) setDialog(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dialog, redeeming]);

  async function redeemCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dialog || !code.trim() || redeeming) return;
    setRedeeming(true);
    setDialogError("");
    setDialogMessage("");
    try {
      const response = await fetch(`/api/events/${dialog.eventId}/redeem-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Der Freischaltcode konnte nicht eingelöst werden.");
      await loadEntitlement(dialog.eventId);
      setCode("");
      setDialogMessage(`Event freigeschaltet. Der Tarif ${eventPlanLabel(result.plan)} ist jetzt aktiv.`);
      window.dispatchEvent(new CustomEvent("sponso:event-entitlement-updated", { detail: { eventId: dialog.eventId } }));
    } catch (error) {
      setDialogError(error instanceof Error ? error.message : "Der Freischaltcode konnte nicht eingelöst werden.");
    } finally {
      setRedeeming(false);
    }
  }

  const value = useMemo<EventEntitlementsContextValue>(() => ({
    getEntitlement,
    loadEntitlement,
    ensureFeature,
    requestUpgrade,
  }), [getEntitlement, ensureFeature, loadEntitlement, requestUpgrade]);

  return <EventEntitlementsContext.Provider value={value}>
    {children}
    {dialog && <div className="modal-backdrop entitlement-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !redeeming) setDialog(null); }}>
      <section className="create-modal entitlement-modal" role="dialog" aria-modal="true" aria-labelledby="entitlement-title">
        <div className="create-modal-head"><div><div className="eyebrow">EVENT FREISCHALTEN</div><h2 id="entitlement-title">sponso für dieses Event freischalten</h2><p>{dialog.title}{dialog.reason ? ` · ${dialog.reason}` : ""}</p></div><button className="icon-button" type="button" aria-label="Dialog schließen" disabled={redeeming} onClick={() => setDialog(null)}><Icon name="close" size={16}/></button></div>
        <div className="entitlement-plan-grid">{plans.filter((plan) => plan.code === "event" || plan.code === "event_pro").map((plan) => {
          const isCurrent = currentEntitlement?.plan_code === plan.code;
          const isProUpgrade = plan.code === "event_pro" && proUpgradePrice !== null;
          const isInitialEventChoice = plan.code === "event" && currentEntitlement?.plan_code === "free";
          return <article key={plan.code} className={`entitlement-plan-card${isCurrent ? " is-current" : ""}${isProUpgrade ? " is-upgrade" : ""}`}>
            <div><span>{eventPlanLabel(plan.code)}{isCurrent && <em>Aktueller Tarif</em>}</span><strong>{new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(isProUpgrade ? proUpgradePrice! / 100 : (plan.price_cents ?? 0) / 100)}</strong><small>{isProUpgrade ? "Einmaliger Aufpreis für den Wechsel" : isInitialEventChoice ? `Basic-Tarif: später für ${new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(EVENT_PRO_UPGRADE_SURCHARGE_CENTS / 100)} auf Pro erweiterbar` : "einmalig pro Event"}</small></div>
            <ul><li>{plan.max_sponsors === null ? "Unbegrenzt Sponsoren" : `Bis zu ${plan.max_sponsors} Sponsoren`}</li>{(Object.keys(planFeatureLabels) as EventFeature[]).filter((feature) => plan.features[feature]).map((feature) => <li key={feature}>{planFeatureLabels[feature]}</li>)}</ul>
            {isProUpgrade && <Link className="btn btn-primary entitlement-upgrade-button" href={`/kontakt?anliegen=event-pro&event=${encodeURIComponent(dialog.eventId)}&eventName=${encodeURIComponent(dialog.title)}`} onClick={() => setDialog(null)}>Für {new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(proUpgradePrice! / 100)} wechseln</Link>}
          </article>;
        })}</div>
        <aside className="entitlement-enterprise-plan"><div><strong>Enterprise-Edition</strong><span>Für Veranstalter mit mehreren Events</span></div><p>Unbegrenzte Events und Sponsoren, alle Funktionen. Jährliche Abrechnung per Rechnung; die Freischaltung erfolgt manuell durch den sponso Admin.</p><Link className="btn btn-primary" href="/kontakt?anliegen=enterprise">Enterprise anfragen</Link></aside>
        {dialogError && <p className="field-message error" role="alert">{dialogError}</p>}{dialogMessage && <p className="field-message success" role="status">{dialogMessage}</p>}
        <form className="entitlement-code-form" onSubmit={redeemCode}><label className="settings-field"><span>Du hast einen Freischaltcode?</span><input autoComplete="off" autoCapitalize="characters" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder={`S-${new Date().getFullYear()}-00000000 (Beispiel, nicht einlösbar)`} maxLength={80} /></label><button className="btn btn-primary" type="submit" disabled={redeeming || !code.trim()}>{redeeming ? "Wird eingelöst …" : "Einlösen"}</button></form>
        <p className="entitlement-payment-note">Die Freischaltung erfolgt mit einem gültigen Code. Eine Online-Zahlung ist noch nicht eingerichtet.{proUpgradePrice !== null ? " Den Wechsel zu Pro kannst du zum angezeigten Aufpreis per Rechnung anfragen." : ""}</p>
      </section>
    </div>}
  </EventEntitlementsContext.Provider>;
}

export function useEventEntitlements() {
  const context = useContext(EventEntitlementsContext);
  if (!context) throw new Error("EventEntitlementsProvider fehlt.");
  return context;
}
