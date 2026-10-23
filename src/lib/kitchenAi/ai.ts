import Anthropic from "@anthropic-ai/sdk";
import { GeminiError, getAiProvider, geminiGenerateDetailed, type GeminiPart } from "@/lib/ai/gemini";
import { parseModelJson } from "@/lib/extraction/report";
import { sanitizeOps, type Op } from "./intent";
import { toBase } from "./units";
import type { Estimate } from "./types";

export class KitchenAiError extends Error {
  constructor(message: string, readonly code: "not_configured" | "busy" | "blocked" | "unreadable" | "bad_answer") {
    super(message);
    this.name = "KitchenAiError";
  }
}

type AiFile = { mime: string; data: Buffer };

/** One vision / text call that must answer with a JSON object. Gemini or Claude, whichever the server is set up with. */
async function aiJson(params: { text: string; files?: AiFile[]; maxOutputTokens: number; budgetMs?: number }): Promise<Record<string, unknown>> {
  const provider = getAiProvider();
  if (!provider) throw new KitchenAiError("The AI service is not configured (no ANTHROPIC_API_KEY or GEMINI_API_KEY).", "not_configured");
  let raw = "";
  try {
    if (provider === "gemini") {
      const parts: GeminiPart[] = [...(params.files ?? []).map((f) => ({ inline_data: { mime_type: f.mime, data: f.data.toString("base64") } })), { text: params.text }];
      const res = await geminiGenerateDetailed({ turns: [{ role: "user", parts }], maxOutputTokens: params.maxOutputTokens, json: true, budgetMs: params.budgetMs });
      raw = res.text;
    } else {
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const blocks: Anthropic.ContentBlockParam[] = (params.files ?? []).map((f) =>
        f.mime === "application/pdf"
          ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: f.data.toString("base64") } }
          : { type: "image", source: { type: "base64", media_type: f.mime as "image/jpeg" | "image/png" | "image/webp" | "image/gif", data: f.data.toString("base64") } },
      );
      blocks.push({ type: "text", text: params.text });
      const response = await anthropic.messages.create({ model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5", max_tokens: params.maxOutputTokens, messages: [{ role: "user", content: blocks }] });
      const textBlock = response.content.find((b) => b.type === "text");
      raw = textBlock && "text" in textBlock ? textBlock.text : "";
    }
  } catch (err) {
    if (err instanceof GeminiError) {
      if (err.kind === "blocked") throw new KitchenAiError("The AI service declined to read this image.", "blocked");
      throw new KitchenAiError("The AI service is busy right now. Please try again in a moment.", "busy");
    }
    throw new KitchenAiError("The AI service could not process the request. Please try again.", "busy");
  }
  const parsed = parseModelJson(raw);
  if (!parsed) throw new KitchenAiError("The AI answer could not be understood. Please try again.", "bad_answer");
  return parsed;
}

// ---------------------------------------------------------------------------------------------------------------- reading

export type ReadMenu = {
  legibility: "good" | "partial" | "poor";
  eventName: string | null;
  pax: number | null;
  sessions: { name: string | null; pax: number | null; items: { name: string; note: string | null }[] }[];
  issues: string[];
};

const READ_PROMPT = `You are reading photo(s) or a scan of a catering MENU for a kitchen. The menu may be printed or handwritten, in English or Bahasa Melayu (or both). Respond with ONLY a JSON object, no other text:
{
  "legibility": "good" | "partial" | "poor",
  "event_name": the event or customer name if the menu states one, else null,
  "pax": the number of guests / pax the menu states for the whole event as a plain integer, else null,
  "sessions": [
    { "name": the meal session exactly as written (for example "Lunch", "Tea Break", "Day 2 Dinner"), or null if the menu has no separate sessions,
      "pax": the pax written for THIS session as a plain integer, else null,
      "items": [ { "name": the dish exactly as written, "note": a remark written next to that dish (for example "no chilli", "10%"), else null } ] }
  ],
  "issues": [ one short sentence for every dish, number or part you could not read, or any page that is cut off, rotated or blurry ]
}
Rules:
- Copy EVERY dish that is written, once each, in the order written, exactly as written (same spelling, same language). Never translate, rename, merge or add a dish.
- If the menu has no separate sessions, return ONE session with name null.
- Never guess a pax number. If no number of guests is written, use null.
- Ignore prices, phone numbers, company names, addresses and decorations; they are not dishes.
- If several images are given they are parts of the same menu: combine them, and do not repeat a dish that appears on two images.
- If you cannot read the menu at all, return no items, legibility "poor" and explain in "issues".`;

const asText = (v: unknown, max = 120): string | null => (typeof v === "string" && v.trim() ? v.replace(/\s+/g, " ").trim().slice(0, max) : null);
const asPax = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/[^\d.]/g, "")) : NaN;
  return Number.isFinite(n) && n >= 1 && n <= 100000 ? Math.round(n) : null;
};

