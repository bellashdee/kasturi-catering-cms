/**
 * The cooking plan: which dish is started first, by which cook, and when it is finished. Plain arithmetic, no AI, so the same
 * menu always gives the same plan. The times a dish takes are ESTIMATES (kept by dish type) that the Kitchen PIC can change.
 */

/** Minutes a dish usually takes, by the words in its name. The first rule that matches is used; every value is an estimate. */
const DURATION_RULES: { words: string[]; minutes: number }[] = [
  { words: ["RENDANG", "KORMA", "KURMA", "KAPITAN", "SEMUR", "DALCA", "DALCHA"], minutes: 180 },
  { words: ["NASI", "RICE", "BRIYANI", "BIRYANI", "BERIANI", "MEE", "BIHUN", "KUETIAW", "MACARONI", "SPAGHETTI", "PASTA"], minutes: 60 },
  { words: ["KARI", "CURRY", "MASAK MERAH", "ASAM PEDAS", "GULAI", "MASAK LEMAK", "KICAP", "MASAK HITAM", "PAJERI"], minutes: 120 },
  { words: ["SUP", "SOUP", "SOTO", "BAKSO", "BUBUR", "LAKSA", "KALDU"], minutes: 90 },
  { words: ["BAKAR", "PANGGANG", "GRILL", "ROAST", "PERCIK", "BAKED"], minutes: 75 },
  { words: ["GORENG", "FRIED", "CRISPY", "GORENG TEPUNG", "KERISPY", "CRISP"], minutes: 45 },
  { words: ["SAMBAL", "SAMBAL TUMIS", "TUMIS", "MASAK"], minutes: 60 },
  { words: ["SAYUR", "KAILAN", "KOBIS", "TAUGE", "ACAR", "SALAD", "KERABU", "ULAM", "PAJERI NANAS", "VEGETABLE"], minutes: 30 },
  { words: ["KUIH", "KEK", "CAKE", "PUDING", "PUDDING", "PENCUCI", "DESSERT", "AGAR", "CENDOL", "BUAH", "FRUIT", "AIR", "DRINK", "TEH", "KOPI", "SIRAP", "JUICE"], minutes: 30 },
];
export const DEFAULT_DISH_MINUTES = 60;

/** Estimated minutes for a dish named on the menu (always an estimate: the person is asked to confirm it). */
export function estimateMinutes(dish: string): number {
  const name = ` ${dish.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim()} `;
  for (const rule of DURATION_RULES) if (rule.words.some((w) => name.includes(` ${w} `))) return rule.minutes;
  return DEFAULT_DISH_MINUTES;
}

export type PlanDishInput = { name: string; minutes: number };
export type PlannedTask = { name: string; minutes: number; cook: number; startMs: number; endMs: number };

/**
 * Every dish must be ready at `readyMs`. The dishes are shared between the cooks so that each cook has about the same work
 * (the longest dish first); inside one cook's list the longest dish starts first and the shortest is finished last, at the
 * time the food is due. A cook never does two dishes at the same time, and a cook who is free is never given less than one dish
 * when there are enough dishes.
 */
export function buildSchedule(dishes: PlanDishInput[], cooks: number, readyMs: number): PlannedTask[] {
  const n = Math.max(1, Math.min(cooks, dishes.length || 1));
  const lanes: { total: number; items: PlanDishInput[] }[] = Array.from({ length: n }, () => ({ total: 0, items: [] }));
  const byLength = dishes.map((d, i) => ({ d, i })).sort((a, b) => b.d.minutes - a.d.minutes || a.i - b.i);
  for (const { d } of byLength) {
    const lane = lanes.reduce((best, l) => (l.total < best.total ? l : best), lanes[0]);
    lane.items.push(d);
    lane.total += d.minutes;
  }
  const out: PlannedTask[] = [];
  lanes.forEach((lane, cook) => {
    // longest first in time: the last item of the lane (the shortest) ends at the due time
    let end = readyMs;
    for (const d of [...lane.items].reverse()) {
      const start = end - d.minutes * 60_000;
      out.push({ name: d.name, minutes: d.minutes, cook, startMs: start, endMs: end });
      end = start;
    }
  });
  return out.sort((a, b) => a.startMs - b.startMs || b.minutes - a.minutes || a.cook - b.cook);
}

/** "2026-11-04" + "06:00" in Malaysia time as a moment in time. */
export function myMoment(date: string, hhmm: string): number {
  return new Date(`${date}T${hhmm.slice(0, 5)}:00+08:00`).getTime();
}

const KL = "Asia/Kuala_Lumpur";
/** "7:00 AM" in Malaysia time. */
export function clockText(ms: number | string): string {
  return new Intl.DateTimeFormat("en-MY", { timeZone: KL, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(ms)).replace(/\s/g, " ").toUpperCase();
}
/** "Wed, 4 Nov" in Malaysia time. */
export function dayText(ms: number | string): string {
  return new Intl.DateTimeFormat("en-MY", { timeZone: KL, weekday: "short", day: "numeric", month: "short" }).format(new Date(ms));
}
/** "3 hours" / "1 hour 30 min" / "45 min". */
export function lengthText(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return `${h} hour${h === 1 ? "" : "s"}${m ? ` ${m} min` : ""}`;
}
