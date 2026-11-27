import Anthropic from "@anthropic-ai/sdk";
import { geminiGenerate, getAiProvider } from "@/lib/ai/gemini";
import { parseModelJson } from "@/lib/extraction/report";
import { EVENT_TYPE_OPTIONS, MEAL_TYPE_LABEL, SERVICE_TYPE_LABEL } from "@/lib/catering/constants";
import { emptyResult, emptySession, SNACK_UNITS, type PaxLine, type SnackItem, type WaCategory, type WaDate, type WaMatch, type WaResult, type WaSession } from "@/lib/whatsapp/types";

type J = Record<string, unknown>;
const isObj = (v: unknown): v is J => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown, max = 2000) => (typeof v === "string" ? v.trim().slice(0, max) : typeof v === "number" ? String(v) : "");
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function prompt(today: string, forced?: WaCategory): string {
  const meal = Object.entries(MEAL_TYPE_LABEL).map(([k, l]) => `${k} (${l})`).join(", ");
  const service = Object.entries(SERVICE_TYPE_LABEL).map(([k, l]) => `${k} (${l})`).join(", ");
  const types = EVENT_TYPE_OPTIONS.map(([k, l]) => `${k} (${l})`).join(", ");
  return `You read a WhatsApp message that the Boss of Signature Solution Sdn Bhd (a catering company in Johor, Malaysia) sent to the Admin.
The message may be in Bahasa Melayu, English or both, informal, with abbreviations, typos and no fixed format. Today is ${today} (Malaysia).

STEP 1 – choose ONE category from what the message actually asks for${forced ? ` (the Admin has chosen "${forced}": use it)` : ""}:
- "quotation": food / catering for an event or a match day (menu, packfood, buffet, VIP meals, pax for groups or departments, delivery of meals).
- "jdt_match": only JDT match dates / fixtures (dates, opponents, kick-off, venue) with no food order yet.
- "snack": items to buy for JDT (e.g. JDT II) training: fruits, biscuits, snacks, drinks, refreshments, packaged food or other supplies, usually with quantities like "5 box", "4 pcs".
Do not force every message into "quotation".

STEP 2 – fill ONLY the section of that category (leave the others null). STRICT RULES:
- NEVER invent anything. Anything not written in the message is null (or an empty list). Never guess a menu, pax, quantity, date, time or price.
- Keep names exactly as written: pax categories / departments (e.g. "LCS U12", "Sekretariate", "Pegawai Perubatan", "Petugas MBJB"), item names (e.g. "Pisang", "Mata Kuching"), match names. Do not translate, merge or correct them.
- Each department / group is its own pax line. Do not add lines together. A line written without a number has pax null.
- Separate meal sessions stay separate (e.g. "Packfood" for marshals at 6:00 PM and "VIP – Halftime" 15 pax at 9:00 PM are two sessions of the same event).
- Times: 24-hour "HH:MM". "ptg" / "petang" = afternoon/evening (PM), "pagi" = morning (AM), "malam" = night (PM), "tgh hari"/"tengahari" = around noon. "4.00 PTG" = "16:00".
- "PENGHANTARAN PADA JAM 4.00 PTG" / "hantar jam ..." is the DELIVERY time, not the meal or event time.
- Dates: "date" is "YYYY-MM-DD"; "text" is the date exactly as written; "year_stated" is false when the message gives no year (then use the nearest such date from today on); "weekday_stated" is the day name written (e.g. "Khamis", "Sabtu", "Sat") or null. Never change a date to fit the day name.
- meal_types: only from: ${meal}.
- service_type: one of: ${service}; "Packfood"/"pack" = pack_food. Or null.
- event_type: one of: ${types}. JDT football match days = football_jdt.
- unit for snack items: one of ${SNACK_UNITS.join(", ")} (as written, lower case) or null.
- "uncertain": short notes on anything you could not read clearly.

Answer with ONE JSON object only:
{
  "category": "quotation" | "jdt_match" | "snack",
  "reason": "one short line why",
  "quotation": null | {
    "customer_name": string|null, "event_name": string|null, "event_type": string|null, "venue": string|null,
    "match_details": string|null, "kick_off_time": "HH:MM"|null, "event_time": "HH:MM"|null, "budget": string|null, "special_instructions": string|null,
    "days": [ { "date": "YYYY-MM-DD"|null, "text": string|null, "year_stated": boolean, "weekday_stated": string|null,
      "sessions": [ { "name": string|null, "meal_types": [string], "service_type": string|null, "menu": string|null, "meal_time": "HH:MM"|null,
        "delivery_date": "YYYY-MM-DD"|null, "delivery_time": "HH:MM"|null, "delivery_location": string|null, "delivery_instructions": string|null,
        "special_instructions": string|null, "pax_total_stated": number|null,
        "pax_breakdown": [ { "category": string, "pax": number|null } ] } ] } ]
  },
  "matches": null | [ { "date": "YYYY-MM-DD"|null, "text": string|null, "year_stated": boolean, "weekday_stated": string|null,
      "match_details": string|null, "competition": string|null, "home_away": "home"|"away"|null, "venue": string|null, "kick_off_time": "HH:MM"|null, "remarks": string|null } ],
  "snack": null | { "team": string|null, "date": "YYYY-MM-DD"|null, "text": string|null, "year_stated": boolean, "weekday_stated": string|null,
      "delivery_time": "HH:MM"|null, "delivery_location": string|null, "remarks": string|null,
      "items": [ { "name": string, "quantity": number|null, "unit": string|null, "remarks": string|null } ] },
  "uncertain": [string]
}`;
}

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** A date read by the AI, checked: a wrong date becomes empty; a date with no year written gets the nearest year and is flagged. */
function readDate(o: J, today: string): WaDate {
  const text = str(o.text, 120) || null;
  let date = DATE_RE.test(str(o.date)) && !Number.isNaN(Date.parse(`${str(o.date)}T00:00:00Z`)) ? str(o.date) : "";
  // the year counts as written only if the text really has one (e.g. "2026", "14.11.26")
  const textHasYear = text ? /\b(19|20)\d{2}\b/.test(text) || /\d{1,2}[./-]\d{1,2}[./-]\d{2}\b/.test(text) : o.year_stated !== false;
  const yearStated = o.year_stated !== false && textHasYear;
  if (date && !yearStated) {
    // the nearest such date from a month ago on (a training "23/11" is this year's, or next year's once it is long past)
    const md = date.slice(5);
    const year = Number(today.slice(0, 4));
    const candidates = [year - 1, year, year + 1].map((y) => `${y}-${md}`).filter((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)));
    date = candidates.find((d) => d >= addDays(today, -31)) ?? date;
  }
  return { date, text, yearStated: date ? yearStated : true, weekdayStated: str(o.weekday_stated, 30) || null };
}

