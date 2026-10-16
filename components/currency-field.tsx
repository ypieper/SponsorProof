"use client";

import { useState } from "react";
import { formatContractValue, parseContractValueInput } from "@/lib/event-contract-values";

export function CurrencyField({ value, onChange, required, placeholder = "0,00", ariaLabel = "Vertragswert in Euro", readOnly = false }: {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  readOnly?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const amount = parseContractValueInput(value);
  const displayValue = focused || !value ? value : Number.isFinite(amount) ? formatContractValue(amount) : value;

  return <input
    type="text"
    inputMode="decimal"
    required={required}
    readOnly={readOnly}
    value={displayValue}
    onFocus={() => { if (!readOnly) setFocused(true); }}
    onBlur={() => setFocused(false)}
    onChange={(event) => onChange(event.target.value.replace(/[^0-9,.]/g, ""))}
    placeholder={placeholder}
    aria-label={ariaLabel}
  />;
}
