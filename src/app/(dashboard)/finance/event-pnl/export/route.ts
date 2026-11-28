import * as XLSX from "xlsx";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { countedRows, eventPnlCompanyIds, eventPnlCompanies, eventPnlReviewItems, getEventPnlDetail, listEventPnl } from "@/lib/finance/eventPnlQueries";
import {
  ADDITIONAL_COST_TYPE_LABEL,
  ANY_DIRECT_COST_TYPE_LABEL,
  COST_BASIS_LABEL,
  directLinesOf,
  DATA_FLAG_LABEL,
  formatMargin,
  REVENUE_TYPE_LABEL,
  totalEventPnl,
  VERDICT_LABEL,
} from "@/lib/finance/eventPnl";
import { MONTH_LABEL } from "@/lib/finance/constants";
import { EVENT_STATUS_LABEL } from "@/lib/catering/constants";
import { malaysiaMonthNow } from "@/lib/driverAttendance/date";
import { AUTOCOUNT_SOURCE_LABEL } from "@/lib/finance/autocountCosts";

export const runtime = "nodejs";

type Cell = string | number | null;

function respond(rows: Cell[][], format: string, filename: string, sheetName: string, extraSheets: { name: string; rows: Cell[][] }[] = []) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), sheetName.slice(0, 31));
  for (const s of extraSheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s.rows), s.name.slice(0, 31));
  if (format === "xlsx") {
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    return new NextResponse(new Uint8Array(buf), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${filename}.xlsx"` } });
  }
  // a BOM so Excel opens the CSV as UTF-8
  const csv = "﻿" + XLSX.utils.sheet_to_csv(wb.Sheets[sheetName.slice(0, 31)]);
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}.csv"` } });
}

const generated = () => new Date().toLocaleString("en-GB", { timeZone: "Asia/Kuala_Lumpur", dateStyle: "medium", timeStyle: "short" });
const two = (n: number) => Math.round(n * 100) / 100;

