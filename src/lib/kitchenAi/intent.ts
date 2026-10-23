/**
 * Understanding a follow-up message ("change the pax to 300", "remove the soup", "shopping list only") WITHOUT an AI call for
 * the common wording (English and Bahasa Melayu): it is instant, works when the AI is busy and can never invent an operation.
 * Anything it does not recognise is handed to the AI reader as a fallback, whose answer is checked against the same schema.
 */
export type Op =
  | { type: "set_pax"; pax: number; session?: string }
  | { type: "add_pax"; delta: number; session?: string }
  | { type: "remove_item"; phrase: string }
  | { type: "replace_item"; from: string; to: string }
  | { type: "add_item"; name: string; session?: string }
  | { type: "view"; view: "ingredients" | "shopping" | "suppliers" | "dish"; dish?: string }
  | { type: "unit_mode"; mode: "kg" | "auto" }
  | { type: "stock" }
  | { type: "export" }
  | { type: "estimate"; phrase?: string }
  | { type: "use_recipe"; phrase: string; recipe: string }
  | { type: "approve" }
  | { type: "help" };

const PAX_WORD = "(?:pax|people|persons|guests|orang|tetamu|kepala)";
const num = (s: string) => Number(s.replace(/,/g, ""));
const clean = (s: string) => s.replace(/^(?:the|a|an|dish|menu|item|hidangan)\s+/i, "").replace(/[.!?]+$/g, "").trim();

/** The session a phrase points to ("for lunch") is resolved later against the real session names. */
function sessionHint(t: string): string | undefined {
  const m = t.match(/\b(?:for|untuk|bagi)\s+(?:the\s+)?([a-z][a-z0-9 ]{1,30}?)\s*(?:session|sesi)?\s*$/i);
  return m ? m[1].trim() : undefined;
}

export function parseCommand(raw: string): Op[] | null {
  const text = raw.trim();
  const t = text.toLowerCase().replace(/\s+/g, " ");
  if (!t) return null;

  // export
  if (/\b(export|eksport|download|muat turun)\b/.test(t)) return [{ type: "export" }];

  // stock comparison
  if (/\b(stock|stok)\b/.test(t) && /\b(compare|check|banding|bandingkan|semak|vs|versus|against|dengan)\b/.test(t)) return [{ type: "stock" }];

  // units
  if (/\b(convert|tukar|ubah|show|papar|in|dalam)\b/.test(t) && /\b(kilograms?|kgs?|kilo|litres?|liters?)\b/.test(t) && !/\bpax\b/.test(t)) return [{ type: "unit_mode", mode: "kg" }];
  if (/\b(grams?|auto|default|asal)\b/.test(t) && /\b(convert|tukar|ubah|show|papar|back|balik)\b/.test(t)) return [{ type: "unit_mode", mode: "auto" }];

  // pax: add / reduce
  let m = t.match(new RegExp(`\\b(?:add|tambah|plus)\\s+(\\d[\\d,]*)\\s+(?:more\\s+|lagi\\s+)?${PAX_WORD}\\b`));
  if (m) return [{ type: "add_pax", delta: num(m[1]), session: sessionHint(t) }];
  m = t.match(new RegExp(`\\b(?:reduce|less|minus|kurangkan|tolak|remove|buang)\\s+(\\d[\\d,]*)\\s+(?:${PAX_WORD})\\b`));
  if (m) return [{ type: "add_pax", delta: -num(m[1]), session: sessionHint(t) }];

  // pax: set
  m = t.match(new RegExp(`\\b(?:change|set|update|make|tukar|ubah|kemaskini|jadikan|ganti)\\s+(?:the\\s+)?(?:${PAX_WORD}|jumlah|bilangan)?\\s*(?:to|kepada|jadi|=|:)?\\s*(\\d[\\d,]*)\\b`));
  if (m && new RegExp(PAX_WORD).test(t)) return [{ type: "set_pax", pax: num(m[1]), session: sessionHint(t) }];
  m = t.match(new RegExp(`^(?:for\\s+|untuk\\s+)?(\\d[\\d,]*)\\s*${PAX_WORD}\\b`)) ?? t.match(new RegExp(`\\b${PAX_WORD}\\s*[:=]?\\s*(\\d[\\d,]*)\\b`));
  if (m) return [{ type: "set_pax", pax: num(m[1]), session: sessionHint(t.replace(m[0], "")) }];
  // "lunch 200" / "dinner: 150 pax" is handled by the caller (it knows the session names)

  // use a recipe: "use NASI PUTIH for white rice"
  m = text.match(/^use\s+(?:the\s+)?(?:recipe\s+)?(.+?)\s+(?:for|as|untuk)\s+(.+)$/i) ?? text.match(/^guna\s+(?:resipi\s+)?(.+?)\s+untuk\s+(.+)$/i);
  if (m) return [{ type: "use_recipe", recipe: clean(m[1]), phrase: clean(m[2]) }];

  // estimates: "estimates reviewed" approves them; any other mention asks for one
  if (/\b(reviewed|approved?|chef|lulus|diluluskan|disemak|disahkan|semak)\b/.test(t) && /\b(estimates?|anggaran|ai)\b/.test(t)) return [{ type: "approve" }];
  if (/\b(estimates?|estimation|anggaran|anggarkan)\b/.test(t)) {
    const e = text.match(/(?:estimates?|estimation|anggaran|anggarkan)\s+(?:for\s+|untuk\s+)?(.+)$/i);
    const phrase = e ? clean(e[1]) : "";
    const generic = /^(?:it|them|all|everything|the rest|missing|these|semua|yang tiada|please|ai|by ai|ai estimate|an ai estimate)$/i.test(phrase) || /^(?:ai\b|an?\s+ai\b|the missing|all the|semua)/i.test(phrase);
    return [{ type: "estimate", phrase: phrase && !generic ? phrase.replace(/^(?:an?\s+)?ai\s+estimate\s+(?:for\s+)?/i, "") : undefined }];
  }

  // replace: "change chicken curry to beef curry"
  m = text.match(/^(?:change|replace|swap|tukar|ganti)\s+(.+?)\s+(?:to|with|into|kepada|dengan|jadi)\s+(.+)$/i);
  if (m && !new RegExp(PAX_WORD, "i").test(m[1]) && !/^\d/.test(m[2])) return [{ type: "replace_item", from: clean(m[1]), to: clean(m[2]) }];

  // remove
  m = text.match(/^(?:please\s+)?(?:remove|delete|drop|take out|buang|padam|keluarkan)\s+(.+)$/i);
  if (m && !new RegExp(PAX_WORD, "i").test(m[1])) return [{ type: "remove_item", phrase: clean(m[1]) }];

  // add a dish
  m = text.match(/^(?:please\s+)?(?:add|tambah)\s+(.+)$/i);
  if (m && !/^\d/.test(m[1]) && !new RegExp(PAX_WORD, "i").test(m[1])) return [{ type: "add_item", name: clean(m[1].replace(/\s+(?:to|ke)\s+(?:the\s+)?menu$/i, "")), session: undefined }];

  // views: what to buy from which supplier
  if (/\b(by supplier|per supplier|from (?:the )?suppliers?|supplier list|purchase order|order list|pembekal|supplier|senarai pembekal|pesanan pembelian|untuk dibeli mengikut)\b/.test(t) && /\b(buy|purchase|order|list|senarai|beli|pembelian|pesan|supplier|pembekal)\b/.test(t)) return [{ type: "view", view: "suppliers" }];

  // views
  if (/\b(shopping list|purchase list|buying list|senarai (?:belian|beli|barang|belanja)|belanja|to buy)\b/.test(t)) return [{ type: "view", view: "shopping" }];
  const dish = text.match(/\b(?:ingredients?|bahan(?:-bahan)?)\b.*?\b(?:for|untuk|bagi)\s+(.+?)(?:\s+only|\s+sahaja)?[.!?]*$/i);
  if (dish && !/\b(?:all|the whole|semua|entire|complete)\b/i.test(dish[1])) return [{ type: "view", view: "dish", dish: clean(dish[1]) }];
  if (/\b(ingredients?|bahan|calculate|calculation|kira|generate|recipe list|requirements?|quantit(?:y|ies)|kuantiti)\b/.test(t)) return [{ type: "view", view: "ingredients" }];

  if (/^(?:help|bantuan|what can you do|apa boleh)/.test(t)) return [{ type: "help" }];
  return null;
}