const time = (v: unknown) => {
  const s = str(v, 8);
  const m = /^(\d{1,2}):(\d{2})/.exec(s);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return "";
  return `${m[1].padStart(2, "0")}:${m[2]}`;
};

/** A number the AI gave is kept only if that number is written in the message (so no quantity or pax is ever invented). */
function numberInMessage(v: unknown, message: string): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  const digits = String(n).replace(/\.0+$/, "");
  return new RegExp(`(^|[^\\d.])${digits.replace(".", "\\.")}([^\\d]|$)`).test(message) ? n : null;
}

function readSession(o: J, message: string, notes: string[]): WaSession {
  const breakdown: PaxLine[] = arr(o.pax_breakdown)
    .filter(isObj)
    .map((l) => {
      const pax = numberInMessage(l.pax, message);
      if (l.pax !== null && l.pax !== undefined && pax === null) notes.push(`The pax of "${str(l.category, 80)}" was not clear in the message, so it is left Pending.`);
      return { category: str(l.category, 120), pax };
    })
    .filter((l) => l.category);
  return {
    ...emptySession(),
    name: str(o.name, 120),
    mealTypes: arr(o.meal_types).map((m) => str(m, 40)).filter((m) => m in MEAL_TYPE_LABEL),
    serviceType: str(o.service_type, 40) in SERVICE_TYPE_LABEL ? str(o.service_type, 40) : "",
    menu: str(o.menu, 3000),
    mealTime: time(o.meal_time),
    deliveryDate: DATE_RE.test(str(o.delivery_date)) ? str(o.delivery_date) : "",
    deliveryTime: time(o.delivery_time),
    deliveryLocation: str(o.delivery_location, 300),
    deliveryInstructions: str(o.delivery_instructions, 1000),
    specialInstructions: str(o.special_instructions, 1000),
    paxStated: numberInMessage(o.pax_total_stated, message),
    breakdown,
  };
}

