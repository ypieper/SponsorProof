export type ExtractedInvoiceFields = {
  invoiceNumber?: string;
  invoiceDate?: string;
  dueDate?: string;
  netAmount?: string;
  grossAmount?: string;
  currency?: string;
};

function localName(element: Element) {
  return element.localName || element.tagName.split(":").pop() || element.tagName;
}

function children(element: Element, name: string) {
  return Array.from(element.children).filter((child) => localName(child) === name);
}

function child(element: Element | null, name: string) {
  return element ? children(element, name)[0] ?? null : null;
}

function text(element: Element | null) {
  return element?.textContent?.trim() || "";
}

function firstDescendant(element: Element, name: string) {
  return Array.from(element.getElementsByTagName("*" as const)).find((candidate) => localName(candidate) === name) ?? null;
}

function dateValue(value: string) {
  const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

function amountValue(value: string) {
  const amount = Number(value.replace(/\s/g, ""));
  return Number.isFinite(amount) && amount >= 0 ? amount.toFixed(2) : "";
}

export function parseEInvoiceXml(xml: string): ExtractedInvoiceFields | null {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.getElementsByTagName("parsererror").length) return null;
  const root = document.documentElement;
  if (!root) return null;
  const rootName = localName(root);
  const result: ExtractedInvoiceFields = {};

  if (rootName === "Invoice" || rootName === "CreditNote") {
    const invoiceId = text(child(root, "ID"));
    const issueDate = text(child(root, "IssueDate"));
    const dueDate = text(child(root, "DueDate"));
    const total = child(root, "LegalMonetaryTotal");
    const netElement = child(total, "TaxExclusiveAmount");
    const grossElement = child(total, "TaxInclusiveAmount");
    const currency = text(child(root, "DocumentCurrencyCode")) || netElement?.getAttribute("currencyID") || grossElement?.getAttribute("currencyID") || "";
    const net = currency && currency !== "EUR" ? "" : text(netElement);
    const gross = currency && currency !== "EUR" ? "" : text(grossElement);
    if (invoiceId) result.invoiceNumber = invoiceId;
    if (issueDate) result.invoiceDate = dateValue(issueDate);
    if (dueDate) result.dueDate = dateValue(dueDate);
    if (net) result.netAmount = amountValue(net);
    if (gross) result.grossAmount = amountValue(gross);
    if (currency) result.currency = currency;
  } else if (rootName === "CrossIndustryInvoice") {
    const exchangedDocument = firstDescendant(root, "ExchangedDocument");
    const documentId = text(child(exchangedDocument, "ID"));
    const issueDateTime = child(exchangedDocument, "IssueDateTime");
    const issueDateString = child(issueDateTime, "DateTimeString");
    const settlement = firstDescendant(root, "SpecifiedTradeSettlementHeaderMonetarySummation");
    const netElement = child(settlement, "TaxBasisTotalAmount");
    const grossElement = child(settlement, "GrandTotalAmount");
    const currency = text(firstDescendant(root, "InvoiceCurrencyCode")) || netElement?.getAttribute("currencyID") || grossElement?.getAttribute("currencyID") || "";
    const net = currency && currency !== "EUR" ? "" : text(netElement);
    const gross = currency && currency !== "EUR" ? "" : text(grossElement);
    const paymentTerms = firstDescendant(root, "SpecifiedTradePaymentTerms");
    const dueDateTime = child(paymentTerms, "DueDateDateTime");
    const dueDateString = child(dueDateTime, "DateTimeString");
    if (documentId) result.invoiceNumber = documentId;
    if (issueDateString) result.invoiceDate = dateValue(text(issueDateString));
    if (dueDateString) result.dueDate = dateValue(text(dueDateString));
    if (net) result.netAmount = amountValue(net);
    if (gross) result.grossAmount = amountValue(gross);
    if (currency) result.currency = currency;
  } else {
    return null;
  }

  return Object.values(result).some(Boolean) ? result : null;
}

