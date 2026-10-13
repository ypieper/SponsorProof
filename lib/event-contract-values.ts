export type EventContractValues = Record<string, number>;

export function parseContractValue(value: string) {
  const normalized = value.replace(/\./g, "").replace(/,/g, ".").replace(/[^0-9.-]/g, "");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : 0;
}

export function parseContractValueInput(value: string) {
  const cleaned = value.trim().replace(/[^0-9,.-]/g, "");
  if (!cleaned) return Number.NaN;
  let normalized = cleaned;
  if (cleaned.includes(",")) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (cleaned.includes(".")) {
    const parts = cleaned.split(".");
    const decimalDigits = parts[parts.length - 1]?.length ?? 0;
    normalized = decimalDigits > 0 && decimalDigits <= 2 ? cleaned : cleaned.replace(/\./g, "");
  }
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : Number.NaN;
}

export function formatContractValue(value: number) {
  return `${new Intl.NumberFormat("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value)} €`;
}
