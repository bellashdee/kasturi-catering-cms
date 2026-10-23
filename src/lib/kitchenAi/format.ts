import { findByPhrase } from "./match";
import type { Change } from "./ops";
import type { CalcDish, CalcResult, ConsolRow, KState, Lang } from "./types";
import { display, formatQty, type UnitMode } from "./units";

const EN = {
  identified: "I've identified the following menu items:",
  fromEvent: "Here is the confirmed menu of the event order:",
  session: "Session",
  pax: "pax",
  askPax: "How many pax do you need to prepare for?",
  askPaxSession: "How many pax for {0}? (for example: \"{0} 200\")",
  recipe: "recipe",
  recipeRequired: "Recipe Data Required",
  estimatePending: "AI ESTIMATE — NOT YET VERIFIED",
  estimateReviewed: "AI estimate — reviewed by {0}",
  needRecipeHelp: "These dishes have no recipe in the recipe database: {0}. Reply \"estimate\" for an AI estimate (clearly labelled as not verified), choose a recipe for the dish in the panel above, or add the recipe in Kitchen → Recipes.",
  kitchenReq: "KITCHEN INGREDIENT REQUIREMENTS",
  event: "Event",
  date: "Date",
  menuBasis: "Menu",
  basedImage: "Based on the uploaded image",
  basedOrder: "Based on the event order",
  basedTyped: "Based on the menu entered",
  deadline: "Kitchen preparation: set-up {0}, food ready {1}",
  menuN: "MENU {0}",
  ingredient: "Ingredient",
  quantity: "Quantity",
  unit: "Unit",
  total: "Total Quantity",
  source: "Source",
  consolidated: "CONSOLIDATED INGREDIENT LIST",
  allSessions: "ALL SESSIONS",
  shopping: "SHOPPING LIST",
  recipeSrc: "Recipe",
  estimateSrc: "AI estimate",
  mixedSrc: "Recipe + AI estimate ({0} of the total)",
  recipeUsed: "Recipe: {0} (written for {1} pax)",
  assumptions: "Assumptions",
  noPaxDish: "pax not entered yet",
  inStock: "In stock",
  toBuy: "To buy",
  stockTitle: "STOCK COMPARISON",
  stockUnknown: "not in the stock list",
  stockUnitDiffers: "stock unit differs",
  enough: "enough",
  reservedNote: "Reserved quantities for other events are not tracked yet, so \"In stock\" is the current stock.",
  pendingWarn: "⚠ This list includes AI estimates that are not verified. A chef must review them (reply \"estimates reviewed\") before they are used for purchasing or production.",
  noDish: "I could not find a dish like \"{0}\" in the menu.",
  mismatchTitle: "The photo and the event order do not match:",
  onlyPhoto: "In the photo but not in the order: {0}",
  onlyOrder: "In the order but not in the photo: {0}",
  paxDiffers: "Pax: photo {0}, event order {1}",
  mismatchKeep: "The event order has not been changed. Tell me which one to use.",
  readerIssues: "About the image",
  noItems: "No dishes",
  changedPax: "Pax for {0} is now {1}.",
  removed: "Removed {0}.",
  replaced: "Changed {0} to {1}.",
  replacedNeedsRecipe: "{0} has no recipe yet: new recipe information is needed (choose a recipe, or ask for an AI estimate).",
  replacedMatched: "Using recipe {0}.",
  added: "Added {0}.",
  recipeSet: "{0} now uses the recipe {1}.",
  approved: "{0} estimate(s) marked as reviewed.",
  nothingToApprove: "There is no AI estimate waiting for review.",
  unitKg: "Quantities are shown in kilograms / litres.",
  unitAuto: "Quantities are shown in grams / kilograms as suited.",
  errNoSession: "There is no menu to change yet.",
  errNoItem: "I could not find a dish like \"{0}\".",
  errNoRecipe: "I could not find a recipe like \"{0}\" with ingredients in the recipe database.",
  errNoPax: "No pax has been entered yet. Tell me the number of pax first.",
  estimateDone: "AI estimate written for: {0}. It is labelled NOT YET VERIFIED and is kept apart from the approved recipes.",
  estimateFailed: "The AI could not write an estimate for: {0}.",
  estimateNone: "Every dish already has a recipe or an estimate.",
  estimateNeedPax: "Enter the pax first, then ask for the estimate.",
  helpTitle: "You can ask me, for example:",
  help: ["Change the pax to 300 / Add 20 more pax", "Remove the soup / Change chicken curry to beef curry", "Show me the ingredients for chicken curry only", "Generate the shopping list only", "Convert all quantities to kilograms", "Compare with our current stock", "Export this list to Excel", "Estimate (an AI estimate for dishes without a recipe)"],
  exportReady: "The Excel file is ready: use the Export to Excel button.",
  noQuantities: "No quantities yet: every dish needs a recipe (or an estimate) and the pax.",
  kgNote: "kg / litres",
};

