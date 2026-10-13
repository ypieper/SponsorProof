export const contractPdfStorageKey = "sponsorproof.contract-pdfs.v1";

export type SavedContractPdf = {
  document: string;
  filename: string;
  generatedAt: string;
};

export type SavedContractPdfs = Record<string, SavedContractPdf>;
