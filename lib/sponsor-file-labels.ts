const readableTypes: Record<string, string> = {
  pdf: "PDF",
  doc: "Word-Datei",
  docx: "Word-Datei",
  xls: "Excel-Datei",
  xlsx: "Excel-Datei",
  ppt: "PowerPoint-Datei",
  pptx: "PowerPoint-Datei",
  jpg: "Bild-Datei",
  jpeg: "Bild-Datei",
  png: "Bild-Datei",
  webp: "Bild-Datei",
};

export function getSponsorFileTypeLabel(fileName: string) {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  return readableTypes[extension] ?? "Datei";
}

export function formatSponsorFileSize(sizeBytes: number) {
  const megabytes = sizeBytes / (1024 * 1024);
  return `${new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(megabytes)} MB`;
}