const MS: typeof EN = {
  identified: "Saya telah mengenal pasti item menu berikut:",
  fromEvent: "Ini menu yang disahkan dalam pesanan majlis:",
  session: "Sesi",
  pax: "pax",
  askPax: "Berapa pax yang perlu disediakan?",
  askPaxSession: "Berapa pax untuk {0}? (contoh: \"{0} 200\")",
  recipe: "resipi",
  recipeRequired: "Data Resipi Diperlukan",
  estimatePending: "ANGGARAN AI — BELUM DISAHKAN",
  estimateReviewed: "Anggaran AI — disemak oleh {0}",
  needRecipeHelp: "Hidangan ini tiada resipi dalam pangkalan data resipi: {0}. Balas \"anggaran\" untuk anggaran AI (dilabel jelas sebagai belum disahkan), pilih resipi untuk hidangan dalam panel di atas, atau tambah resipi dalam Dapur → Resipi.",
  kitchenReq: "KEPERLUAN BAHAN DAPUR",
  event: "Majlis",
  date: "Tarikh",
  menuBasis: "Menu",
  basedImage: "Berdasarkan gambar yang dimuat naik",
  basedOrder: "Berdasarkan pesanan majlis",
  basedTyped: "Berdasarkan menu yang dimasukkan",
  deadline: "Persiapan dapur: set-up {0}, makanan siap {1}",
  menuN: "MENU {0}",
  ingredient: "Bahan",
  quantity: "Kuantiti",
  unit: "Unit",
  total: "Jumlah Kuantiti",
  source: "Sumber",
  consolidated: "SENARAI BAHAN GABUNGAN",
  allSessions: "SEMUA SESI",
  shopping: "SENARAI BELIAN",
  recipeSrc: "Resipi",
  estimateSrc: "Anggaran AI",
  mixedSrc: "Resipi + anggaran AI ({0} daripada jumlah)",
  recipeUsed: "Resipi: {0} (ditulis untuk {1} pax)",
  assumptions: "Andaian",
  noPaxDish: "pax belum dimasukkan",
  inStock: "Dalam stok",
  toBuy: "Perlu dibeli",
  stockTitle: "PERBANDINGAN STOK",
  stockUnknown: "tiada dalam senarai stok",
  stockUnitDiffers: "unit stok berbeza",
  enough: "mencukupi",
  reservedNote: "Kuantiti yang ditempah untuk majlis lain belum dijejak, jadi \"Dalam stok\" ialah stok semasa.",
  pendingWarn: "⚠ Senarai ini mengandungi anggaran AI yang belum disahkan. Chef mesti menyemaknya (balas \"anggaran telah disemak\") sebelum digunakan untuk pembelian atau pengeluaran.",
  noDish: "Saya tidak jumpa hidangan seperti \"{0}\" dalam menu.",
  mismatchTitle: "Gambar dan pesanan majlis tidak sepadan:",
  onlyPhoto: "Dalam gambar tetapi tiada dalam pesanan: {0}",
  onlyOrder: "Dalam pesanan tetapi tiada dalam gambar: {0}",
  paxDiffers: "Pax: gambar {0}, pesanan majlis {1}",
  mismatchKeep: "Pesanan majlis tidak diubah. Beritahu saya yang mana satu hendak digunakan.",
  readerIssues: "Tentang gambar",
  noItems: "Tiada hidangan",
  changedPax: "Pax untuk {0} kini {1}.",
  removed: "{0} dibuang.",
  replaced: "{0} ditukar kepada {1}.",
  replacedNeedsRecipe: "{0} belum ada resipi: maklumat resipi baharu diperlukan (pilih resipi, atau minta anggaran AI).",
  replacedMatched: "Menggunakan resipi {0}.",
  added: "{0} ditambah.",
  recipeSet: "{0} kini menggunakan resipi {1}.",
  approved: "{0} anggaran ditanda telah disemak.",
  nothingToApprove: "Tiada anggaran AI yang menunggu semakan.",
  unitKg: "Kuantiti dipaparkan dalam kilogram / liter.",
  unitAuto: "Kuantiti dipaparkan dalam gram / kilogram mengikut kesesuaian.",
  errNoSession: "Belum ada menu untuk diubah.",
  errNoItem: "Saya tidak jumpa hidangan seperti \"{0}\".",
  errNoRecipe: "Saya tidak jumpa resipi seperti \"{0}\" yang mempunyai bahan dalam pangkalan data resipi.",
  errNoPax: "Pax belum dimasukkan. Beritahu saya bilangan pax dahulu.",
  estimateDone: "Anggaran AI ditulis untuk: {0}. Ia dilabel BELUM DISAHKAN dan diasingkan daripada resipi yang diluluskan.",
  estimateFailed: "AI tidak dapat menulis anggaran untuk: {0}.",
  estimateNone: "Setiap hidangan sudah mempunyai resipi atau anggaran.",
  estimateNeedPax: "Masukkan pax dahulu, kemudian minta anggaran.",
  helpTitle: "Anda boleh minta, contohnya:",
  help: ["Tukar pax kepada 300 / Tambah 20 pax lagi", "Buang sup / Tukar kari ayam kepada kari daging", "Tunjuk bahan untuk kari ayam sahaja", "Jana senarai belian sahaja", "Tukar semua kuantiti kepada kilogram", "Banding dengan stok semasa", "Eksport senarai ini ke Excel", "Anggaran (anggaran AI untuk hidangan tanpa resipi)"],
  exportReady: "Fail Excel sedia: guna butang Eksport ke Excel.",
  noQuantities: "Belum ada kuantiti: setiap hidangan perlukan resipi (atau anggaran) dan pax.",
  kgNote: "kg / liter",
};