/** Turns the AI answer into the form, checking every value against the rules (nothing invented is kept). */
export function normaliseAiAnswer(raw: J, message: string, today: string, forced?: WaCategory): WaResult {
  const base = emptyResult();
  const category: WaCategory = forced ?? (["quotation", "jdt_match", "snack"].includes(str(raw.category)) ? (str(raw.category) as WaCategory) : "quotation");
  const notes: string[] = arr(raw.uncertain).map((u) => str(u, 300)).filter(Boolean);
  const out: WaResult = { ...base, category, reason: str(raw.reason, 300), uncertain: notes };

  if (isObj(raw.quotation)) {
    const q = raw.quotation;
    const types = new Set(EVENT_TYPE_OPTIONS.map(([k]) => k));
    const days = arr(q.days)
      .filter(isObj)
      .map((d) => ({ ...readDate(d, today), sessions: arr(d.sessions).filter(isObj).map((s) => readSession(s, message, notes)) }))
      .map((d) => ({ ...d, sessions: d.sessions.length > 0 ? d.sessions : [emptySession()] }));
    out.quotation = {
      customerName: str(q.customer_name, 200) || base.quotation.customerName,
      eventName: str(q.event_name, 300),
      eventType: types.has(str(q.event_type)) ? str(q.event_type) : "football_jdt",
      venue: str(q.venue, 300),
      matchDetails: str(q.match_details, 300),
      kickOff: time(q.kick_off_time),
      eventTime: time(q.event_time),
      budget: str(q.budget, 200),
      specialInstructions: str(q.special_instructions, 2000),
      days: days.length > 0 ? days : base.quotation.days,
    };
  }
  if (Array.isArray(raw.matches)) {
    out.matches = raw.matches.filter(isObj).map(
      (m): WaMatch => ({
        ...readDate(m, today),
        matchDetails: str(m.match_details, 300),
        competition: str(m.competition, 120),
        homeAway: ["home", "away"].includes(str(m.home_away)) ? str(m.home_away) : "",
        venue: str(m.venue, 300),
        kickOff: time(m.kick_off_time),
        remarks: str(m.remarks, 1000),
      }),
    );
  }
  if (isObj(raw.snack)) {
    const s = raw.snack;
    const items: SnackItem[] = arr(s.items)
      .filter(isObj)
      .map((i) => {
        const quantity = numberInMessage(i.quantity, message);
        if (i.quantity !== null && i.quantity !== undefined && quantity === null) notes.push(`The quantity of "${str(i.name, 80)}" was not clear in the message, so it is left Pending.`);
        const unit = str(i.unit, 20).toLowerCase();
        return { name: str(i.name, 200), quantity, unit: quantity === null ? "" : (SNACK_UNITS as readonly string[]).includes(unit) ? unit : unit.slice(0, 20), remarks: str(i.remarks, 500) };
      })
      .filter((i) => i.name);
    out.snack = { ...readDate(s, today), team: str(s.team, 80) || "JDT II", deliveryTime: time(s.delivery_time), deliveryLocation: str(s.delivery_location, 300), remarks: str(s.remarks, 1000), items };
  }
  out.uncertain = Array.from(new Set(notes));
  return out;
}

/** Asks the AI (Claude when its key is set, otherwise the free Gemini) to read the message. */
export async function analyseWithAi(message: string, today: string, forced?: WaCategory): Promise<WaResult> {
  const provider = getAiProvider();
  if (!provider) throw new Error("The AI reader is not set up (no AI key). Fill in the form by hand.");
  const system = prompt(today, forced);
  const user = `WhatsApp message:\n"""\n${message}\n"""`;
  let raw = "";
  if (provider === "anthropic") {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({ model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5", max_tokens: 6000, system, messages: [{ role: "user", content: user }] });
    const block = response.content.find((b) => b.type === "text");
    raw = block && "text" in block ? block.text : "";
  } else {
    raw = await geminiGenerate({ system, turns: [{ role: "user", parts: [{ text: user }] }], maxOutputTokens: 8192, json: true, budgetMs: 50_000 });
  }
  const parsed = parseModelJson(raw);
  if (!parsed) throw new Error("The AI answer could not be read. Press Analyse Message again, or fill in the form by hand.");
  return normaliseAiAnswer(parsed, message, today, forced);
}