export async function GET(request: Request) {
  const session = await getSessionContext();
  if (!session) return new NextResponse("Not signed in.", { status: 401 });
  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
  const supabase = await createClient();

  // ---- one event: detailed P&L with its transactions
  const eventId = url.searchParams.get("event");
  if (eventId) {
    const detail = await getEventPnlDetail(supabase, eventId);
    if (!detail) return new NextResponse("Event not found.", { status: 404 });
    if ((await eventPnlCompanyIds(supabase, [detail.event.company_id])).length === 0) return new NextResponse("Not allowed.", { status: 403 });
    const { event, pnl } = detail;
    const rows: Cell[][] = [
      ["Event P&L"],
      ["Company", event.companies?.name ?? ""],
      ["Event", event.event_name],
      ["AutoCount invoice no.", [...new Set(detail.invoices.map((i) => i.invoice_number))].join(", ") || "no invoice yet"],
      ["Event reference", event.event_reference ?? ""],
      ["Event date", event.event_date],
      ["Customer", event.customers?.name ?? ""],
      ["Status", EVENT_STATUS_LABEL[event.status] ?? event.status],
      ["Report generated", generated()],
      ["Basis", "Actual figures only; estimated costs and budgets are not included"],
      [],
      ["PROFIT & LOSS", "RM"],
      ["Gross event revenue", pnl.grossRevenue],
      ["Less discounts, refunds, credit notes", pnl.deductions],
      ["Net event revenue", pnl.netRevenue],
      ...directLinesOf(pnl).map(([label, amount]): Cell[] => [`Direct cost - ${label}`, amount]),
      ["Total direct costs", pnl.directCosts],
      ["Gross profit", pnl.grossProfit],
      ["Additional event-specific expenses", pnl.additionalExpenses],
      ["Net event profit", pnl.netProfit],
      ["Profit margin", formatMargin(pnl.margin)],
      ["Result", VERDICT_LABEL[pnl.verdict]],
      ["Estimated costs (not counted)", pnl.estimatedCosts],
      [],
      ["REVENUE ENTRIES"],
      ["Date", "Type", "Description", "Amount (RM)", "Remarks"],
      ...detail.revenue.map((r): Cell[] => [r.entry_date, REVENUE_TYPE_LABEL[r.entry_type], r.description, Number(r.amount), r.notes]),
      [],
      ["COST ENTRIES"],
      ["Date", "Kind", "Category", "Basis", "Supplier", "Invoice / receipt", "Description", "Total (RM)", "Remarks"],
      ...[...detail.costs]
        .sort((a, b) => (ANY_DIRECT_COST_TYPE_LABEL[a.cost_type] ?? ADDITIONAL_COST_TYPE_LABEL[a.cost_type] ?? "").localeCompare(ANY_DIRECT_COST_TYPE_LABEL[b.cost_type] ?? ADDITIONAL_COST_TYPE_LABEL[b.cost_type] ?? "") || a.cost_date.localeCompare(b.cost_date))
        .map((c): Cell[] => [c.cost_date, c.cost_class === "direct" ? "Direct" : "Additional", ANY_DIRECT_COST_TYPE_LABEL[c.cost_type] ?? ADDITIONAL_COST_TYPE_LABEL[c.cost_type], COST_BASIS_LABEL[c.cost_basis], c.supplier_name, c.reference_no, c.description, Number(c.amount), c.notes]),
      // costs keyed in with this event's AutoCount invoice number (counted as actual direct costs)
      ...detail.autoCountCosts.flatMap((s) =>
        s.costs.map((c): Cell[] => [s.date, "Direct", ANY_DIRECT_COST_TYPE_LABEL[c.cost_type] ?? c.cost_type, COST_BASIS_LABEL.actual, s.partyName, s.reference, `${AUTOCOUNT_SOURCE_LABEL[s.source]} with AutoCount no. ${s.autoCountNo}`, c.amount, null]),
      ),
    ];
    if (detail.flags.length) rows.splice(9, 0, ["Warnings", detail.flags.map((f) => DATA_FLAG_LABEL[f]).join("; ")]);
    return respond(rows, format, `event-pnl-${event.event_reference ?? event.id}`, "Event P&L");
  }

  // ---- the month: one row per event, totals, warnings
  const pnlCompanies = await eventPnlCompanies(supabase);
  const requested = url.searchParams.get("company") ?? undefined;
  const { targetCompanyIds } = resolveCompanyScope(session, pnlCompanies, requested);
  const adminIds = await eventPnlCompanyIds(supabase, targetCompanyIds);
  if (adminIds.length === 0) return new NextResponse("Not allowed.", { status: 403 });

  const now = malaysiaMonthNow();
  const year = Number(url.searchParams.get("year")) || now.year;
  const month = Math.min(12, Math.max(1, Number(url.searchParams.get("month")) || now.month));
  const rowsData = await listEventPnl(supabase, adminIds, { year, month, search: url.searchParams.get("q") ?? undefined, customer: url.searchParams.get("customer") ?? undefined, status: url.searchParams.get("status") ?? undefined });
  const totals = totalEventPnl(countedRows(rowsData).map((r) => r.pnl));
  const scope = requested ? pnlCompanies.find((c) => c.id === requested)?.name ?? "" : "Signature Solution + Kasturi Indah (consolidated)";
  const review = await eventPnlReviewItems(supabase, adminIds, year, month);
  const flagged = rowsData.filter((r) => r.flags.length > 0);

  const rows: Cell[][] = [
    ["Monthly Event P&L"],
    ["Company", scope],
    ["Reporting month", `${MONTH_LABEL[month - 1]} ${year}`],
    ["Report generated", generated()],
    ["Basis", "Events counted by event date; actual revenue and costs only; customer/supplier payments are not added"],
    [],
    ["Event date", "AutoCount invoice no.", "Event reference", "Event", "Company", "Customer", "Net revenue (RM)", "Direct costs (RM)", "Gross profit (RM)", "Additional expenses (RM)", "Net event profit (RM)", "Margin", "Result", "Event status"],
    ...rowsData.map((r): Cell[] => [r.eventDate, r.autoCountNos.join(", ") || "no invoice yet", r.eventReference, r.eventName, r.companyName, r.customerName, r.pnl.netRevenue, r.pnl.directCosts, r.pnl.grossProfit, r.pnl.additionalExpenses, r.pnl.netProfit, formatMargin(r.pnl.margin), VERDICT_LABEL[r.pnl.verdict], EVENT_STATUS_LABEL[r.status] ?? r.status]),
    [`TOTAL (${totals.events} events)`, null, null, null, null, null, totals.netRevenue, totals.directCosts, totals.grossProfit, totals.additionalExpenses, totals.netProfit, formatMargin(totals.margin), `${totals.lossMaking} loss-making`, null],
    [],
    ["Monthly margin = total net event profit / total net event revenue (not an average of event margins)"],
  ];
  const warnings: Cell[][] = [["Warnings and items for review"]];
  for (const r of flagged) warnings.push([r.eventName, r.flags.map((f) => DATA_FLAG_LABEL[f]).join("; ")]);
  for (const i of review.notCounted) warnings.push([i.label, i.detail]);
  for (const i of review.unlinked) warnings.push([i.label, i.detail]);
  if (totals.estimatedCosts > 0) warnings.push(["Estimated costs (not included)", two(totals.estimatedCosts)]);
  if (warnings.length === 1) warnings.push(["None"]);
  // CSV is a single sheet, so the warnings are appended; Excel gets them as their own sheet as well
  if (format === "csv") rows.push([], ...warnings);
  return respond(rows, format, `monthly-event-pnl-${year}-${String(month).padStart(2, "0")}`, "Monthly Event P&L", format === "xlsx" ? [{ name: "Warnings", rows: warnings }] : []);
}
