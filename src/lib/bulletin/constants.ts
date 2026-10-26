export const BULLETIN_CATEGORIES = ["company", "work", "event", "hr", "holiday", "safety", "general"] as const;
export type BulletinCategory = (typeof BULLETIN_CATEGORIES)[number];

export const BULLETIN_CATEGORY_LABEL: Record<BulletinCategory, string> = {
  company: "Company news",
  work: "Work / Operations",
  event: "Event",
  hr: "HR / Staff",
  holiday: "Holiday / Leave",
  safety: "Safety & Reminder",
  general: "General",
};

export const BULLETIN_CATEGORY_TONE: Record<BulletinCategory, "info" | "success" | "warning" | "danger" | "neutral"> = {
  company: "info",
  work: "neutral",
  event: "success",
  hr: "info",
  holiday: "success",
  safety: "danger",
  general: "neutral",
};

/** Super Admins and Company Admins post to the bulletin board (local staff too, see user_is_local_staff); everybody reads it. */
export function canPostBulletin(role: string): boolean {
  return role === "super_admin" || role === "company_admin";
}
