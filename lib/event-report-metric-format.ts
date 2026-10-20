/** Formats numeric event metric values with German thousands separators. */
export function formatEventReportMetricValue(value: string): string {
  const match = value.trim().match(/^([+-]?\d[\d.,]*(?:\s+\d[\d.,]*)?)(.*)$/u);
  if (!match) return value;

  const numericPart = match[1].replace(/\s/g, "");
  const suffix = match[2];
  let normalized = numericPart;
  const dotCount = (numericPart.match(/\./g) ?? []).length;
  const commaCount = (numericPart.match(/,/g) ?? []).length;

  if (dotCount && commaCount) {
    normalized = numericPart.replace(/\./g, "").replace(",", ".");
  } else if (commaCount > 0) {
    const parts = numericPart.split(",");
    const grouped = parts.length > 1 && parts.slice(1).every((part) => part.length === 3);
    normalized = grouped ? parts.join("") : numericPart.replace(",", ".");
  } else if (dotCount > 0) {
    const parts = numericPart.split(".");
    const grouped = parts.length > 1 && parts[0].length <= 3 && parts.slice(1).every((part) => part.length === 3);
    normalized = grouped ? parts.join("") : numericPart;
  }

  const numericValue = Number(normalized);
  if (!Number.isFinite(numericValue)) return value;
  return `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 10 }).format(numericValue)}${suffix}`;
}