export const text = (lang: Lang) => (lang === "ms" ? MS : EN);
export const fill = (s: string, ...vars: (string | number)[]) => s.replace(/\{(\d+)\}/g, (_, i) => String(vars[Number(i)] ?? ""));

const esc = (s: string) => s.replace(/\|/g, "/").replace(/\n/g, " ");
const table = (headers: string[], rows: string[][]) => [`| ${headers.map(esc).join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`, ...rows.map((r) => `| ${r.map(esc).join(" | ")} |`)].join("\n");

const qtyCells = (row: { qty: number; family: ConsolRow["family"]; key: string }, mode: UnitMode) => {
  const d = display({ qty: row.qty, family: row.family, key: row.key }, mode);
  return [formatQty(d.qty), d.unit];
};

function sourceText(row: ConsolRow, lang: Lang): string {
  const L = text(lang);
  if (row.estimateQty <= 0) return L.recipeSrc;
  if (row.estimateQty >= row.qty - 1e-9) return L.estimateSrc;
  const d = display({ qty: row.estimateQty, family: row.family, key: row.key });
  return fill(L.mixedSrc, `${formatQty(d.qty)} ${d.unit}`);
}

function headerBlock(state: KState, calc: CalcResult, lang: Lang): string {
  const L = text(lang);
  const lines = [`**${L.kitchenReq}**`];
  const name = state.event?.name ?? state.photoEventName;
  if (name) lines.push(`${L.event}: ${name}`);
  if (state.event?.date) lines.push(`${L.date}: ${state.event.date}`);
  const paxLine = calc.sessions.length === 1 ? `${calc.sessions[0].pax ?? "—"}` : calc.sessions.map((s) => `${s.name}: ${s.pax ?? "—"}`).join(" · ");
  lines.push(`Pax: ${paxLine}`);
  lines.push(`${L.menuBasis}: ${state.event && state.documentIds.length === 0 ? L.basedOrder : state.documentIds.length > 0 ? L.basedImage : L.basedTyped}`);
  if (state.event?.eventTime || state.event?.setupTime) lines.push(fill(L.deadline, state.event.setupTime ?? "—", state.event.eventTime ?? "—"));
  return lines.join("\n");
}

function dishBlock(d: CalcDish, n: number, state: KState, lang: Lang): string {
  const L = text(lang);
  const title = `**${fill(L.menuN, n)}: ${d.itemName.toUpperCase()}**`;
  if (d.problem === "pax") return `${title}\n⚠ ${L.noPaxDish}`;
  if (d.source === "missing") return `${title}\n⚠ ${L.recipeRequired}`;
  const item = state.sessions.find((s) => s.id === d.sessionId)?.items.find((i) => i.id === d.itemId);
  const head =
    d.source === "recipe"
      ? `_${fill(L.recipeUsed, d.recipeName ?? "", d.recipeYield ?? "")}_`
      : d.estimateStatus === "reviewed"
        ? `**${fill(L.estimateReviewed, item?.estimate?.reviewedBy ?? "")}**`
        : `**${L.estimatePending}**`;
  const assumptions = d.source === "estimate" && item?.estimate ? `\n_${L.assumptions}: ${item.estimate.assumptions.join(" ")}_` : "";
  const rows = d.lines.map((l) => [l.name, ...qtyCells(l, state.unitMode)]);
  return `${title}\n${head}${assumptions}\n${table([L.ingredient, L.quantity, L.unit], rows)}`;
}

