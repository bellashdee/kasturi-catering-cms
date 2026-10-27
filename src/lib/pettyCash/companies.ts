/**
 * An entry can be for more than one company (keyed in once, counted once). company_id stays the main company; the others are kept
 * in shared_company_ids. The main company stays the same while it is still chosen, otherwise the first chosen one becomes the main.
 */
export function splitCompanies(chosen: string[], currentMain?: string): { companyId: string; alsoCompanyIds: string[] } {
  const main = currentMain && chosen.includes(currentMain) ? currentMain : (chosen[0] ?? currentMain ?? "");
  return { companyId: main, alsoCompanyIds: chosen.filter((id) => id !== main) };
}
