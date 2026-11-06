/**
 * The summary printed under a petty cash or claims list: the money out in total and for each company. A record kept for several
 * companies without splitting the amount is counted once, under its first company (as in Monthly Costing and the reports).
 */

export type SummaryLine = { label: string; value: string; bold?: boolean };

const rm = (n: number) => `RM ${(Math.round((n + Number.EPSILON) * 100) / 100).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The money out of each company (every company that has a record in the list), in the order of the companies. */
export function spentByCompany(rows: { companyId: string; amount: number }[], companies: { id: string; name: string }[]): { name: string; amount: number }[] {
  return companies
    .filter((c) => rows.some((r) => r.companyId === c.id))
    .map((c) => ({ name: c.name, amount: rows.filter((r) => r.companyId === c.id).reduce((t, r) => t + r.amount, 0) }));
}

/** Lines for the print / Excel summary: what came first (e.g. money received), the total spent, then the spending of each company. */
export function spendSummary(
  spent: { companyId: string; amount: number }[],
  companies: { id: string; name: string }[],
  { before = [], totalLabel = "Total spent (money out)", after = [] }: { before?: SummaryLine[]; totalLabel?: string; after?: SummaryLine[] } = {},
): SummaryLine[] {
  const total = spent.reduce((t, r) => t + r.amount, 0);
  return [
    ...before,
    { label: totalLabel, value: rm(total), bold: true },
    ...spentByCompany(spent, companies).map((c) => ({ label: `  Spent by ${c.name}`, value: rm(c.amount) })),
    ...after,
  ];
}

export const formatRm = rm;
