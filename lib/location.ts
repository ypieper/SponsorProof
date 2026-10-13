export function normalizeCityName(city: string) {
  return city.replace(/\s*,\s*Stadt\s*$/i, "").trim();
}
