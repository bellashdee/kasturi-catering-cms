import type { ValidationCheck } from "./types";

export function toNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const cleaned = v.replace(/rm|myr|\$|\s/gi, "").replace(/,(?=\d{3}(\D|$))/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

const money = (n: number) => n.toFixed(2);
const TOL = 0.011; // one sen
const ROUNDING = 0.05; // Malaysian 5-sen rounding

type Item = Record<string, unknown>;

function itemLabel(item: Item, index: number): string {
  const name = item.item_name ?? item.ingredient_name ?? item.description;
  return typeof name === "string" && name.trim() ? `line ${index + 1} (${name.trim().slice(0, 40)})` : `line ${index + 1}`;
}

/**
 * Re-computes what the document says and compares it with what it says. Nothing is ever changed: a mismatch is reported
 * so a person can look at the original.
 */
export function validateFigures(params: { items: Item[]; stated: { subtotal: unknown; tax: unknown; total: unknown }; amount: unknown }): ValidationCheck[] {
  const checks: ValidationCheck[] = [];
  const { items } = params;

  // 1. quantity × unit price = line total
  let verified = 0;
  items.forEach((it, i) => {
    const q = toNumber(it.quantity);
    const p = toNumber(it.unit_price);
    const t = toNumber(it.line_total);
    if (q === null || p === null || t === null) return;
    verified++;
    const diff = Math.abs(q * p - t);
    if (diff > TOL) {
      checks.push({
        name: `Line total, ${itemLabel(it, i)}`,
        ok: false,
        detail: `${q} × ${money(p)} = ${money(q * p)}, but the document prints ${money(t)} (difference ${money(diff)}).`,
      });
    }
  });
  if (verified > 0 && !checks.some((c) => !c.ok)) {
    checks.push({ name: "Line totals", ok: true, detail: `${verified} line${verified === 1 ? "" : "s"} recalculated: quantity × unit price matches the printed line total.` });
  }

  // 2. sum of lines vs printed subtotal (or total when no subtotal / tax is printed)
  const lineTotals = items.map((it) => toNumber(it.line_total));
  const allLines = items.length > 0 && lineTotals.every((t) => t !== null);
  const sum = allLines ? (lineTotals as number[]).reduce((a, b) => a + b, 0) : null;
  const subtotal = toNumber(params.stated.subtotal);
  const tax = toNumber(params.stated.tax);
  const total = toNumber(params.stated.total);

  if (sum !== null && subtotal !== null) {
    const diff = Math.abs(sum - subtotal);
    checks.push({
      name: "Lines add up to subtotal",
      ok: diff <= ROUNDING,
      detail: diff <= TOL ? `Lines add up to ${money(sum)}, matching the printed subtotal.` : `Lines add up to ${money(sum)}, but the printed subtotal is ${money(subtotal)} (difference ${money(diff)}${diff <= ROUNDING ? ", possibly rounding" : ""}).`,
    });
  } else if (sum !== null && subtotal === null && total !== null && tax === null) {
    const diff = Math.abs(sum - total);
    checks.push({
      name: "Lines add up to total",
      ok: diff <= ROUNDING,
      detail: diff <= TOL ? `Lines add up to ${money(sum)}, matching the printed total.` : `Lines add up to ${money(sum)}, but the printed total is ${money(total)} (difference ${money(diff)}${diff <= ROUNDING ? ", possibly rounding" : ""}).`,
    });
  }

  // 3. subtotal + tax = total
  if (subtotal !== null && tax !== null && total !== null) {
    const diff = Math.abs(subtotal + tax - total);
    checks.push({
      name: "Subtotal + tax = total",
      ok: diff <= ROUNDING,
      detail: diff <= TOL ? `${money(subtotal)} + ${money(tax)} = ${money(total)} as printed.` : `${money(subtotal)} + ${money(tax)} = ${money(subtotal + tax)}, but the printed total is ${money(total)} (difference ${money(diff)}${diff <= ROUNDING ? ", possibly rounding" : ""}).`,
    });
  }

  // 4. the extracted amount vs the printed total
  const amount = toNumber(params.amount);
  if (amount !== null && total !== null && amount !== total) {
    const diff = Math.abs(amount - total);
    // An "amount before tax" legitimately differs from the total by the tax.
    const isPreTax = tax !== null && Math.abs(amount + tax - total) <= ROUNDING;
    if (!isPreTax) {
      checks.push({ name: "Amount vs printed total", ok: diff <= ROUNDING, detail: `The extracted amount is ${money(amount)} but the document's printed total is ${money(total)}.` });
    }
  }

  return checks;
}