function consolidatedBlock(title: string, rows: ConsolRow[], state: KState, lang: Lang, withStock: boolean): string {
  const L = text(lang);
  if (rows.length === 0) return `**${title}**\n${L.noQuantities}`;
  if (!withStock) {
    return `**${title}**\n${table([L.ingredient, L.total, L.unit, L.source], rows.map((r) => [r.name, ...qtyCells(r, state.unitMode), sourceText(r, lang)]))}`;
  }
  return `**${title}**\n${table(
    [L.ingredient, L.total, L.unit, L.inStock, L.toBuy],
    rows.map((r) => {
      const [q, u] = qtyCells(r, state.unitMode);
      if (!r.stock || !r.stock.known) return [r.name, q, u, `— (${r.stock ? L.stockUnknown : "—"})`, `${q} ${u}`];
      const have = qtyCells({ qty: r.stock.qty, family: r.family, key: r.key }, state.unitMode);
      const need = qtyCells({ qty: r.shortage ?? 0, family: r.family, key: r.key }, state.unitMode);
      return [r.name, q, u, `${have[0]} ${have[1]}`, (r.shortage ?? 0) > 1e-9 ? `${need[0]} ${need[1]}` : L.enough];
    }),
  )}`;
}

function warnings(calc: CalcResult, lang: Lang): string[] {
  const L = text(lang);
  const out: string[] = [];
  const noRecipe = calc.needsData.filter((n) => n.reason === "recipe" || n.reason === "recipe_empty");
  if (noRecipe.length > 0) out.push(`⚠ ${fill(L.needRecipeHelp, Array.from(new Set(noRecipe.map((n) => n.itemName))).join(", "))}`);
  if (calc.needsData.some((n) => n.reason === "pax")) out.push(`⚠ ${L.askPax}`);
  if (calc.usesPendingEstimate) out.push(L.pendingWarn);
  return out;
}

/** The menu as read, with the recipe each dish would use, and what is still needed before quantities can be calculated. */
export function reviewText(state: KState, calc: CalcResult, lang: Lang): string {
  const L = text(lang);
  const parts: string[] = [state.event && state.documentIds.length === 0 ? L.fromEvent : L.identified];
  const recipeNames = new Map(calc.sessions.flatMap((s) => s.dishes).map((d) => [d.itemId, d.recipeName]));
  state.sessions.forEach((s) => {
    const heading = state.sessions.length > 1 || s.name !== "Menu" ? `**${L.session}: ${s.name}${s.pax ? ` — ${s.pax} ${L.pax}` : ""}**` : "";
    const list = s.items.length
      ? s.items
          .map((i, n) => {
            const tag = i.recipeId ? ` → ${L.recipe}: ${recipeNames.get(i.id) ?? "?"}` : i.estimate ? ` → ${i.estimate.status === "pending" ? L.estimatePending : L.estimateSrc}` : ` → ⚠ ${L.recipeRequired}`;
            return `${n + 1}. ${i.name}${tag}`;
          })
          .join("\n")
      : L.noItems;
    parts.push([heading, list].filter(Boolean).join("\n"));
  });
  if (state.readerIssues.length > 0) parts.push(`${L.readerIssues}: ${state.readerIssues.join(" ")}`);
  if (state.mismatches.length > 0) parts.push([`⚠ ${L.mismatchTitle}`, ...state.mismatches.map((m) => `- ${m}`), L.mismatchKeep].join("\n"));
  const missingPax = state.sessions.filter((s) => s.pax === null);
  if (missingPax.length === 1 && state.sessions.length === 1) parts.push(L.askPax);
  else if (missingPax.length > 0) parts.push(missingPax.map((s) => fill(L.askPaxSession, s.name)).join("\n"));
  const noRecipe = calc.needsData.filter((n) => n.reason === "recipe" || n.reason === "recipe_empty");
  if (noRecipe.length > 0) parts.push(`⚠ ${fill(L.needRecipeHelp, Array.from(new Set(noRecipe.map((n) => n.itemName))).join(", "))}`);
  return parts.join("\n\n");
}