/** Cleans the operations an AI fallback returned: only known operations with sane values pass. */
export function sanitizeOps(value: unknown): Op[] {
  if (!Array.isArray(value)) return [];
  const out: Op[] = [];
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 120) : undefined);
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  for (const raw of value.slice(0, 6)) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    switch (o.type) {
      case "set_pax": {
        const pax = n(o.pax);
        if (pax !== undefined && pax > 0 && pax <= 100000) out.push({ type: "set_pax", pax: Math.round(pax), session: str(o.session) });
        break;
      }
      case "add_pax": {
        const delta = n(o.delta);
        if (delta !== undefined && delta !== 0 && Math.abs(delta) <= 100000) out.push({ type: "add_pax", delta: Math.round(delta), session: str(o.session) });
        break;
      }
      case "remove_item": {
        const phrase = str(o.phrase);
        if (phrase) out.push({ type: "remove_item", phrase });
        break;
      }
      case "replace_item": {
        const from = str(o.from);
        const to = str(o.to);
        if (from && to) out.push({ type: "replace_item", from, to });
        break;
      }
      case "add_item": {
        const name = str(o.name);
        if (name) out.push({ type: "add_item", name, session: str(o.session) });
        break;
      }
      case "view": {
        if (o.view === "ingredients" || o.view === "shopping" || o.view === "suppliers") out.push({ type: "view", view: o.view });
        else if (o.view === "dish" && str(o.dish)) out.push({ type: "view", view: "dish", dish: str(o.dish) });
        break;
      }
      case "unit_mode":
        if (o.mode === "kg" || o.mode === "auto") out.push({ type: "unit_mode", mode: o.mode });
        break;
      case "stock":
      case "export":
      case "approve":
      case "help":
        out.push({ type: o.type });
        break;
      case "estimate":
        out.push({ type: "estimate", phrase: str(o.phrase) });
        break;
      case "use_recipe": {
        const phrase = str(o.phrase);
        const recipe = str(o.recipe);
        if (phrase && recipe) out.push({ type: "use_recipe", phrase, recipe });
        break;
      }
    }
  }
  return out;
}
