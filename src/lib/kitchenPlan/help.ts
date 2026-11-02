import { clockText, lengthText } from "./schedule";
import { similarity } from "@/lib/kitchenAi/match";

export type HelpLang = "en" | "ms";

export type HelpTask = {
  dish: string;
  startMs: number;
  endMs: number;
  minutes: number;
  assignedTo: string;
  status: "not_started" | "in_progress" | "completed";
  pax: number;
  /** the steps saved in the dish's recipe; empty when there is none */
  steps: string[];
  /** the dish's ingredients for this pax from its recipe; null when there is none */
  ingredients: { name: string; quantity: number; unit: string | null }[] | null;
};
export type HelpContext = { eventName: string; pax: number; readyMs: number; tasks: HelpTask[]; me: string };

export const QUICK_QUESTIONS: Record<HelpLang, string[]> = {
  ms: ["Apa tugas saya sekarang?", "Apa perlu buat dahulu?", "Kenapa lauk ini perlu dimasak dahulu?", "Berapa banyak bawang diperlukan?", "Macam mana nak masak lauk ini?", "Kalau makanan lambat siap, apa perlu buat?"],
  en: ["What is my task now?", "What should I do first?", "Why is this dish cooked first?", "How much onion do I need?", "How do I cook this dish?", "What if the food is late?"],
};

const T = {
  ms: {
    allDone: "Semua lauk sudah siap. Tiada tugas lagi.",
    current: (d: string) => `Tugas anda sekarang: ${d}.`,
    start: "Mula",
    until: "siap",
    by: "oleh",
    inProgress: "sedang dimasak",
    firstWhy: (d: string, len: string) => `${d} dimasak dahulu kerana ia ambil masa paling lama (anggaran ${len}). Jika dimulakan lambat, ia tidak sempat siap pada waktu makanan perlu sedia.`,
    laterWhy: (d: string, len: string, first: string) => `${d} ambil masa anggaran ${len}. Ia dimulakan selepas ${first} supaya semua lauk siap pada waktu makanan perlu sedia.`,
    estimate: "Masa ini ialah anggaran. Kitchen PIC boleh mengubahnya.",
    noRecipe: (d: string) => `Resipi untuk ${d} belum disimpan dalam sistem, jadi saya tidak boleh beri langkah memasak. Sila tanya Kitchen PIC.`,
    stepsFor: (d: string) => `Langkah memasak ${d} (dari resipi yang disimpan):`,
    qtyFor: (n: string, d: string, pax: number) => `${n} untuk ${d} (${pax} pax):`,
    qtyNone: (n: string) => `Saya tidak jumpa "${n}" dalam resipi yang disimpan untuk acara ini. Sila tanya Kitchen PIC.`,
    qtyAsk: "Sebut nama bahan, contohnya: Berapa banyak bawang diperlukan?",
    late: [
      "Beritahu Kitchen PIC sekarang.",
      "Jangan langkau tugas. Teruskan tugas yang sedang berjalan dahulu.",
      "Lihat senarai tugas yang belum siap di bawah, dan beritahu Kitchen PIC lauk mana yang belum dimulakan.",
    ],
    lateLeft: (n: number) => `Tugas belum siap: ${n}.`,
    dontKnow: "Saya hanya boleh jawab soalan tentang pelan memasak ini. Cuba tekan salah satu soalan di bawah.",
  },
  en: {
    allDone: "All dishes are done. There is nothing left to do.",
    current: (d: string) => `Your task now: ${d}.`,
    start: "Start",
    until: "finish",
    by: "by",
    inProgress: "being cooked now",
    firstWhy: (d: string, len: string) => `${d} is cooked first because it takes the longest (about ${len}). If it starts late, it will not be ready when the food is due.`,
    laterWhy: (d: string, len: string, first: string) => `${d} takes about ${len}. It starts after ${first} so that every dish is ready when the food is due.`,
    estimate: "This time is an estimate. The Kitchen PIC can change it.",
    noRecipe: (d: string) => `The recipe for ${d} is not saved in the system, so I cannot give cooking steps. Please ask the Kitchen PIC.`,
    stepsFor: (d: string) => `Steps to cook ${d} (from the saved recipe):`,
    qtyFor: (n: string, d: string, pax: number) => `${n} for ${d} (${pax} pax):`,
    qtyNone: (n: string) => `I cannot find "${n}" in the saved recipes for this event. Please ask the Kitchen PIC.`,
    qtyAsk: "Say the name of the ingredient, for example: How much onion do I need?",
    late: [
      "Tell the Kitchen PIC now.",
      "Do not skip a task. Finish the task that is running first.",
      "See the tasks that are not finished below, and tell the Kitchen PIC which dishes have not been started.",
    ],
    lateLeft: (n: number) => `Tasks not finished: ${n}.`,
    dontKnow: "I can only answer questions about this cooking plan. Try one of the questions below.",
  },
} as const;

const has = (q: string, words: string[]) => words.some((w) => q.includes(w));
const timeLine = (t: HelpTask, lang: HelpLang) => `${T[lang].start} ${clockText(t.startMs)} · ${T[lang].until} ${clockText(t.endMs)} · ${T[lang].by} ${t.assignedTo}`;

