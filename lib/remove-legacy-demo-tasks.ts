const demoEventId = "open-air-kino-2027";
const demoSponsorIds = new Set(["sparkasse", "veltins", "stadtwerke-mitte", "autohaus-koenig", "baeckerei-huber"]);
const demoSponsorNames = new Set(["sparkasse", "veltins", "stadtwerke mitte", "autohaus könig", "bäckerei huber"]);
function readArray(key: string): Record<string, unknown>[] | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null) : null;
  } catch {
    return null;
  }
}

function isLegacyDemoRecord(record: Record<string, unknown>) {
  const sponsorId = typeof record.sponsorId === "string" ? record.sponsorId : "";
  const sponsor = typeof record.sponsor === "string" ? record.sponsor.trim().toLocaleLowerCase("de-DE") : "";
  return record.eventId === demoEventId || demoSponsorIds.has(sponsorId) || demoSponsorNames.has(sponsor);
}

function deleteEvidence(taskId: string) {
  const request = indexedDB.open("sponsorproof-evidence", 1);
  request.onsuccess = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains("proofs")) {
      database.close();
      return;
    }
    const transaction = database.transaction("proofs", "readwrite");
    transaction.objectStore("proofs").delete(taskId);
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => database.close();
  };
}

export function removeLegacyDemoTasks() {
  const manualKey = "sponsorproof.manual-tasks.v1";
  const benefitsKey = "sponsorproof.additional-benefits.v1";
  const overridesKey = "sponsorproof.task-status-overrides.v1";
  const removedIds: string[] = [];

  const manualTasks = readArray(manualKey);
  if (manualTasks) {
    const remainingManual = manualTasks.filter((task) => {
      const isDemo = isLegacyDemoRecord(task);
      if (isDemo && typeof task.id === "string") removedIds.push(task.id);
      return !isDemo;
    });
    localStorage.setItem(manualKey, JSON.stringify(remainingManual));
  }

  const benefits = readArray(benefitsKey);
  if (benefits) {
    const remainingBenefits = benefits.filter((benefit) => {
      const isDemo = isLegacyDemoRecord(benefit);
      if (isDemo && typeof benefit.id === "string") removedIds.push(`benefit-${benefit.id}`);
      return !isDemo;
    });
    localStorage.setItem(benefitsKey, JSON.stringify(remainingBenefits));
  }

  if (removedIds.length) {
    try {
      const overrides = JSON.parse(localStorage.getItem(overridesKey) ?? "{}") as Record<string, unknown>;
      removedIds.forEach((id) => {
        delete overrides[id];
        delete overrides[id.replace(/^benefit-/, "")];
        deleteEvidence(id);
      });
      localStorage.setItem(overridesKey, JSON.stringify(overrides));
    } catch {
      // Invalid legacy status data is not needed after the matching records are removed.
      localStorage.removeItem(overridesKey);
    }
  }
}
