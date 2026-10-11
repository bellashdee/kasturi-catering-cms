// Run with: node scripts/test-event-pnl.mjs  (Node 22.18+ / 24 runs the .ts import directly)
import assert from "node:assert/strict";
import { computeEventPnl, totalEventPnl, percentChange, budgetVsActual, dataFlagsFor, formatMargin, sheetTotal } from "../src/lib/finance/eventPnl.ts";

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("PASS", name); };
const rev = (entry_type, amount) => ({ entry_type, amount });
const cost = (cost_class, cost_type, amount, cost_basis = "actual") => ({ cost_class, cost_type, amount, cost_basis });

// A: profitable event
const A = computeEventPnl([rev("sales", 10000), rev("additional_service", 500)], [cost("direct", "food_ingredients", 4000), cost("direct", "labour_overtime", 1000), cost("additional", "permit", 200)], null);
// B: loss-making event
const B = computeEventPnl([rev("package", 3000)], [cost("direct", "meat_seafood_vegetables", 3500), cost("direct", "transport_delivery", 300), cost("additional", "venue", 400)], null);
// C: zero revenue, has costs
const C = computeEventPnl([], [cost("direct", "food_ingredients", 800)], null);
// D: revenue but no costs (missing costs)
const D = computeEventPnl([rev("sales", 2000)], [], null);
// E: cancelled event with a refund
const E = computeEventPnl([rev("sales", 1000), rev("refund", 1000)], [], null);
// F: nothing at all
const F = computeEventPnl([], [], null);

t("net revenue = gross - discounts - refunds - credit notes", () => {
  const x = computeEventPnl([rev("sales", 1000), rev("discount", 100), rev("refund", 50), rev("credit_note", 25)], [], null);
  assert.equal(x.grossRevenue, 1000); assert.equal(x.deductions, 175); assert.equal(x.netRevenue, 825);
});
t("A profitable: GP, net profit and margin", () => {
  assert.equal(A.netRevenue, 10500); assert.equal(A.directCosts, 5000); assert.equal(A.grossProfit, 5500);
  assert.equal(A.additionalExpenses, 200); assert.equal(A.netProfit, 5300);
  assert.ok(Math.abs((A.margin ?? 0) - (5300 / 10500) * 100) < 1e-9); assert.equal(A.verdict, "profit");
});
t("B loss-making identified", () => { assert.equal(B.netProfit, 3000 - 3800 - 400); assert.equal(B.verdict, "loss"); });
t("C zero revenue: margin N/A, loss", () => { assert.equal(C.margin, null); assert.equal(formatMargin(C.margin), "N/A"); assert.equal(C.verdict, "loss"); });
t("D missing costs flagged", () => { assert.deepEqual(dataFlagsFor(D, "confirmed"), ["no_costs"]); });
t("C missing revenue flagged", () => { assert.deepEqual(dataFlagsFor(C, "completed"), ["no_revenue"]); });
t("F no figures flagged; cancelled/enquiry not flagged", () => {
  assert.deepEqual(dataFlagsFor(F, "confirmed"), ["no_entries"]); assert.deepEqual(dataFlagsFor(F, "cancelled"), []); assert.deepEqual(dataFlagsFor(F, "enquiry"), []);
});
t("E refund brings revenue to zero, break-even, margin N/A", () => { assert.equal(E.netRevenue, 0); assert.equal(E.verdict, "break_even"); assert.equal(E.margin, null); });
t("F has no figures (not break-even)", () => { assert.equal(F.verdict, "no_data"); });
t("estimated costs never enter the P&L", () => {
  const x = computeEventPnl([rev("sales", 1000)], [cost("direct", "food_ingredients", 300), cost("direct", "food_ingredients", 9999, "estimated")], null);
  assert.equal(x.directCosts, 300); assert.equal(x.estimatedCosts, 9999); assert.equal(x.netProfit, 700);
});
t("Catering costing sheet counted once, rolled into the six groups", () => {
  const sheet = { food_cost: 100, ingredient_cost: 50, staff_cost: 30, transport_cost: 20, equipment_cost: 10, other_cost: 5 };
  assert.equal(sheetTotal(sheet), 215);
  const x = computeEventPnl([rev("sales", 1000)], [cost("direct", "packaging", 40)], sheet);
  assert.equal(x.directCosts, 255); assert.equal(x.fromCostingSheet, 215);
  assert.equal(x.directByGroup["Food & Beverage"], 150); assert.equal(x.directByGroup["Packaging & Disposable"], 40); assert.equal(x.directByGroup["Labour"], 30);
});
t("monthly totals = sum of events; margin = total profit / total revenue (not an average)", () => {
  const all = [A, B, C, D, E];
  const tot = totalEventPnl(all);
  assert.equal(tot.netRevenue, A.netRevenue + B.netRevenue + C.netRevenue + D.netRevenue + E.netRevenue);
  assert.equal(tot.netProfit, Math.round((A.netProfit + B.netProfit + C.netProfit + D.netProfit + E.netProfit) * 100) / 100);
  assert.equal(tot.directCosts, A.directCosts + B.directCosts + C.directCosts + D.directCosts + E.directCosts);
  assert.ok(Math.abs((tot.margin ?? 0) - (tot.netProfit / tot.netRevenue) * 100) < 1e-9);
  const margins = [A, B, D].map((p) => p.margin); const avg = margins.reduce((a, b) => a + b, 0) / margins.length;
  assert.notEqual(Math.round(totalEventPnl([A, B, D]).margin * 100), Math.round(avg * 100));
  assert.equal(tot.events, 5); assert.equal(tot.lossMaking, 2); assert.equal(tot.profitable, 2); assert.equal(tot.breakEven, 1);
});
t("monthly total with zero revenue has margin N/A", () => { assert.equal(totalEventPnl([C]).margin, null); assert.equal(totalEventPnl([]).margin, null); });
t("percent change is null (n/a) when previous is zero or missing", () => {
  assert.equal(percentChange(100, 0), null); assert.equal(percentChange(100, null), null); assert.equal(percentChange(100, undefined), null);
  assert.equal(percentChange(150, 100), 50); assert.equal(percentChange(50, 100), -50); assert.equal(percentChange(-50, -100), 50);
});
t("budget vs actual: no budget → null; partial budget keeps unset as null", () => {
  assert.equal(budgetVsActual(A, null), null);
  const b = budgetVsActual(A, { budget_revenue: 12000, budget_direct_costs: null, budget_additional_costs: null })
  assert.equal(b.revenue.variance, 10500 - 12000); assert.equal(b.costs.budgeted, null); assert.equal(b.profit.budgeted, null); assert.equal(b.costs.variance, null);
  const full = budgetVsActual(A, { budget_revenue: 12000, budget_direct_costs: 5500, budget_additional_costs: 300 });
  assert.equal(full.profit.budgeted, 6200); assert.equal(full.profit.variance, 5300 - 6200); assert.equal(full.costs.actual, 5200);
});
t("rounding: two-decimal precision, no float drift", () => {
  const x = computeEventPnl([rev("sales", 0.1), rev("sales", 0.2)], [cost("direct", "packaging", 0.1)], null);
  assert.equal(x.grossRevenue, 0.3); assert.equal(x.netProfit, 0.2);
});
console.log(`\n${n} tests passed`);
