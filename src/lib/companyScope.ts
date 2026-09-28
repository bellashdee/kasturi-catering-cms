import type { SessionContext } from "@/lib/auth";

/**
 * Turns "?company=<id|undefined>" plus the signed-in user's grants into the
 * actual list of company ids a query should filter by. Shared by every
 * module page so "All Companies" vs one company behaves identically
 * everywhere.
 */
export function resolveCompanyScope(
  session: SessionContext,
  allCompanies: { id: string }[],
  requestedId: string | undefined,
) {
  const accessibleIds = session.hasAllCompaniesAccess
    ? allCompanies.map((c) => c.id)
    : session.companyIds.filter((id) => allCompanies.some((c) => c.id === id));

  const targetCompanyIds =
    requestedId && accessibleIds.includes(requestedId) ? [requestedId] : accessibleIds;

  return { accessibleIds, targetCompanyIds };
}
