"use client";

const legacyGeneratedContractsKey = "sponsorproof.contract-pdfs.v1";
const legacyIndexedDbNames = ["sponsorproof-evidence", "sponsorproof-contract-files"];

/** Removes only legacy photos and contract files; other browser data is preserved. */
export function clearLegacyBrowserData() {
  try {
    window.localStorage.removeItem(legacyGeneratedContractsKey);
  } catch {
    // Storage may be unavailable in private browsing; the app should still load.
  }

  if (typeof window.indexedDB === "undefined") return;

  for (const name of legacyIndexedDbNames) {
    try {
      window.indexedDB.deleteDatabase(name);
    } catch {
      // Deletion is retried on the next app load if the browser blocks it.
    }
  }
}
