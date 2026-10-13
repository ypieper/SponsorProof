import bankDirectory from "@/lib/data/de-banks.json";

type GermanBank = { name: string; bic: string };
const germanBanks = bankDirectory as Record<string, GermanBank>;

export function lookupGermanBank(bankCode: string): GermanBank | undefined {
  return germanBanks[bankCode];
}

const ibanLengths: Record<string, number> = {
  AD: 24, AE: 23, AL: 28, AT: 20, AZ: 28, BA: 20, BE: 16, BG: 22, BH: 22,
  BR: 29, BY: 28, CH: 21, CR: 22, CY: 28, CZ: 24, DE: 22, DK: 18, DO: 28,
  EE: 20, EG: 29, ES: 24, FI: 18, FO: 18, FR: 27, GB: 22, GE: 22, GI: 23,
  GL: 18, GR: 27, HR: 21, HU: 28, IE: 22, IL: 23, IQ: 23, IS: 26, IT: 27,
  JO: 30, KW: 30, KZ: 20, LB: 28, LC: 32, LI: 21, LT: 20, LU: 20, LV: 21,
  MC: 27, MD: 24, ME: 22, MK: 19, MR: 27, MT: 31, MU: 30, NL: 18, NO: 15,
  PK: 24, PL: 28, PS: 29, PT: 25, QA: 29, RO: 24, RS: 22, SA: 24, SC: 31,
  SE: 24, SI: 19, SK: 24, SM: 27, ST: 25, SV: 28, TN: 24, TR: 26, UA: 29,
  VA: 22, VG: 24, XK: 20,
};

export type IbanValidation = "empty" | "incomplete" | "invalid" | "valid" | "unsupported";

export function validateIban(value: string): IbanValidation {
  const iban = value.replace(/\s/g, "").toUpperCase();
  if (!iban) return "empty";
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban)) return "invalid";

  const expectedLength = ibanLengths[iban.slice(0, 2)];
  if (!expectedLength) return "unsupported";
  if (iban.length < expectedLength) return "incomplete";
  if (iban.length !== expectedLength) return "invalid";

  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const character of rearranged) {
    const value = character >= "A" ? String(character.charCodeAt(0) - 55) : character;
    for (const digit of value) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1 ? "valid" : "invalid";
}

export function normalizeIban(value: string): string {
  return value.replace(/\s/g, "").toUpperCase();
}

export function formatIban(value: string): string {
  return normalizeIban(value).replace(/(.{4})/g, "$1 ").trim();
}
