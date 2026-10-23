"use client";

import { jsPDF } from "jspdf";
import autoTableImport from "jspdf-autotable";

// the package is CommonJS: depending on how it is bundled the function is the import itself or its "default"
const autoTable: typeof autoTableImport = (autoTableImport as unknown as { default?: typeof autoTableImport }).default ?? autoTableImport;
import { display, formatQty } from "./units";
import type { PurchasePlan } from "./purchase";
import type { CalcResult, KState } from "./types";

const money = (n: number) => `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
// the standard PDF fonts have no emoji or exotic dashes: keep the text to characters they can draw
const plain = (s: string) => s.replace(/[–—]/g, "-").replace(/[^\x20-\x7E -ÿ]/g, "");
const GREEN: [number, number, number] = [30, 64, 100];

/**
 * The result as a PDF (A4): the menu with the recipe each dish uses, the ingredient list with quantities, and what to buy from which
 * supplier (item, quantity, unit price, amount). A clean page that can also be printed.
 */
export function buildKitchenPdf(state: KState, calc: CalcResult, purchase: PurchasePlan | null): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  let y = 16;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Kitchen ingredient and purchase list", 14, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const eventName = state.event?.name ?? state.photoEventName ?? "";
  const lines = [
    `Company: ${state.companyName}`,
    eventName ? `Event: ${eventName}${state.event?.date ? ` (${state.event.date})` : ""}` : "",
    `Menu source: ${state.documentIds.length > 0 ? "uploaded menu photo" : state.event ? "event order" : "entered by hand"}`,
    `Prepared: ${new Date().toLocaleString("en-GB", { timeZone: "Asia/Kuala_Lumpur" })} (Malaysia time)`,
  ].filter(Boolean);
  for (const l of lines) {
    doc.text(plain(l), 14, y);
    y += 5;
  }
  y += 2;

  // 1. the menu and the recipe each dish uses
  const menuRows: string[][] = [];
  for (const s of calc.sessions) {
    for (const d of s.dishes) {
      const source = d.source === "recipe" ? `Recipe: ${d.recipeName}` : d.source === "estimate" ? (d.estimateStatus === "reviewed" ? "AI estimate (reviewed)" : "AI ESTIMATE - NOT YET VERIFIED") : d.problem === "pax" ? "Pax not entered" : "Recipe data required";
      menuRows.push([s.name, s.pax ? String(s.pax) : "-", d.itemName, source]);
    }
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("1. Menu and recipes", 14, y);
  autoTable(doc, {
    startY: y + 2,
    head: [["Session", "Pax", "Dish", "Recipe used"]],
    body: menuRows.map((r) => r.map(plain)),
    styles: { fontSize: 9, cellPadding: 1.6 },
    headStyles: { fillColor: GREEN },
    margin: { left: 14, right: 14 },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  // 2. the ingredients
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("2. Ingredients needed", 14, y);
  autoTable(doc, {
    startY: y + 2,
    head: [["Ingredient", "Quantity", "Unit", "Source"]],
    body: calc.combined.map((r) => {
      const d = display({ qty: r.qty, family: r.family, key: r.key }, state.unitMode);
      return [plain(r.name), formatQty(d.qty), d.unit, r.estimateQty > 0 ? "includes AI estimate" : "recipe"];
    }),
    styles: { fontSize: 9, cellPadding: 1.6 },
    headStyles: { fillColor: GREEN },
    columnStyles: { 1: { halign: "right" } },
    margin: { left: 14, right: 14 },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  // 3. what to buy from which supplier
  if (purchase) {
    if (y > 250) {
      doc.addPage();
      y = 16;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("3. To purchase, by supplier", 14, y);
    y += 2;
    for (const g of purchase.groups) {
      autoTable(doc, {
        startY: y + 3,
        head: [[{ content: plain(g.supplier), colSpan: 6, styles: { fillColor: GREEN } }], ["Ingredient", "Item to buy", "Qty", "Unit", "Unit price", "Amount"]],
        body: g.lines.map((l) => [plain(l.ingredient), plain(l.item), l.qty !== null ? formatQty(l.qty) : "(enter qty)", plain(l.uom || "unit"), money(l.price), l.amount !== null ? money(l.amount) : "-"]),
        foot: [[{ content: "Supplier total", colSpan: 5, styles: { halign: "right" } }, money(g.total)]],
        styles: { fontSize: 8.5, cellPadding: 1.5 },
        headStyles: { fillColor: [235, 238, 243], textColor: 30 },
        footStyles: { fillColor: [245, 247, 250], textColor: 20 },
        columnStyles: { 2: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" } },
        margin: { left: 14, right: 14 },
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.text(`Grand total: ${money(purchase.total)}`, pageW - 14, y + 3, { align: "right" });
    y += 10;
    if (purchase.unassigned.length > 0) {
      autoTable(doc, {
        startY: y,
        head: [["Not in a purchase list yet", "Needed", "Reason"]],
        body: purchase.unassigned.map((u) => [plain(u.ingredient), plain(u.needed), plain(u.reason)]),
        styles: { fontSize: 8.5, cellPadding: 1.5 },
        headStyles: { fillColor: [180, 120, 20] },
        margin: { left: 14, right: 14 },
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text("Prices are the latest price of each supplier (from the purchase invoices). Check them before ordering.", 14, y);
    y += 5;
  }
  if (calc.usesEstimate) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text(calc.usesPendingEstimate ? "Contains AI ESTIMATES not yet verified: a chef must review them before purchasing or production." : "Contains AI estimates reviewed by a chef.", 14, y);
  }

  // page numbers
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(`Page ${i} of ${pages}`, pageW - 14, doc.internal.pageSize.getHeight() - 8, { align: "right" });
  }
  return doc;
}

const fileName = (state: KState) => `kitchen-list-${(state.event?.name ?? state.photoEventName ?? "menu").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "menu"}.pdf`;

export function downloadKitchenPdf(state: KState, calc: CalcResult, purchase: PurchasePlan | null): void {
  buildKitchenPdf(state, calc, purchase).save(fileName(state));
}

/** Opens the PDF in the window that was opened by the click (so a pop-up blocker does not stop it) and asks to print it. */
export function printKitchenPdf(state: KState, calc: CalcResult, purchase: PurchasePlan | null, target: Window | null): void {
  const doc = buildKitchenPdf(state, calc, purchase);
  doc.autoPrint();
  const url = String(doc.output("bloburl"));
  if (target && !target.closed) target.location.href = url;
  else window.open(url, "_blank");
}
