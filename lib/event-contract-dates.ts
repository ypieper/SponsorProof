const germanMonths: Record<string, string> = {
  januar: "01", februar: "02", märz: "03", april: "04", mai: "05", juni: "06",
  juli: "07", august: "08", september: "09", oktober: "10", november: "11", dezember: "12",
};

export function contractDateForInput(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const match = /^(\d{1,2})\.\s+([A-Za-zÄÖÜäöüß]+)\s+(\d{4})$/.exec(value.trim());
  if (!match) return "";
  const month = germanMonths[match[2].toLocaleLowerCase("de-DE")];
  return month ? `${match[3]}-${month}-${match[1].padStart(2, "0")}` : "";
}

export function formatContractDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? new Intl.DateTimeFormat("de-DE").format(new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : value;
}
