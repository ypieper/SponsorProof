import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt } from "node:crypto";

function activationCodeEncryptionKey() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) throw new Error("Die serverseitige Verschlüsselung der Freischaltcodes ist nicht konfiguriert.");
  return createHash("sha256").update(`sponso:activation-codes:v1:${serviceRoleKey}`, "utf8").digest();
}

export function encryptActivationCode(code: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", activationCodeEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(code, "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptActivationCode(payload: string) {
  const [version, encodedIv, encodedTag, encodedCiphertext] = payload.split(".");
  if (version !== "v1" || !encodedIv || !encodedTag || !encodedCiphertext) throw new Error("Ungültiger verschlüsselter Freischaltcode.");
  const decipher = createDecipheriv("aes-256-gcm", activationCodeEncryptionKey(), Buffer.from(encodedIv, "base64url"));
  decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encodedCiphertext, "base64url")), decipher.final()]).toString("utf8");
}

export function createActivationCode() {
  const year = new Date().getUTCFullYear();
  // 00000000 is reserved for the non-redeemable example shown in the paywall.
  const number = randomInt(1, 100_000_000).toString().padStart(8, "0");
  return `S-${year}-${number}`;
}

export function normalizeActivationCode(code: string) {
  return code.toLocaleUpperCase("en-US").replace(/[^A-Z0-9]/g, "");
}

export function hashActivationCode(code: string) {
  return createHash("sha256").update(normalizeActivationCode(code), "utf8").digest("hex");
}

export function activationCodeHint(code: string) {
  const numericCode = code.match(/^(S-\d{4})-\d{8}$/);
  if (numericCode) return `${numericCode[1]}-••••••••`;

  const parts = code.split("-");
  return `${parts.slice(0, 2).join("-")}-••••-${parts.at(-1)}`;
}