export async function readMenuImages(files: AiFile[]): Promise<ReadMenu> {
  const parsed = await aiJson({ text: READ_PROMPT, files, maxOutputTokens: 8192, budgetMs: 50_000 });
  const sessionsRaw = Array.isArray(parsed.sessions) ? parsed.sessions : [];
  const sessions = sessionsRaw
    .map((s) => {
      const o = (s ?? {}) as Record<string, unknown>;
      const seen = new Set<string>();
      const items = (Array.isArray(o.items) ? o.items : [])
        .map((i) => {
          const it = (i ?? {}) as Record<string, unknown>;
          return { name: asText(it.name), note: asText(it.note, 80) };
        })
        .filter((i): i is { name: string; note: string | null } => {
          if (!i.name) return false;
          const key = i.name.toUpperCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      return { name: asText(o.name, 60), pax: asPax(o.pax), items };
    })
    .filter((s) => s.items.length > 0);
  const legibility = parsed.legibility === "good" || parsed.legibility === "partial" || parsed.legibility === "poor" ? parsed.legibility : "partial";
  const issues = (Array.isArray(parsed.issues) ? parsed.issues : []).map((i) => asText(i, 200)).filter((i): i is string => !!i).slice(0, 8);
  return { legibility, eventName: asText(parsed.event_name, 120), pax: asPax(parsed.pax), sessions, issues };
}

// -------------------------------------------------------------------------------------------------------------- estimates

export async function estimateDish(dish: string, basisPax: number): Promise<Estimate> {
  const prompt = `You are an experienced Malaysian catering chef. Write a practical STARTING ESTIMATE of the raw ingredients needed to cook "${dish}" for ${basisPax} servings (one adult portion each, as served by a commercial catering kitchen: buffet or packed meal). Respond with ONLY a JSON object, no other text:
{
  "assumptions": [ short sentences stating the serving size per person (in grams), how the dish is cooked and what is included ],
  "ingredients": [ { "name": ingredient name in Bahasa Melayu capital letters as used in Malaysian kitchens (for example "BAWANG BESAR", "MINYAK MASAK", "AYAM"), "quantity": a plain number for ${basisPax} servings, "unit": "g" | "kg" | "ml" | "l" | "pcs" } ]
}
Rules: raw (uncooked) purchase quantities for exactly ${basisPax} servings; include every ingredient the dish needs (oil, salt, spices, coconut milk, water if it is an ingredient); at most 25 ingredients; only the units g, kg, ml, l, pcs; no prices; do not invent special ingredients that the dish does not normally use.`;
  const parsed = await aiJson({ text: prompt, maxOutputTokens: 4096, budgetMs: 45_000 });
  const lines = (Array.isArray(parsed.ingredients) ? parsed.ingredients : [])
    .map((i) => {
      const o = (i ?? {}) as Record<string, unknown>;
      const name = asText(o.name, 80);
      const quantity = typeof o.quantity === "number" ? o.quantity : Number(o.quantity);
      const unit = asText(o.unit, 8)?.toLowerCase() ?? "";
      return { name: name?.toUpperCase() ?? null, quantity, unit };
    })
    .filter((l): l is { name: string; quantity: number; unit: string } => !!l.name && Number.isFinite(l.quantity) && l.quantity > 0 && l.quantity < 1_000_000 && ["g", "kg", "ml", "l", "pcs"].includes(l.unit))
    .slice(0, 25);
  if (lines.length === 0) throw new KitchenAiError("The AI could not write an estimate for this dish.", "bad_answer");
  // sanity: an estimate far outside a believable portion is flagged for the chef instead of being trusted silently
  const mass = lines.filter((l) => toBase(l.quantity, l.unit).family === "mass").reduce((t, l) => t + toBase(l.quantity, l.unit).qty, 0);
  const assumptions = (Array.isArray(parsed.assumptions) ? parsed.assumptions : []).map((a) => asText(a, 200)).filter((a): a is string => !!a).slice(0, 6);
  const perServing = mass / basisPax;
  if (mass > 0 && (perServing > 1500 || perServing < 15)) assumptions.push(`Check: the raw weight comes to about ${Math.round(perServing)} g per serving, which looks unusual for one portion.`);
  return { basisPax, assumptions, lines: lines.map((l) => ({ name: l.name, quantity: l.quantity, unit: l.unit })), status: "pending", reviewedBy: null, reviewedAt: null };
}

// ----------------------------------------------------------------------------------------------------------- AI fallback

/** For wording the built-in parser does not know. The answer is limited to the known operations. */
export async function interpretWithAi(text: string, summary: string): Promise<Op[]> {
  const prompt = `A kitchen staff member is working on an ingredient list for a catering menu and wrote a follow-up message. Turn it into operations. Current menu:
${summary}

Message: """${text.slice(0, 400)}"""

Respond with ONLY a JSON object: { "ops": [ ... ] } where each operation is one of:
{"type":"set_pax","pax":number,"session":string|null}  {"type":"add_pax","delta":number (negative to reduce),"session":string|null}
{"type":"remove_item","phrase":string}  {"type":"replace_item","from":string,"to":string}  {"type":"add_item","name":string}
{"type":"view","view":"ingredients"|"shopping"|"dish","dish":string|null}  {"type":"unit_mode","mode":"kg"|"auto"}
{"type":"stock"}  {"type":"export"}  {"type":"estimate","phrase":string|null}  {"type":"use_recipe","phrase":string,"recipe":string}  {"type":"approve"}  {"type":"help"}
Use an empty list if the message is not a request about this menu. Never invent a number the message does not contain.`;
  try {
    const parsed = await aiJson({ text: prompt, maxOutputTokens: 600, budgetMs: 20_000 });
    return sanitizeOps(parsed.ops);
  } catch {
    return [];
  }
}
