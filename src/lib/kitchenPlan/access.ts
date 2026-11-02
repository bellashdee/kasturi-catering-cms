import type { SessionContext } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/** Positions that may plan the cooking: any chef or cook, a sous chef, or the kitchen PIC / head / supervisor. */
const PLANNER_POSITION = /\b(CHEF|COOK|SOUS|KOKI|PIC)\b|KITCHEN\s+(HEAD|MANAGER|SUPERVISOR|PIC)/i;

export type KitchenPlanAccess = {
  position: string | null;
  /** may choose the menu and generate the plan */
  canPlan: boolean;
  /** may also change the plan: edit, delete, add a dish, make it again (Kitchen PIC, managers, admins) */
  canManage: boolean;
};

/**
 * What a person may do in the Cooking Plan, from the role and the position on their staff record.
 *  - Kitchen helper and any other position (or no staff record): follows the plan, starts and completes tasks, and asks for help.
 *  - Chef / cook / sous chef / kitchen PIC position: also chooses the menu and generates the plan.
 *  - Manager and admin roles: everything, including changing the plan.
 * The staff record is read by login id with the server key, so a person's own position is found whatever the HR screens allow.
 */
export async function kitchenPlanAccess(session: SessionContext): Promise<KitchenPlanAccess> {
  const canManage = session.role !== "staff";
  let position: string | null = null;
  try {
    const { data } = await createAdminClient().from("employees").select("position").eq("user_id", session.userId).eq("status", "active");
    const positions = (data ?? []).map((r) => r.position).filter((p): p is string => !!p);
    position = positions.find((p) => PLANNER_POSITION.test(p)) ?? positions[0] ?? null;
  } catch {
    // the position could not be read: the person keeps the plain staff access (follow the plan) unless the role allows more
  }
  return { position, canManage, canPlan: canManage || (position !== null && PLANNER_POSITION.test(position)) };
}
