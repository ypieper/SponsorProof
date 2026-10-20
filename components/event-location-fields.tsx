"use client";

import { useEffect, useRef, useState } from "react";

type LocationParts = { street: string; postalCode: string; city: string };
type Locality = { name?: string; postalcode?: string };

export function EventLocationFields({ value, onChange, required = false }: { value: LocationParts; onChange: (value: Partial<LocationParts>) => void; required?: boolean }) {
  const [localities, setLocalities] = useState<string[]>([]);
  const [lookupMessage, setLookupMessage] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const postalCode = value.postalCode.trim();
    if (!/^\d{5}$/.test(postalCode)) {
      setLocalities([]);
      setLookupMessage("");
      setLookingUp(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLookingUp(true);
      setLookupMessage("");
      void fetch(`https://openplzapi.org/de/Localities?postalCode=${encodeURIComponent(postalCode)}`, {
        headers: { accept: "application/json" },
        signal: controller.signal,
      }).then(async (response) => {
        if (!response.ok) throw new Error("PLZ lookup failed");
        const rows = await response.json() as Locality[];
        const names = [...new Set(rows.map((row) => row.name?.trim()).filter((name): name is string => Boolean(name)))];
        setLocalities(names);
        if (names.length === 1) {
          onChangeRef.current({ city: names[0] });
          setLookupMessage("Ort automatisch ergänzt");
        } else if (names.length > 1) {
          setLookupMessage("Für diese PLZ gibt es mehrere Orte. Bitte wähle den passenden aus.");
        } else {
          setLookupMessage("Kein Ort zu dieser PLZ gefunden. Du kannst den Ort manuell eintragen.");
        }
      }).catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLocalities([]);
        setLookupMessage("Der Ort konnte nicht automatisch ermittelt werden. Du kannst ihn manuell eintragen.");
      }).finally(() => {
        if (!controller.signal.aborted) setLookingUp(false);
      });
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  // Re-run only when the postal code changes. The callback ref prevents unrelated
  // field edits from restarting the lookup.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.postalCode]);

  function update(part: keyof LocationParts, nextValue: string) {
    onChange({ [part]: nextValue, ...(part === "postalCode" ? { city: "" } : {}) });
    if (part === "postalCode") {
      setLocalities([]);
      setLookupMessage("");
      setLookingUp(false);
    }
  }

  const cityOptionsAvailable = localities.length > 1;
  const cityIsConfirmed = localities.length === 1 && localities[0] === value.city;

  return <div className="event-location-fields settings-field-full">
    <label className="settings-field"><span>Straße *</span><input autoComplete="street-address" required={required} maxLength={160} value={value.street} onChange={(event) => update("street", event.target.value)} placeholder="Straße und Hausnummer" /></label>
    <label className="settings-field"><span>PLZ *</span><input autoComplete="postal-code" required={required} inputMode="numeric" pattern="[0-9]{5}" maxLength={5} value={value.postalCode} onChange={(event) => update("postalCode", event.target.value.replace(/\D/g, "").slice(0, 5))} placeholder="z. B. 46535" /></label>
    <label className="settings-field"><span>Ort *</span>{cityOptionsAvailable ? <select required={required} value={value.city} onChange={(event) => update("city", event.target.value)}><option value="">Ort auswählen</option>{localities.map((city) => <option key={city} value={city}>{city}</option>)}</select> : <input autoComplete="address-level2" required={required} readOnly={cityIsConfirmed || lookingUp} value={value.city} onChange={(event) => update("city", event.target.value)} placeholder={value.postalCode.length === 5 && lookingUp ? "Wird ermittelt …" : "Wird aus der PLZ ermittelt"} />}</label>
    {lookupMessage && <small className={`event-location-lookup-message${localities.length === 1 ? " is-success" : ""}`} role="status">{lookupMessage}</small>}
  </div>;
}
