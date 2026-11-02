/**
 * Which modules a person sees in the side bar, from the position on their staff record. My Profile, Main Dashboard, Priority Centre,
 * Bulletin Board, Company Spending (My Claims), Claim OT (inside HR) and the AI Assistant are for everybody and are not part of this.
 * Reports are only for the Directors and for the Super Admins (who always see everything).
 *
 *   null      = every module
 *   string[]  = only these modules
 *   undefined = no rule for this position: the access stays as it is
 */
export type PositionModules = string[] | null | undefined;

const HR = "hr";

const RULES: { test: RegExp; modules: string[] | null }[] = [
  // management
  { test: /^(MANAGING |EXECUTIVE |DEPUTY )?DIRECTOR( OF [A-Z &]+)?$/, modules: null },
  // the Directors' personal assistant works with the office: admin and finance
  { test: /DIRECTOR'?S? PERSONAL ASSISTANT|ADMIN & ACCOUNT|ASSISTANT ADMINISTRATIVE|ADMINISTRATIVE/, modules: ["catering", "kitchen", "supplier-procurement", "driver-logistics", "finance-admin", HR] },
  // operations
  { test: /OPERATIONS MANAGER|FOOD LOGISTIC/, modules: ["catering", "kitchen", "supplier-procurement", "driver-logistics", HR] },
  // service and outlet
  { test: /HEAD OF SERVICE|SERVICE SUPERVISOR|OUTLET INCHARGE|OUTLET IN-CHARGE/, modules: ["catering", "driver-logistics", HR] },
  // sales and marketing
  { test: /SALES|MARCOM|MARKETING|CREATIVE CONTENT/, modules: ["catering", HR] },
  // the kitchen: the head chefs also see the events they cook for and Operation Management (no Admin & Finance, no Reports)
  { test: /HEAD CHEF/, modules: ["catering", "kitchen", "supplier-procurement", "driver-logistics", HR] },
  { test: /CHEF|COOK|BUTCHER|KOKI/, modules: ["kitchen", "supplier-procurement", HR] },
  { test: /KITCHEN HELPER|BARTENDER/, modules: ["kitchen", HR] },
  // drivers keep their own HR (leave, OT claim) only
  { test: /DRIVER/, modules: [HR] },
];

/** The modules for one position (see PositionModules). */
export function modulesForPosition(position: string | null | undefined): PositionModules {
  const p = (position ?? "").toUpperCase().replace(/\s+/g, " ").trim();
  if (!p) return undefined;
  return RULES.find((r) => r.test.test(p))?.modules;
}

/** A person with several staff records (one for each company) gets what the most generous position allows. */
export function modulesForPositions(positions: (string | null | undefined)[]): PositionModules {
  const found = positions.map(modulesForPosition).filter((m) => m !== undefined) as (string[] | null)[];
  if (found.length === 0) return undefined;
  if (found.some((m) => m === null)) return null;
  return Array.from(new Set(found.flat() as string[])).sort();
}