/** The dish the question talks about (by name), else the dish being cooked, else the next one. */
function dishFor(q: string, tasks: HelpTask[]): HelpTask | null {
  const words = q.toLowerCase();
  const named = tasks.filter((t) => t.dish.toLowerCase().split(/\s+/).filter((w) => w.length > 3).some((w) => words.includes(w)) || similarity(q, t.dish) >= 0.6);
  if (named.length === 1) return named[0];
  return null;
}

const openTasks = (c: HelpContext) => c.tasks.filter((t) => t.status !== "completed").sort((a, b) => a.startMs - b.startMs);

/** The task this person should do now: their own dish being cooked, else their next one, else the next of the kitchen. */
function currentFor(c: HelpContext): HelpTask | null {
  const open = openTasks(c);
  const mine = (t: HelpTask) => !!c.me && t.assignedTo.toLowerCase().includes(c.me.toLowerCase());
  return open.find((t) => mine(t) && t.status === "in_progress") ?? open.find(mine) ?? open.find((t) => t.status === "in_progress") ?? open[0] ?? null;
}

/**
 * Answers from the plan and the saved recipes only; it never invents a recipe, a quantity or a food safety rule. When the
 * kitchen has nothing saved for the question, it says so and sends the person to the Kitchen PIC.
 */
export function answerQuestion(question: string, c: HelpContext, lang: HelpLang): string[] {
  const L = T[lang];
  const q = question.toLowerCase().trim();
  const open = openTasks(c);

  // ingredient quantities
  if (has(q, ["bawang", "onion", "berapa banyak", "how much", "how many", "quantity", "kuantiti", "bahan", "ingredient", "garam", "salt", "gula", "sugar", "minyak", "oil", "santan", "cili", "chilli", "halia", "ginger", "kunyit", "serai", "lengkuas", "tepung", "flour"])) {
    const names = new Set<string>();
    for (const t of c.tasks) for (const i of t.ingredients ?? []) names.add(i.name);
    const pool = [...names];
    const synonyms: Record<string, string[]> = { onion: ["bawang"], oil: ["minyak"], salt: ["garam"], sugar: ["gula"], chilli: ["cili"], ginger: ["halia"], flour: ["tepung"] };
    const asked = pool.filter((n) => {
      const ln = n.toLowerCase();
      return q.split(/[^a-z0-9]+/).some((w) => w.length > 2 && (ln.includes(w) || (synonyms[w] ?? []).some((s) => ln.includes(s))));
    });
    if (asked.length === 0) return [pool.length === 0 ? L.qtyNone(question) : L.qtyAsk];
    const out: string[] = [];
    const dish = dishFor(q, c.tasks);
    for (const name of asked.slice(0, 3)) {
      const rows = c.tasks.filter((t) => (!dish || t === dish) && t.ingredients?.some((i) => i.name === name));
      for (const t of rows) {
        const i = t.ingredients!.find((x) => x.name === name)!;
        out.push(`${L.qtyFor(name, t.dish, t.pax)} ${Math.round(i.quantity * 100) / 100} ${i.unit ?? ""}`.trim());
      }
    }
    return out.length ? out : [L.qtyNone(question)];
  }

  // why is it cooked first
  if (has(q, ["kenapa", "why", "mengapa"])) {
    const t = dishFor(q, c.tasks) ?? open[0];
    if (!t) return [L.allDone];
    const first = [...c.tasks].sort((a, b) => a.startMs - b.startMs)[0];
    return [t === first ? L.firstWhy(t.dish, lengthText(t.minutes)) : L.laterWhy(t.dish, lengthText(t.minutes), first.dish), L.estimate];
  }

  // how to cook
  if (has(q, ["macam mana", "bagaimana", "how do", "how to", "cara", "langkah", "steps", "resipi", "recipe", "masak"]) && !has(q, ["lambat", "late"])) {
    const t = dishFor(q, c.tasks) ?? currentFor(c);
    if (!t) return [L.allDone];
    if (t.steps.length === 0) return [L.noRecipe(t.dish)];
    return [L.stepsFor(t.dish), ...t.steps.map((s, i) => `${i + 1}. ${s}`)];
  }

  // food will be late
  if (has(q, ["lambat", "late", "delay", "terlewat"])) {
    return [...L.late.map((s, i) => `${i + 1}. ${s}`), L.lateLeft(open.length), ...open.slice(0, 5).map((t) => `- ${t.dish} (${t.status === "in_progress" ? L.inProgress : L.start + " " + clockText(t.startMs)})`)];
  }

  // what should I do first / my task now
  if (has(q, ["dahulu", "first", "mula", "tugas", "task", "now", "sekarang", "next", "seterusnya"])) {
    const t = has(q, ["dahulu", "first"]) ? open[0] : currentFor(c);
    if (!t) return [L.allDone];
    return [L.current(t.dish), timeLine(t, lang), ...(t.status === "in_progress" ? [`(${L.inProgress})`] : [])];
  }

  // a dish was named: say what is known about it
  const named = dishFor(q, c.tasks);
  if (named) return [named.dish, timeLine(named, lang)];

  return [L.dontKnow];
}
