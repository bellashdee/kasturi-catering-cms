/**
 * Purchase list maths: scale every ingredient line of the selected menus to the required pax, then combine the lines
 * that are the same ingredient in a compatible unit into one purchase line, keeping the menu-by-menu breakdown.
 *
 * Nothing here is invented: quantities come only from the menu / recipe records. A blank quantity stays blank (it is
 * flagged for manual confirmation, never treated as zero), and units are only converted where the conversion is exact
 * (G = GM, KG = 1000 GM, L = LITER = 1000 ML, PC = PCS = NOS).
 */

export type SourceLine = {
  name: string;
  /** Quantity written in the menu for `basePax` guests; null when the menu leaves it blank. */
  baseQuantity: number | null;
  basePax: number;
  unit: string | null;
  /** The menu file's own pre-calculated figure for `referencePax` guests (menu plan only); used to cross-check. */
  referenceQuantity?: number | null;
  referencePax?: number | null;
  remark?: string | null;
};

export type SelectedMenu = { key: string; label: string; group?: string; lines: SourceLine[] };

export type StockRecord = { quantity: number; unit: string | null };
/** Stock-on-hand by normalised ingredient name. Only entries whose stock has actually been recorded belong here. */
export type StockMap = Map<string, StockRecord>;

export type BreakdownEntry = {
  menuKey: string;
  menuLabel: string;
  baseQuantity: number | null;
  basePax: number;
  unit: string | null;
  /** Scaled quantity in the line's own unit; null when the menu quantity is blank. */
  quantity: number | null;
  /** The menu's own serving instruction for this line (e.g. "150GM, SETIAP 1 ORANG"). */
  remark?: string | null;
  note?: string;
};

export type PurchaseItem = {
  key: string;
  name: string;
  /** Unit shown for the total (null when the menu gives no unit). */
  unit: string | null;
  /** Total needed for the recipes; null when nothing numeric could be calculated. */
  calculated: number | null;
  /** Suggested purchase quantity (stock deducted when stock is known, whole items rounded up). */
  suggested: number | null;
  roundingNote: string | null;
  stockStatus: "not_checked" | "checked";
  stockAvailable: number | null;
  flags: string[];
  breakdown: BreakdownEntry[];
};

type UnitInfo = { family: "mass" | "volume" | "piece" | "other" | "none"; factor: number; canonical: string; display: string };

const MASS_UNITS: Record<string, { factor: number; display: string }> = {
  G: { factor: 1, display: "GM" },
  GM: { factor: 1, display: "GM" },
  GRAM: { factor: 1, display: "GM" },
  GRAMS: { factor: 1, display: "GM" },
  KG: { factor: 1000, display: "KG" },
  KILO: { factor: 1000, display: "KG" },
};
const VOLUME_UNITS: Record<string, { factor: number; display: string }> = {
  ML: { factor: 1, display: "ML" },
  L: { factor: 1000, display: "L" },
  LITER: { factor: 1000, display: "L" },
  LITRE: { factor: 1000, display: "L" },
};
const PIECE_UNITS = new Set(["PC", "PCS", "NOS"]);
/** Units that are bought whole: a fractional need is rounded up for the purchase suggestion. */
const WHOLE_UNITS = new Set(["PCS", "BIJI", "HELAI", "BTL", "PKT", "BKS", "TIN", "BUNGKUS"]);

export function normaliseUnit(unit: string | null | undefined): UnitInfo {
  const u = (unit ?? "").trim().toUpperCase();
  if (!u) return { family: "none", factor: 1, canonical: "", display: "" };
  if (MASS_UNITS[u]) return { family: "mass", factor: MASS_UNITS[u].factor, canonical: "GM", display: MASS_UNITS[u].display };
  if (VOLUME_UNITS[u]) return { family: "volume", factor: VOLUME_UNITS[u].factor, canonical: "ML", display: VOLUME_UNITS[u].display };
  if (PIECE_UNITS.has(u)) return { family: "piece", factor: 1, canonical: "PCS", display: "PCS" };
  return { family: "other", factor: 1, canonical: u, display: u };
}

