const packageLabelsByCode: Record<string, string> = {
  contracts_5: "Starter",
  contracts_7: "Plus",
  contracts_10: "Pro",
  contracts_15: "Event",
};

const legacyPackageLabelsByContractLimit: Record<number, string> = {
  5: "Starter",
  7: "Plus",
  10: "Pro",
  15: "Event",
};

export function eventContractPackageLabel(maxContracts: number, packageCode?: string) {
  return (packageCode ? packageLabelsByCode[packageCode] : undefined)
    ?? legacyPackageLabelsByContractLimit[maxContracts]
    ?? `${maxContracts} Verträge`;
}
