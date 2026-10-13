// Run with: node scripts/test-purchase-list.mjs  (Node 22.18+ / 24 runs the .ts import directly)
import assert from "node:assert/strict";
import { consolidate, scaleQuantity, normaliseUnit } from "../src/lib/purchaseList/calc.ts";

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("PASS", name); };
const L = (name, q, unit, basePax = 10, extra = {}) => ({ name, baseQuantity: q, basePax, unit, ...extra });
const M = (key, lines) => ({ key, label: key, lines });
const find = (items, name, unit) => items.find((i) => i.name.toUpperCase() === name && (unit === undefined || i.unit === unit));

t("scaleQuantity: 10-pax base to 100 pax is x10 and to 50 pax is x5", () => {
  assert.equal(scaleQuantity(50, 10, 100), 500);
  assert.equal(scaleQuantity(50, 10, 50), 250);
  assert.equal(scaleQuantity(5, 10, 100), 50);
  assert.equal(scaleQuantity(200, 10, 1000), 20000);
  assert.equal(scaleQuantity(200, 10, 20), 400);
});
t("a blank quantity is null, never zero", () => {
  assert.equal(scaleQuantity(null, 10, 100), null);
  assert.equal(scaleQuantity(5, 0, 100), null);
});
t("different base pax (45-pax recipe vs 10-pax recipe) scale independently", () => {
  const items = consolidate([M("A", [L("AYAM", 45000, "GM", 45)]), M("B", [L("AYAM", 1000, "GM", 10)])], 90);
  assert.equal(find(items, "AYAM", "GM").calculated, 90000 + 9000);
});
t("spec example: Minyak/Telur/Bawang + Minyak/Telur/Ayam consolidate", () => {
  const A = M("Menu A", [L("MINYAK", 50, "GM"), L("TELUR", 5, "BIJI"), L("BAWANG", 20, "GM")]);
  const B = M("Menu B", [L("MINYAK", 30, "GM"), L("TELUR", 2, "BIJI"), L("AYAM", 0.5, "KG")]);
  const items = consolidate([A, B], 100);
  assert.equal(find(items, "MINYAK").calculated, 800);
  assert.equal(find(items, "TELUR").calculated, 70);
  assert.equal(find(items, "BAWANG").calculated, 200);
  const ayam = find(items, "AYAM"); assert.equal(ayam.calculated, 5); assert.equal(ayam.unit, "KG");
  assert.equal(find(items, "MINYAK").breakdown.length, 2);
});
t("GM and KG of the same ingredient combine by exact conversion (G = GM)", () => {
  const items = consolidate([M("A", [L("GARAM", 500, "G")]), M("B", [L("GARAM", 1, "KG")]), M("C", [L("GARAM", 250, "GM")])], 10);
  const g = items.filter((i) => i.name === "GARAM"); assert.equal(g.length, 1);
  assert.equal(g[0].unit, "GM"); assert.equal(g[0].calculated, 500 + 1000 + 250);
  assert.ok(g[0].flags.some((f) => f.includes("exact conversion")));
});
t("all-KG lines stay in KG", () => {
  const items = consolidate([M("A", [L("AYAM", 2, "KG")]), M("B", [L("AYAM", 3, "KG")])], 10);
  assert.equal(find(items, "AYAM").unit, "KG"); assert.equal(find(items, "AYAM").calculated, 5);
});
t("mass and volume are never combined (AIR in GM and in L stay separate and are flagged)", () => {
  const items = consolidate([M("A", [L("AIR", 500, "GM")]), M("B", [L("AIR", 2, "L")])], 10);
  const air = items.filter((i) => i.name === "AIR"); assert.equal(air.length, 2);
  assert.ok(air.every((i) => i.flags.some((f) => f.includes("another unit"))));
});
t("ML and L combine; LITER = L", () => {
  const items = consolidate([M("A", [L("SANTAN", 500, "ML")]), M("B", [L("SANTAN", 1, "LITER")])], 10);
  assert.equal(items.length, 1); assert.equal(items[0].unit, "ML"); assert.equal(items[0].calculated, 500 + 1000);
});
t("similar but different ingredients are NOT combined (bawang putih vs bawang merah vs bawang)", () => {
  const items = consolidate([M("A", [L("BAWANG PUTIH", 10, "GM"), L("BAWANG MERAH", 10, "GM"), L("BAWANG", 10, "GM")])], 10);
  assert.equal(items.length, 3);
});
t("names match ignoring case and extra spaces", () => {
  const items = consolidate([M("A", [L("Bawang  Putih", 10, "GM")]), M("B", [L("BAWANG PUTIH", 20, "G")])], 10);
  assert.equal(items.length, 1); assert.equal(items[0].calculated, 30);
});
t("near-identical spelling is flagged, not merged", () => {
  const items = consolidate([M("A", [L("CAPSICUM MERAH", 10, "GM")]), M("B", [L("CAPSIKUM MERAH", 10, "GM")])], 10);
  assert.equal(items.length, 2);
  assert.ok(items.every((i) => i.flags.some((f) => f.startsWith("Similar name"))));
});
t("blank quantity: kept as blank + flagged, others still counted, never zero", () => {
  const items = consolidate([M("A", [L("CENGKIH", null, "GM")]), M("B", [L("CENGKIH", 10, "GM")]), M("C", [L("KAYU MANIS", null, "GM")])], 10);
  assert.equal(find(items, "CENGKIH").calculated, 10);
  assert.ok(find(items, "CENGKIH").flags.some((f) => f.includes("blank")));
  assert.equal(find(items, "KAYU MANIS").calculated, null);
  assert.equal(find(items, "KAYU MANIS").suggested, null);
});
t("no unit is flagged", () => {
  const items = consolidate([M("A", [L("KAYA", 5, null)])], 10);
  assert.equal(items[0].unit, null); assert.ok(items[0].flags.some((f) => f.includes("No unit")));
});
t("whole items round up (eggs 5 BIJI per 10 pax at 25 pax = 12.5 -> 13), weights are not rounded up", () => {
  const items = consolidate([M("A", [L("TELUR", 5, "BIJI"), L("GARAM", 7, "GM")])], 25);
  const egg = find(items, "TELUR"); assert.equal(egg.calculated, 12.5); assert.equal(egg.suggested, 13); assert.match(egg.roundingNote, /whole BIJI/);
  const salt = find(items, "GARAM"); assert.equal(salt.calculated, 17.5); assert.equal(salt.suggested, 17.5); assert.equal(salt.roundingNote, null);
});
t("PC, PCS and NOS combine; HELAI stays separate", () => {
  const items = consolidate([M("A", [L("DAUN", 2, "PC")]), M("B", [L("DAUN", 3, "NOS")]), M("C", [L("DAUN", 4, "PCS")]), M("D", [L("DAUN", 5, "HELAI")])], 10);
  const daun = items.filter((i) => i.name === "DAUN"); assert.equal(daun.length, 2);
  assert.equal(daun.find((i) => i.unit === "PCS").calculated, 9); assert.equal(daun.find((i) => i.unit === "HELAI").calculated, 5);
});
t("changing the pax recalculates every line", () => {
  const menus = [M("A", [L("MINYAK", 50, "GM"), L("TELUR", 5, "BIJI")])];
  assert.equal(find(consolidate(menus, 100), "MINYAK").calculated, 500);
  assert.equal(find(consolidate(menus, 150), "MINYAK").calculated, 750);
  assert.equal(find(consolidate(menus, 20), "MINYAK").calculated, 100);
});
t("a menu file figure that disagrees with its own ratio is flagged, and the base ratio is used", () => {
  const items = consolidate([M("PENCUK", [L("NENAS", 1, "KG", 10, { referenceQuantity: 30, referencePax: 100 })])], 100);
  const nenas = find(items, "NENAS"); assert.equal(nenas.calculated, 10);
  assert.ok(nenas.flags.some((f) => f.includes("differs"))); assert.ok(nenas.breakdown[0].note.includes("30"));
});
t("a matching menu file figure is not flagged", () => {
  const items = consolidate([M("A", [L("GULA", 50, "GM", 10, { referenceQuantity: 500, referencePax: 100 })])], 100);
  assert.equal(find(items, "GULA").flags.length, 0);
});
t("stock: not checked when there is no stock record (full requirement shown)", () => {
  const items = consolidate([M("A", [L("GULA", 50, "GM")])], 100);
  assert.equal(items[0].stockStatus, "not_checked"); assert.equal(items[0].suggested, 500);
});
t("stock: deducted only when a record exists in a compatible unit (logic test with synthetic stock)", () => {
  const stock = new Map([["GULA", { quantity: 0.2, unit: "KG" }], ["MINYAK", { quantity: 3, unit: "L" }]]);
  const items = consolidate([M("A", [L("GULA", 50, "GM"), L("MINYAK", 50, "GM")])], 100, { stock });
  const gula = find(items, "GULA"); assert.equal(gula.stockStatus, "checked"); assert.equal(gula.stockAvailable, 200); assert.equal(gula.suggested, 300);
  const minyak = find(items, "MINYAK"); assert.equal(minyak.stockStatus, "not_checked"); assert.equal(minyak.suggested, 500); // mass vs volume: not compatible
});
t("stock larger than the need gives a zero purchase, never negative", () => {
  const stock = new Map([["GULA", { quantity: 5, unit: "KG" }]]);
  assert.equal(consolidate([M("A", [L("GULA", 50, "GM")])], 100, { stock })[0].suggested, 0);
});
t("unit info", () => {
  assert.equal(normaliseUnit("kg").factor, 1000); assert.equal(normaliseUnit("g").canonical, "GM"); assert.equal(normaliseUnit(null).family, "none");
});
console.log(`\n${n} tests passed`);
