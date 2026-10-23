/**
 * Matching a dish name (as written on a menu) to the company's recipes. A match is a suggestion: the person sees it and can
 * change it before any quantity is calculated, so a wrong guess never reaches the purchase list silently.
 */

const STOP = new Set(["DAN", "DENGAN", "SERTA", "AND", "WITH", "THE", "OF", "A", "AN", "SET", "MENU", "PCS", "PC", "NOS"]);

/** English ↔ Malay words for the most common dish words, so "Fried Chicken" can find "AYAM GORENG". */
const SYNONYM: Record<string, string> = {
  RICE: "NASI", CHICKEN: "AYAM", BEEF: "DAGING", MUTTON: "KAMBING", LAMB: "KAMBING", FISH: "IKAN", PRAWN: "UDANG", PRAWNS: "UDANG", SHRIMP: "UDANG",
  EGG: "TELUR", EGGS: "TELUR", VEGETABLE: "SAYUR", VEGETABLES: "SAYUR", VEGGIES: "SAYUR", SOUP: "SUP", CURRY: "KARI", FRIED: "GORENG", WHITE: "PUTIH",
  MIXED: "CAMPUR", NOODLE: "MEE", NOODLES: "MEE", SQUID: "SOTONG", CRAB: "KETAM", DESSERT: "PENCUCI", SAMBAL: "SAMBAL", ROAST: "BAKAR", GRILLED: "BAKAR",
  COCONUT: "KELAPA", POTATO: "KENTANG", POTATOES: "KENTANG", TOFU: "TAUHU", BEANS: "KACANG", SPICY: "PEDAS", SWEET: "MANIS", SOUR: "MASAM",
};

export function tokens(name: string): string[] {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t && !STOP.has(t))
    .map((t) => SYNONYM[t] ?? t);
}

function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return prev[b.length];
}

/** Two words are the same word when they differ by at most one letter (words of 5-6 letters) or two letters (7 or more). Short words must match exactly. */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  const len = Math.min(a.length, b.length);
  if (len < 5 || /\d/.test(a + b)) return false;
  return editDistance(a, b) <= (len >= 7 ? 2 : 1);
}

/** 0..1: how well two dish names agree (same words in any order; a name inside a longer one counts, a little less). */
export function similarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.length === 0 || tb.length === 0) return 0;
  const sa = new Set(ta);
  const sb = new Set(tb);
  // the same word, or the same word spelt a little differently ("BRIYANI" / "BERIANI", "DALCA" / "DALCHA")
  const free = new Set(sb);
  let shared = 0;
  for (const t of sa) {
    const hit = free.has(t) ? t : [...free].find((u) => sameWord(t, u));
    if (hit === undefined) continue;
    free.delete(hit);
    shared++;
  }
  if (shared === 0) return 0;
  const jaccard = shared / (sa.size + sb.size - shared);
  // a short name inside a longer one is only a strong hint when it has at least two words ("RICE" must not pick "NASI BIRYANI")
  const containment = (shared / Math.min(sa.size, sb.size)) * (Math.min(sa.size, sb.size) >= 2 ? 0.9 : 0.6);
  return Math.max(jaccard, containment);
}

export type RecipeRef = { id: string; name: string; hasIngredients: boolean };
export type Candidate = { recipeId: string; name: string; score: number };

/** A match this good is chosen automatically (and shown for review); below it the recipes are only suggestions. */
export const AUTO_MATCH = 0.85;
export const SUGGEST_MATCH = 0.5;

export function candidatesFor(dish: string, recipes: RecipeRef[], limit = 4): Candidate[] {
  return recipes
    .map((r) => ({ recipeId: r.id, name: r.name, score: similarity(dish, r.name) - (r.hasIngredients ? 0 : 0.2) }))
    .filter((c) => c.score >= SUGGEST_MATCH - 0.2)
    .sort((x, y) => y.score - x.score || x.name.localeCompare(y.name))
    .slice(0, limit)
    .map((c) => ({ ...c, score: Math.round(Math.max(0, c.score) * 100) / 100 }));
}

/** The recipe to use automatically, or null when no recipe is clearly the same dish. A recipe without ingredients is never chosen. */
export function autoMatch(dish: string, recipes: RecipeRef[]): Candidate | null {
  const [best, second] = candidatesFor(dish, recipes.filter((r) => r.hasIngredients), 2);
  if (!best || best.score < AUTO_MATCH) return null;
  // two recipes that fit equally well: the person decides
  if (second && best.score < 1 && second.score >= best.score - 0.05) return null;
  return best;
}

/** The dish in a list that a free-text phrase ("the soup", "chicken curry") refers to; null when it is not clear. */
export function findByPhrase<T extends { name: string }>(phrase: string, list: T[]): T | null {
  const scored = list.map((x) => ({ x, s: similarity(phrase, x.name) })).filter((c) => c.s > 0).sort((a, b) => b.s - a.s);
  if (scored.length === 0) return null;
  if (scored.length > 1 && scored[0].s - scored[1].s < 0.05 && scored[0].s < 1) return null;
  return scored[0].x;
}
