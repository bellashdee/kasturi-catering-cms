/**
 * The two sides of the kitchen: the kitchen (food) and the bar (drinks). It is worked out from the name of the menu item or recipe
 * (and the section it is listed under, such as "BEVERAGE"), so it needs no extra data.
 */
export type KitchenSide = "kitchen" | "bar";

export const SIDE_LABEL: Record<KitchenSide, string> = { kitchen: "Kitchen", bar: "Bar" };

const BAR_WORDS = new Set([
  "AIR", "TEH", "TEA", "KOPI", "COFFEE", "JUICE", "JUS", "SIRAP", "SYRUP", "MILO", "KORDIAL", "CORDIAL", "SUSU", "SODA", "MOCKTAIL", "SMOOTHIE",
  "MINUMAN", "BEVERAGE", "BEVERAGES", "DRINK", "DRINKS", "LATTE", "CAPPUCCINO", "ESPRESSO", "NESCAFE", "HORLICKS", "LEMONADE", "ICED", "MINERAL",
]);
const FOOD_FIRST_WORDS = new Set(["AYAM", "DAGING", "KAMBING", "IKAN", "NASI", "SAYUR", "TELUR", "UDANG", "SOTONG", "MEE", "BEE", "KUIH", "ROTI", "SUP", "BUBUR", "PARU"]);

const tokens = (s: string) => s.toUpperCase().replace(/[^A-Z]+/g, " ").split(" ").filter(Boolean);

/** The section label of a menu line ("BEVERAGE", "MAIN DISH" ...) decides first; otherwise the words of the item. */
export function sideOf(name: string, section?: string | null): KitchenSide {
  if (section && tokens(section).some((t) => BAR_WORDS.has(t))) return "bar";
  const t = tokens(name);
  if (t.length === 0) return "kitchen";
  if (FOOD_FIRST_WORDS.has(t[0])) return "kitchen";
  return t.some((w) => BAR_WORDS.has(w)) ? "bar" : "kitchen";
}

export type MenuChoice = { section: string | null; name: string };

/** "MAIN DISH: Mee Goreng / Nasi Goreng" becomes the section "MAIN DISH" with two choices; a line without a label is one choice. */
export function menuChoices(line: string): MenuChoice[] {
  const m = line.match(/^\s*([A-Za-z][A-Za-z &]{1,30}?)\s*:\s*(.+)$/);
  const section = m ? m[1].trim() : null;
  const rest = (m ? m[2] : line).trim();
  return rest
    .split(/\s+\/\s+|\s*\|\s*/)
    .map((c) => c.trim())
    .filter(Boolean)
    .map((name) => ({ section, name }));
}
