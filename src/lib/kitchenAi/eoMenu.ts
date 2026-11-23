/**
 * Reads the menu of an Event Order (EO) from plain text: the menu saved on the event (copied from the invoice) or the text of an
 * uploaded Word / PDF file. The result is only a first reading: the person sees every dish and pax and can change them before any
 * ingredient is worked out. No quantity is guessed here.
 */

export type EoSession = { name: string; pax: number | null; dishes: string[] };

const num = (s: string) => Number(s.replace(/,/g, ""));

/** "• 1    MENU UTAMA — 400 × RM 18.00 = RM 7,200.00" (invoice style: a group of dishes with its pax) */
const GROUP_PRICED = /^(?:\d+[.)]?\s+)?(.*?)\s*[—–-]\s+([\d,]+)\s*[×x]\s*RM\s*[\d.,]+/i;
/** "• 30 — 15.00 (RM 450.00)" (an extra line of the same invoice item: another pax with another price) */
const GROUP_EXTRA = /^([\d,]+)\s*[—–-]\s*[\d.,]+\s*\(RM\s*[\d.,]+\)/i;

/** Lines that are not food: charges, equipment, staff, notes, totals. */
const NOT_FOOD = /^((?:event|nama|tarikh|date|venue|lokasi|location|masa|time|customer|pelanggan|pic|contact|tel|phone|alamat|address|jumlah|bil)\s*[:：]|(?:jumlah\s+)?pax\b|invois\b|summary\b|total\b|notes?\b|note\b|additional|addidtional|addtional|miscellaneous|caj penghantaran|\d+\s*miscellaneous|transport|equipment|staff|staffing|delivery|dome\s*set\b|plastik|buffet table|long table|round table|air cooler|small order|pramusaji|\d+\.\s+[a-z\- ]+:\s*\d+)/i;
/** A group whose name says it is a charge: its lines are never dishes. */
const CHARGE_GROUP = /(additional|addidtional|addtional|miscellaneous|caj penghantaran|transport|equipment|staff)/i;

const TIME_ONLY = /^\(?\s*\d{1,2}([.:]\d{2})?\s*(am|pm)?(\s*[-–]\s*\d{1,2}([.:]\d{2})?\s*(am|pm)?)?\s*\)?$/i;

/** A heading is written in capitals (BREAKFAST, SOUP, MAIN DISH, SANTAPAN PENGANTIN (2 ORANG)) or is only a time. */
function isHeading(line: string): boolean {
  if (TIME_ONLY.test(line)) return true;
  const letters = line.replace(/[^A-Za-z]/g, "");
  if (letters.length < 2) return false;
  return letters === letters.toUpperCase();
}

function cleanDish(raw: string): string {
  return raw
    .replace(/^[•\-–*]+\s*/, "")
    .replace(/^\d+[.)]\s+/, "")
    .replace(/\s*\(\s*\d+\s*pax\s*\)/gi, "")
    .replace(/\s+\d{1,3}\s*%/g, "")
    .replace(/\s*\(\s*(not too sweet|less sweet|separate sauce|tak pedas|make sure[^)]*)\)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupe(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const d of list) {
    const k = d.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(d);
  }
  return out;
}

/** The pax written somewhere in free text ("200 pax", "Pax: 200", "Jumlah pax 200"). */
export function findPax(text: string): number | null {
  const m = text.match(/(\d[\d,]*)\s*(?:pax|orang|pax\.)/i) ?? text.match(/\bpax\s*[:=\-]?\s*(\d[\d,]*)/i);
  if (!m) return null;
  const n = num(m[1]);
  return n > 0 && n < 100000 ? n : null;
}

/**
 * Splits an Event Order text into sessions (a group of dishes with its pax). Invoice-style text gives one session per priced group;
 * any other text gives one session holding every dish found, with the pax found in the text (or `fallbackPax`).
 */
