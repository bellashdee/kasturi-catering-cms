import { emptyHeader, toNumberOrNull, textOrNull, type CanonicalInvoice, type FieldInfo, type HeaderField, type InvoiceLine } from "./schema";

/**
 * XML e-invoices (MyInvois / UBL 2.1 Invoice, also Credit / Debit Notes) are read directly from the XML: no OCR and no AI,
 * so every value is exactly what the supplier's system put in the file. The original XML stays in storage untouched.
 */

export type XmlNode = { name: string; attrs: Record<string, string>; children: XmlNode[]; text: string };

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) =>
    e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENTITIES[e.toLowerCase()] ?? _,
  );
const localName = (n: string) => n.slice(n.indexOf(":") + 1);

export class XmlParseError extends Error {}

/** A small, strict XML reader (no DTDs or external entities are ever fetched or expanded). */
export function parseXml(source: string): XmlNode {
  const xml = source.replace(/^﻿/, "");
  const root: XmlNode = { name: "#root", attrs: {}, children: [], text: "" };
  const stack: XmlNode[] = [root];
  let i = 0;
  while (i < xml.length) {
    const lt = xml.indexOf("<", i);
    const textPart = lt < 0 ? xml.slice(i) : xml.slice(i, lt);
    if (textPart.trim()) stack[stack.length - 1].text += decode(textPart);
    if (lt < 0) break;
    if (xml.startsWith("<!--", lt)) {
      const end = xml.indexOf("-->", lt);
      if (end < 0) throw new XmlParseError("Unclosed comment");
      i = end + 3;
    } else if (xml.startsWith("<![CDATA[", lt)) {
      const end = xml.indexOf("]]>", lt);
      if (end < 0) throw new XmlParseError("Unclosed CDATA");
      stack[stack.length - 1].text += xml.slice(lt + 9, end);
      i = end + 3;
    } else if (xml.startsWith("<?", lt)) {
      const end = xml.indexOf("?>", lt);
      if (end < 0) throw new XmlParseError("Unclosed declaration");
      i = end + 2;
    } else if (xml.startsWith("<!", lt)) {
      // DOCTYPE: skipped (never expanded)
      const end = xml.indexOf(">", lt);
      if (end < 0) throw new XmlParseError("Unclosed DOCTYPE");
      i = end + 1;
    } else if (xml[lt + 1] === "/") {
      const end = xml.indexOf(">", lt);
      if (end < 0) throw new XmlParseError("Unclosed end tag");
      const name = localName(xml.slice(lt + 2, end).trim());
      const open = stack.pop();
      if (!open || open.name !== name) throw new XmlParseError(`Mismatched tag </${name}>`);
      i = end + 1;
    } else {
      let end = lt + 1;
      let quote: string | null = null;
      for (; end < xml.length; end++) {
        const c = xml[end];
        if (quote) {
          if (c === quote) quote = null;
        } else if (c === '"' || c === "'") quote = c;
        else if (c === ">") break;
      }
      if (end >= xml.length) throw new XmlParseError("Unclosed start tag");
      let body = xml.slice(lt + 1, end);
      const selfClosing = body.endsWith("/");
      if (selfClosing) body = body.slice(0, -1);
      const nameMatch = body.match(/^\s*([^\s/>]+)/);
      if (!nameMatch) throw new XmlParseError("Empty tag");
      const node: XmlNode = { name: localName(nameMatch[1]), attrs: {}, children: [], text: "" };
      for (const m of body.slice(nameMatch[0].length).matchAll(/([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
        node.attrs[localName(m[1])] = decode(m[3] ?? m[4] ?? "");
      }
      stack[stack.length - 1].children.push(node);
      if (!selfClosing) stack.push(node);
      i = end + 1;
    }
  }
  if (stack.length !== 1) throw new XmlParseError(`Unclosed element <${stack[stack.length - 1].name}>`);
  if (root.children.length !== 1) throw new XmlParseError("The XML must have exactly one root element");
  return root.children[0];
}

const child = (n: XmlNode | undefined, ...path: string[]): XmlNode | undefined => {
  let cur = n;
  for (const p of path) cur = cur?.children.find((c) => c.name === p);
  return cur;
};
const children = (n: XmlNode | undefined, name: string) => n?.children.filter((c) => c.name === name) ?? [];
const txt = (n: XmlNode | undefined) => textOrNull(n?.text);

export function isUblInvoice(root: XmlNode): boolean {
  return ["Invoice", "CreditNote", "DebitNote", "SelfBilledInvoice"].includes(root.name) && !!child(root, "ID");
}

/** Maps a UBL 2.1 (MyInvois) invoice to the common invoice shape. Every value carries the XML element it came from. */
export function readUblInvoice(root: XmlNode): CanonicalInvoice {
  const header = emptyHeader();
  const fields: CanonicalInvoice["fields"] = {};
  const issues: string[] = [];
  const set = (field: HeaderField, node: XmlNode | undefined, path: string, numeric = false) => {
    const raw = txt(node);
    if (raw === null) {
      fields[field] = { confidence: null, status: "absent", printed: null, source: null, notes: [] };
      return;
    }
    const value = numeric ? toNumberOrNull(raw) : raw;
    if (numeric && value === null) {
      fields[field] = { confidence: "low", status: "unreadable", printed: raw, source: path, notes: [`"${raw}" is not a number.`] };
      return;
    }
    header[field] = value;
    const info: FieldInfo = { confidence: "high", status: "found", printed: raw, source: path, notes: [] };
    if (node?.attrs.currencyID) info.notes.push(`Currency ${node.attrs.currencyID}`);
    fields[field] = info;
  };

  const supplierParty = child(root, "AccountingSupplierParty", "Party");
  const customerParty = child(root, "AccountingCustomerParty", "Party");
  const partyName = (p: XmlNode | undefined) => child(p, "PartyLegalEntity", "RegistrationName") ?? child(p, "PartyName", "Name");
  const partyId = (p: XmlNode | undefined, schemes: string[]) =>
    children(p, "PartyIdentification")
      .map((pi) => child(pi, "ID"))
      .find((id) => id && schemes.includes((id.attrs.schemeID ?? "").toUpperCase()));

  set("supplier_name", partyName(supplierParty), "AccountingSupplierParty/Party/RegistrationName");
  set("supplier_registration_no", partyId(supplierParty, ["BRN", "NRIC", "PASSPORT", "ARMY"]) ?? child(supplierParty, "PartyLegalEntity", "CompanyID"), "AccountingSupplierParty/Party/PartyIdentification[BRN]");
  set("supplier_tax_no", partyId(supplierParty, ["TIN", "SST"]) ?? child(supplierParty, "PartyTaxScheme", "CompanyID"), "AccountingSupplierParty/Party/PartyIdentification[TIN]");
  set("bill_to_name", partyName(customerParty), "AccountingCustomerParty/Party/RegistrationName");
  set("invoice_number", child(root, "ID"), "ID");
  set("invoice_date", child(root, "IssueDate"), "IssueDate");
  set("due_date", child(root, "DueDate") ?? child(root, "PaymentMeans", "PaymentDueDate"), "DueDate");
  set("po_number", child(root, "OrderReference", "ID"), "OrderReference/ID");
  set("do_number", child(root, "DespatchDocumentReference", "ID"), "DespatchDocumentReference/ID");
  set("description", child(root, "Note"), "Note");
  set("currency", child(root, "DocumentCurrencyCode"), "DocumentCurrencyCode");
  set("payment_terms", child(root, "PaymentTerms", "Note"), "PaymentTerms/Note");

  const totals = child(root, "LegalMonetaryTotal");
  set("subtotal", child(totals, "TaxExclusiveAmount") ?? child(totals, "LineExtensionAmount"), "LegalMonetaryTotal/TaxExclusiveAmount", true);
  set("discount_total", child(totals, "AllowanceTotalAmount"), "LegalMonetaryTotal/AllowanceTotalAmount", true);
  set("other_charges", child(totals, "ChargeTotalAmount"), "LegalMonetaryTotal/ChargeTotalAmount", true);
  set("rounding", child(totals, "PayableRoundingAmount"), "LegalMonetaryTotal/PayableRoundingAmount", true);
  // UBL: TaxInclusiveAmount is the invoice total; PayableAmount is what is still to pay (after prepaid amounts and rounding)
  const hasPrepaid = !!child(totals, "PrepaidAmount");
  const hasRounding = !!child(totals, "PayableRoundingAmount");
  if (child(totals, "TaxInclusiveAmount") && !hasRounding) set("total_amount", child(totals, "TaxInclusiveAmount"), "LegalMonetaryTotal/TaxInclusiveAmount", true);
  else if (!hasPrepaid) set("total_amount", child(totals, "PayableAmount"), "LegalMonetaryTotal/PayableAmount", true);
  else set("total_amount", child(totals, "TaxInclusiveAmount"), "LegalMonetaryTotal/TaxInclusiveAmount", true);
  set("amount_paid", child(totals, "PrepaidAmount"), "LegalMonetaryTotal/PrepaidAmount", true);
  if (hasPrepaid) set("outstanding_amount", child(totals, "PayableAmount"), "LegalMonetaryTotal/PayableAmount", true);
  // the document-level tax total (one TaxTotal per currency; the document currency one is used)
  const taxTotals = children(root, "TaxTotal");
  set("tax_amount", child(taxTotals[0], "TaxAmount"), "TaxTotal/TaxAmount", true);
  if (taxTotals.length > 1) issues.push(`The XML has ${taxTotals.length} tax totals; only the first is shown. Check the others in the original XML.`);
  fields.delivery_charge = { confidence: null, status: "absent", printed: null, source: null, notes: [] };
  fields.event_reference = { confidence: null, status: "absent", printed: null, source: null, notes: [] };
  if (!fields.outstanding_amount) fields.outstanding_amount = { confidence: null, status: "absent", printed: null, source: null, notes: [] };

  // delivery is usually a document-level charge named in AllowanceChargeReason
  for (const ac of children(root, "AllowanceCharge")) {
    const isCharge = txt(child(ac, "ChargeIndicator")) === "true";
    const reason = txt(child(ac, "AllowanceChargeReason")) ?? "";
    if (isCharge && /deliver|transport|shipping|freight|penghantaran/i.test(reason)) {
      header.delivery_charge = toNumberOrNull(txt(child(ac, "Amount")));
      fields.delivery_charge = { confidence: "high", status: "found", printed: txt(child(ac, "Amount")), source: `AllowanceCharge (${reason})`, notes: [] };
    }
  }

  const lineNodes = [...children(root, "InvoiceLine"), ...children(root, "CreditNoteLine"), ...children(root, "DebitNoteLine")];
  const lines: InvoiceLine[] = lineNodes.map((ln, idx) => {
    const qtyNode = child(ln, "InvoicedQuantity") ?? child(ln, "CreditedQuantity") ?? child(ln, "DebitedQuantity");
    const lineDiscounts = children(ln, "AllowanceCharge").filter((ac) => txt(child(ac, "ChargeIndicator")) === "false");
    const discount = lineDiscounts.length ? lineDiscounts.reduce((s, ac) => s + (toNumberOrNull(txt(child(ac, "Amount"))) ?? 0), 0) : null;
    const item = child(ln, "Item");
    return {
      item_code: txt(child(item, "SellersItemIdentification", "ID")) ?? txt(child(item, "CommodityClassification", "ItemClassificationCode")),
      description: txt(child(item, "Description")) ?? txt(child(item, "Name")),
      category: null,
      quantity: toNumberOrNull(txt(qtyNode)),
      unit: qtyNode?.attrs.unitCode ?? null,
      unit_price: toNumberOrNull(txt(child(ln, "Price", "PriceAmount"))),
      discount,
      tax_amount: toNumberOrNull(txt(child(ln, "TaxTotal", "TaxAmount"))),
      line_total: toNumberOrNull(txt(child(ln, "LineExtensionAmount"))),
      source: `InvoiceLine[${idx + 1}]`,
      confidence: "high",
    };
  });
  if (lines.length === 0) issues.push("The XML has no invoice lines.");

  return { header, lines, fields, chatText: null, isChatScreenshot: false, issues };
}
