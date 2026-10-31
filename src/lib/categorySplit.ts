/**
 * Splitting one amount between the categories it was spent on (and, for a staff claim, between the companies too). Each category is
 * saved as its own record with its own amount, so every report that adds up by category stays right.
 */

export type CategoryShare = { category: string; amount: number };

/** The categories chosen for a record: the comma separated text of a petty cash record, or a list. Empty and repeated ones are dropped. */
export function chosenCategories(list: string[]): string[] {
  return Array.from(new Set(list.map((c) => c.trim()).filter(Boolean)));
}

/** The cell of a split: one category (empty when no category is split) of one company (empty when there is one company). */
export const cellKey = (category: string, companyId = "") => `${companyId}|${category}`;

/** A total shared equally between n parts, in sen: the sen that are left go to the first parts. */
export function equalShares(total: number, n: number): number[] {
  const cents = Math.round(Number(total) * 100);
  if (!Number.isFinite(cents) || cents <= 0 || n <= 0) return Array.from({ length: Math.max(n, 0) }, () => 0);
  const base = Math.floor(cents / n);
  const extra = cents - base * n;
  return Array.from({ length: n }, (_, i) => (base + (i < extra ? 1 : 0)) / 100);
}

export type SplitCell = { key: string; category: string; companyId: string; text: string; amount: number };

/**
 * Every cell of a split (each category, and each company when there are several), with the amount typed for it. The cells nothing was
 * typed in share what is left of the total equally: total RM 100, RM 35 typed in the first, the second shows RM 65 by itself.
 */
export function splitCells(total: string, categories: string[], companyIds: string[], typed: Record<string, string>): SplitCell[] {
  const cats = categories.length > 0 ? categories : [""];
  const cos = companyIds.length > 0 ? companyIds : [""];
  const keys = cats.flatMap((category) => cos.map((companyId) => ({ key: cellKey(category, companyId), category, companyId })));
  const isTyped = (key: string) => typed[key] !== undefined && typed[key].trim() !== "";
  const typedCents = keys.filter((k) => isTyped(k.key)).reduce((t, k) => t + Math.round(Number(typed[k.key] || 0) * 100), 0);
  const leftCents = Math.round(Number(total || 0) * 100) - typedCents;
  const open = keys.filter((k) => !isTyped(k.key));
  const shares = equalShares(Math.max(leftCents, 0) / 100, open.length);
  return keys.map((k) => {
    const share = shares[open.indexOf(k)];
    const text = isTyped(k.key) ? typed[k.key] : share ? share.toFixed(2) : "";
    return { ...k, text, amount: Math.round(Number(text || 0) * 100) / 100 };
  });
}

/** The cells add up to the total (to the sen). */
export const splitAddsUp = (total: string | number, cells: { amount: number }[]) =>
  cells.reduce((t, c) => t + Math.round(c.amount * 100), 0) === Math.round(Number(total || 0) * 100);

/** Checked on the server: at least two parts, each more than 0, each category only once, together the whole amount. */
export function checkCategoryShares(total: number, shares: CategoryShare[] | undefined): CategoryShare[] | null {
  if (!shares || shares.length < 2) return null;
  const clean = shares.map((s) => ({ category: s.category?.trim() ?? "", amount: Math.round(Number(s.amount) * 100) / 100 }));
  if (clean.some((s) => !s.category)) throw new Error("Choose the category of each part of the amount.");
  if (new Set(clean.map((s) => s.category.toUpperCase())).size !== clean.length) throw new Error("Each category can only be chosen once.");
  if (clean.some((s) => !Number.isFinite(s.amount) || s.amount <= 0)) throw new Error("Enter an amount more than 0 for each category.");
  if (!splitAddsUp(total, clean)) throw new Error("The amounts of the categories must add up to the total amount.");
  return clean;
}