/** Same ingredient only when the names match after trimming, collapsing spaces and ignoring upper/lower case. */
export function normaliseName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toUpperCase();
}

const familyKey = (u: UnitInfo) => (u.family === "other" ? `unit:${u.canonical}` : u.family);

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Original quantity ÷ original pax × required pax. Null (not zero) when the menu quantity is blank. */
export function scaleQuantity(baseQuantity: number | null, basePax: number, requiredPax: number): number | null {
  if (baseQuantity === null || !(basePax > 0)) return null;
  return (baseQuantity / basePax) * requiredPax;
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

const squash = (name: string) => normaliseName(name).replace(/[^A-Z0-9 ]/g, "").split(" ").filter(Boolean).sort().join(" ");

export type ConsolidateOptions = { stock?: StockMap };

export function consolidate(menus: SelectedMenu[], requiredPax: number, options: ConsolidateOptions = {}): PurchaseItem[] {
  type Group = {
    key: string;
    name: string;
    family: UnitInfo["family"];
    canonical: string;
    displays: Set<string>;
    sumBase: number;
    numeric: number;
    blanks: string[];
    noUnit: boolean;
    mismatches: Set<string>;
    breakdown: BreakdownEntry[];
  };
  const groups = new Map<string, Group>();

  for (const menu of menus) {
    for (const line of menu.lines) {
      const unit = normaliseUnit(line.unit);
      const key = `${normaliseName(line.name)}|${familyKey(unit)}`;
      let g = groups.get(key);
      if (!g) {
        g = { key, name: line.name.trim().replace(/\s+/g, " "), family: unit.family, canonical: unit.canonical, displays: new Set(), sumBase: 0, numeric: 0, blanks: [], noUnit: false, mismatches: new Set(), breakdown: [] };
        groups.set(key, g);
      }
      const quantity = scaleQuantity(line.baseQuantity, line.basePax, requiredPax);
      if (unit.display) g.displays.add(unit.display);
      if (unit.family === "none") g.noUnit = true;
      let note: string | undefined;
      if (quantity === null) {
        g.blanks.push(menu.label);
        note = "Quantity is blank in the menu — confirm manually";
      } else {
        g.sumBase += quantity * unit.factor;
        g.numeric += 1;
      }
      // cross-check against the menu file's own figure for its reference pax (e.g. its 100-pax column)
      if (line.baseQuantity !== null && line.referenceQuantity != null && line.referencePax && line.referencePax > 0) {
        const expected = (line.baseQuantity / line.basePax) * line.referencePax;
        if (Math.abs(expected - line.referenceQuantity) > 0.01) {
          g.mismatches.add(menu.label);
          note = `The menu file's ${line.referencePax}-pax figure (${line.referenceQuantity}) does not match its ${line.basePax}-pax quantity ×${line.referencePax / line.basePax} (${round3(expected)}). Calculated from the ${line.basePax}-pax quantity.`;
        }
      }
      g.breakdown.push({ menuKey: menu.key, menuLabel: menu.label, baseQuantity: line.baseQuantity, basePax: line.basePax, unit: line.unit?.trim() || null, quantity: quantity === null ? null : round3(quantity), remark: line.remark?.trim() || null, note });
    }
  }

  const items: PurchaseItem[] = [];
  for (const g of groups.values()) {
    // unit of the total: the lines' own unit when they all agree, otherwise the small base unit
    let unit: string | null = null;
    let total: number | null = null;
    const flags: string[] = [];
    if (g.family === "mass" || g.family === "volume") {
      const displays = [...g.displays];
      const baseDisplay = g.family === "mass" ? "GM" : "ML";
      unit = displays.length === 1 ? displays[0] : baseDisplay;
      const factor = normaliseUnit(unit).factor;
      if (g.numeric > 0) total = g.sumBase / factor;
      if (displays.length > 1) flags.push(`Units combined by exact conversion (${displays.join(" + ")} → ${unit})`);
    } else if (g.family === "none") {
      unit = null;
      if (g.numeric > 0) total = g.sumBase;
      flags.push("No unit in the menu data — confirm the unit before buying");
    } else {
      unit = [...g.displays][0] ?? null;
      if (g.numeric > 0) total = g.sumBase;
    }
    if (g.blanks.length > 0) flags.push(`Quantity blank in: ${[...new Set(g.blanks)].join(", ")} — confirm manually (not counted)`);
    if (g.mismatches.size > 0) flags.push(`Menu file figure differs from its own ratio in: ${[...g.mismatches].join(", ")} — check`);

    const calculated = total === null ? null : round3(total);

    // stock: only when a stock record exists in a compatible unit; otherwise "Not Checked" with the full requirement
    let stockStatus: PurchaseItem["stockStatus"] = "not_checked";
    let stockAvailable: number | null = null;
    let need = calculated;
    const stock = options.stock?.get(normaliseName(g.name));
    if (stock && calculated !== null) {
      const stockUnit = normaliseUnit(stock.unit);
      const targetUnit = normaliseUnit(unit);
      if (stockUnit.family === targetUnit.family && (stockUnit.family !== "other" || stockUnit.canonical === targetUnit.canonical)) {
        stockStatus = "checked";
        stockAvailable = round3((stock.quantity * stockUnit.factor) / targetUnit.factor);
        need = round3(Math.max(0, calculated - stockAvailable));
      }
    }

    // purchase suggestion: whole items are rounded up, weights and volumes are kept exact to 2 decimals
    let suggested: number | null = need;
    let roundingNote: string | null = null;
    if (need !== null) {
      const u = normaliseUnit(unit);
      if (WHOLE_UNITS.has(u.canonical) || WHOLE_UNITS.has(u.display)) {
        suggested = Math.ceil(need - 1e-9);
        if (suggested !== need) roundingNote = `Rounded up to whole ${u.display || unit}`;
      } else {
        suggested = Math.round(need * 100) / 100;
      }
    }

    items.push({ key: g.key, name: g.name, unit, calculated, suggested, roundingNote, stockStatus, stockAvailable, flags, breakdown: g.breakdown });
  }

  // possible duplicates that the system will NOT merge by itself: same name in another unit family, or a near-identical spelling
  const byName = new Map<string, PurchaseItem[]>();
  for (const it of items) {
    const n = normaliseName(it.name);
    byName.set(n, [...(byName.get(n) ?? []), it]);
  }
  for (const list of byName.values()) {
    if (list.length > 1) {
      for (const it of list) {
        const others = list.filter((o) => o !== it).map((o) => o.unit || "no unit");
        it.flags.push(`Also needed in another unit (${others.join(", ")}) — not combined; confirm if it is the same item`);
      }
    }
  }
  const names = [...byName.keys()];
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = names[i];
      const b = names[j];
      const similar = squash(a) === squash(b) || (Math.min(a.length, b.length) >= 6 && levenshtein(a, b) === 1);
      if (!similar) continue;
      for (const it of byName.get(a) ?? []) it.flags.push(`Similar name: ${b} — confirm if it is the same item (not combined)`);
      for (const it of byName.get(b) ?? []) it.flags.push(`Similar name: ${a} — confirm if it is the same item (not combined)`);
    }
  }

  return items.sort((x, y) => x.name.localeCompare(y.name) || (x.unit ?? "").localeCompare(y.unit ?? ""));
}

export function formatQty(n: number | null, digits = 2): string {
  if (n === null) return "—";
  return n.toLocaleString("en-MY", { maximumFractionDigits: digits });
}
