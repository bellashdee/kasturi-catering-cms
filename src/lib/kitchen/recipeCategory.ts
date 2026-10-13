/**
 * Recipe categories, in the same order as the kitchen's LIST RESEPI (Ayam, Daging, Kambing, Ikan & Seafood, Sayur, Nasi, Telur).
 * The category is worked out from the recipe name, so it needs no extra data; recipes that fit none of them go under "Lain-lain".
 */
export const RECIPE_CATEGORIES = [
  { key: "ayam", label: "Ayam" },
  { key: "daging", label: "Daging" },
  { key: "kambing", label: "Kambing" },
  { key: "seafood", label: "Ikan & Seafood" },
  { key: "sayur", label: "Sayur" },
  { key: "nasi", label: "Nasi" },
  { key: "telur", label: "Telur" },
  { key: "lain", label: "Lain-lain" },
] as const;

export type RecipeCategoryKey = (typeof RECIPE_CATEGORIES)[number]["key"];

export const RECIPE_CATEGORY_LABEL: Record<string, string> = Object.fromEntries(RECIPE_CATEGORIES.map((c) => [c.key, c.label]));

const has = (name: string, words: string[]) => words.some((w) => new RegExp(`(^|[^A-Z])${w}([^A-Z]|$)`).test(name));

export function recipeCategory(rawName: string): RecipeCategoryKey {
  const name = rawName.trim().toUpperCase();
  if (/^NASI\b/.test(name) || has(name, ["RICE"])) return "nasi";
  if (/^TELUR\b/.test(name)) return "telur";
  if (/^AYAM\b/.test(name) || /^SUP AYAM\b/.test(name) || has(name, ["CHICKEN"])) return "ayam";
  if (/^DAGING\b/.test(name) || /^PARU\b/.test(name) || /^SUP DAGING\b/.test(name)) return "daging";
  if (has(name, ["KAMBING", "LAMB", "MUTTON"])) return "kambing";
  if (has(name, ["IKAN", "UDANG", "KETAM", "SOTONG", "FISH"])) return "seafood";
  if (has(name, ["KOBIS", "SAYUR", "SAWI", "ACAR", "PACERI", "NENAS", "VEGETABLE", "DALCHA", "SERUNDING", "PENCUK", "LEMAK LABU"])) return "sayur";
  return "lain";
}
