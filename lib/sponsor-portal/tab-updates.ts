import type { SponsorPortalTab } from "./types";

export const sponsorTabReadStorageKey = "sponso:sponsor-tab-read:v1";

export function sponsorTabFingerprint(value: unknown) {
  const text = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${text.length}-${(hash >>> 0).toString(36)}`;
}

export function sponsorTabReadKey(eventId: string, sponsorId: string, tab: SponsorPortalTab) {
  return `${eventId}:${sponsorId}:${tab}`;
}