/** Per dish and the consolidated list(s) (the format the kitchen asked for). */
export function ingredientsText(state: KState, calc: CalcResult, lang: Lang): string {
  const L = text(lang);
  const parts: string[] = [headerBlock(state, calc, lang)];
  const multi = calc.sessions.length > 1;
  for (const s of calc.sessions) {
    if (multi) parts.push(`**${L.session.toUpperCase()}: ${s.name}${s.pax ? ` — ${s.pax} ${L.pax}` : ""}**`);
    s.dishes.forEach((d, n) => parts.push(dishBlock(d, n + 1, state, lang)));
    if (multi) parts.push(consolidatedBlock(`${L.consolidated} — ${s.name}`, s.consolidated, state, lang, state.stockCompared));
  }
  parts.push(consolidatedBlock(multi ? `${L.consolidated} — ${L.allSessions}` : L.consolidated, calc.combined, state, lang, state.stockCompared));
  parts.push(...warnings(calc, lang));
  if (state.unitMode === "kg") parts.push(L.unitKg);
  return parts.join("\n\n");
}

export function shoppingText(state: KState, calc: CalcResult, lang: Lang): string {
  const L = text(lang);
  const parts = [`**${L.shopping}**`];
  if (state.event?.name || state.photoEventName) parts.push(`${L.event}: ${state.event?.name ?? state.photoEventName}`);
  parts.push(consolidatedBlock(calc.sessions.length > 1 ? `${L.consolidated} — ${L.allSessions}` : L.consolidated, calc.combined, state, lang, state.stockCompared));
  parts.push(...warnings(calc, lang));
  return parts.join("\n\n");
}

export function dishText(state: KState, calc: CalcResult, lang: Lang): string {
  const L = text(lang);
  const all = calc.sessions.flatMap((s) => s.dishes);
  const hit = state.viewDish ? findByPhrase(state.viewDish, all.map((d) => ({ name: d.itemName, d }))) : null;
  if (!hit) return fill(L.noDish, state.viewDish ?? "");
  const d = hit.d;
  const n = all.findIndex((x) => x.itemId === d.itemId) + 1;
  // only this dish's own warnings (the estimate of another dish is not a warning about this one)
  const own = { ...calc, needsData: calc.needsData.filter((x) => x.itemId === d.itemId), usesPendingEstimate: d.source === "estimate" && d.estimateStatus === "pending" };
  return [dishBlock(d, n, state, lang), ...warnings(own, lang)].join("\n\n");
}

export function stockText(state: KState, calc: CalcResult, lang: Lang): string {
  const L = text(lang);
  return [`**${L.stockTitle}**`, consolidatedBlock(L.consolidated, calc.combined, state, lang, true), L.reservedNote].join("\n\n");
}

export function helpText(lang: Lang): string {
  const L = text(lang);
  return [L.helpTitle, ...L.help.map((h) => `- ${h}`)].join("\n");
}

/** One short line per change made by a follow-up message. */
export function changesText(changes: Change[], lang: Lang): string {
  const L = text(lang);
  const lines: string[] = [];
  for (const c of changes) {
    switch (c.kind) {
      case "pax":
        lines.push(fill(L.changedPax, c.sessions.join(", "), c.pax));
        break;
      case "removed":
        lines.push(fill(L.removed, c.name));
        break;
      case "replaced":
        lines.push(fill(L.replaced, c.from, c.to));
        lines.push(c.matched ? fill(L.replacedMatched, c.matched) : fill(L.replacedNeedsRecipe, c.to));
        break;
      case "added":
        lines.push(fill(L.added, c.name));
        lines.push(c.matched ? fill(L.replacedMatched, c.matched) : fill(L.replacedNeedsRecipe, c.name));
        break;
      case "recipe":
        lines.push(fill(L.recipeSet, c.item, c.recipe));
        break;
      case "approved":
        lines.push(c.count > 0 ? fill(L.approved, c.count) : L.nothingToApprove);
        break;
      case "unit":
        lines.push(c.mode === "kg" ? L.unitKg : L.unitAuto);
        break;
      case "error":
        lines.push(
          c.code === "no_item" ? fill(L.errNoItem, c.detail) : c.code === "no_recipe" ? fill(L.errNoRecipe, c.detail) : c.code === "no_pax" ? L.errNoPax : L.errNoSession,
        );
        break;
    }
  }
  return lines.join("\n");
}
