const packageLabelsByContractLimit: Record<number, string> = {
  5: "Starter",
  7: "Plus",
  10: "Pro",
  15: "Event",
};

export function eventContractPackageLabel(maxContracts: number) {
  return packageLabelsByContractLimit[maxContracts] ?? `${maxContracts} Verträge`;
}