export function parseEoText(text: string | null | undefined, opts: { fallbackPax?: number | null } = {}): EoSession[] {
  if (!text || !text.trim()) return [];
  const lines = text
    .split(/\r?\n|\t|\|/)
    .map((l) => l.replace(/ /g, " ").trim())
    .filter(Boolean);

  type Group = EoSession & { charge: boolean; needsName: boolean };
  const sessions: Group[] = [];
  let cur = null as Group | null;
  let base = "Menu";
  let afterNote = false;

  const start = (name: string, pax: number | null, needsName = false) => {
    if (!needsName) base = name || "Menu";
    cur = { name: name || "Menu", pax, dishes: [], charge: CHARGE_GROUP.test(name), needsName };
    sessions.push(cur);
    afterNote = false;
  };

  for (const original of lines) {
    const line = original.replace(/^[••]\s*/, "").trim();
    if (!line) continue;

    const priced = line.match(GROUP_PRICED);
    if (priced && !/^\d+\s*[×x]/.test(line)) {
      start(cleanDish(priced[1]), num(priced[2]));
      continue;
    }
    const extra = line.match(GROUP_EXTRA);
    if (extra) {
      start(base, num(extra[1]), true);
      continue;
    }
    if (/^invois\b/i.test(line)) continue;
    // a remark in brackets on a line of its own ("(with sugar & creamer in sachets)") is not a dish
    if (/^\(.*\)$/.test(line)) continue;
    if (/^notes?\b/i.test(line)) {
      afterNote = true;
      continue;
    }
    if (isHeading(line)) {
      afterNote = false;
      const open = cur as Group | null;
      if (open && open.needsName && open.dishes.length === 0 && !TIME_ONLY.test(line)) {
        open.name = `${base} · ${line}`;
        open.needsName = false;
        open.charge = CHARGE_GROUP.test(line);
      }
      continue;
    }
    if (NOT_FOOD.test(line)) {
      continue;
    }
    // the second line of a note ("food during ...") starts with a small letter or a number
    if (afterNote && /^[a-z0-9]/.test(line)) continue;
    afterNote = false;
    if (!cur) start("Menu", null);
    const group = cur as Group;
    if (group.charge) continue;
    // a dish written over two lines: "Fish Fillet with Blackpepper Sauce (please ensure not to put too much of" + "capsicum)"
    const prev = group.dishes[group.dishes.length - 1];
    if (prev && (prev.match(/\(/g) ?? []).length > (prev.match(/\)/g) ?? []).length) {
      group.dishes[group.dishes.length - 1] = `${prev} ${line}`;
      continue;
    }
    const dish = cleanDish(line);
    if (dish.length >= 3 && dish.length <= 90 && /[A-Za-z]{3}/.test(dish) && !/^rm\s*\d/i.test(dish)) group.dishes.push(dish);
  }

  // a priced line with no dishes under it is itself a dish ("Laksa Johor with Condiments — 200 × RM 4.00")
  const SERVICE = /^(menu|buffet|pack|packed|food|dome|set|live|station|takeaway|main|pre|plated|vip|coffee|break|breakfast|lunch|dinner|supper|hi|tea|hotfood|wedding|reception|\d+|·|-|l)$/i;
  for (const s of sessions) {
    if (s.dishes.length > 0 || s.charge || s.needsName) continue;
    const words = s.name.replace(/\d{1,2}\/\d{1,2}\/\d{2,4}/g, " ").split(/[^A-Za-z0-9]+/).filter(Boolean);
    if (words.some((w) => !SERVICE.test(w)) && !NOT_FOOD.test(s.name)) s.dishes.push(cleanDish(s.name));
  }

  const result: EoSession[] = sessions
    .map((s) => ({ name: s.name, pax: s.pax, dishes: dedupe(s.dishes) }))
    .filter((s) => s.dishes.length > 0);

  // plain text with no priced group: one session, the pax from the text or the event
  const pricedAny = sessions.some((s) => s.pax !== null);
  if (!pricedAny && result.length > 0) {
    const pax = findPax(text) ?? opts.fallbackPax ?? null;
    return [{ name: "Menu", pax, dishes: dedupe(result.flatMap((s) => s.dishes)) }];
  }
  return result.map((s) => ({ ...s, pax: s.pax ?? opts.fallbackPax ?? null }));
}
