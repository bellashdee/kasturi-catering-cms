import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { getAiProvider } from "@/lib/ai/gemini";
import { inspectFile } from "@/lib/extraction/inspect";
import { createConversation, countTodayUserMessages, saveMessage, touchConversation } from "@/lib/assistant/actions";
import { calculate } from "@/lib/kitchenAi/calc";
import { loadPurchasePlan, purchaseText } from "@/lib/kitchenAi/purchase";
import { estimateDish, interpretWithAi, KitchenAiError, readMenuImages, type ReadMenu } from "@/lib/kitchenAi/ai";
import { loadRecipeData, loadRecipeRefs, loadStock } from "@/lib/kitchenAi/data";
import { compareWithEvent, loadEventDraft, type EventDraft } from "@/lib/kitchenAi/event";
import { changesText, dishText, fill, helpText, ingredientsText, reviewText, shoppingText, stockText, text } from "@/lib/kitchenAi/format";
import { parseCommand, type Op } from "@/lib/kitchenAi/intent";
import { type Change, applyOps, makeItem, newId, sessionPaxShortcut } from "@/lib/kitchenAi/ops";
import { candidatesFor, type RecipeRef } from "@/lib/kitchenAi/match";
import type { CalcResult, KItem, KSession, KState, Lang } from "@/lib/kitchenAi/types";
import type { Json } from "@/lib/supabase/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const DAILY_MESSAGE_LIMIT = 60;
const MAX_FILES = 4;
const MAX_FILE_BYTES = 12 * 1024 * 1024;

type DB = Awaited<ReturnType<typeof createClient>>;

const fail = (status: number, error: string, code = "error") => NextResponse.json({ error, code }, { status });

async function loadSession(supabase: DB, conversationId: string) {
  const { data } = await supabase.from("ai_kitchen_sessions").select("id, state, company_id, event_id").eq("conversation_id", conversationId).maybeSingle();
  return data ? { id: data.id, state: data.state as unknown as KState, companyId: data.company_id } : null;
}

async function saveState(supabase: DB, conversationId: string, userId: string, state: KState) {
  const row = { conversation_id: conversationId, user_id: userId, company_id: state.companyId, event_id: state.event?.id ?? null, state: state as unknown as Json, updated_at: new Date().toISOString() };
  const { error } = await supabase.from("ai_kitchen_sessions").upsert(row, { onConflict: "conversation_id" });
  if (error) throw error;
}

/** The numbers for the current state: recipe quantities scaled to the pax, and the stock comparison when asked for. */
async function computeAll(supabase: DB, state: KState, withStock: boolean): Promise<CalcResult> {
  const ids = state.sessions.flatMap((s) => s.items.map((i) => i.recipeId)).filter((x): x is string => !!x);
  const [recipes, stock] = await Promise.all([loadRecipeData(supabase, ids), withStock ? loadStock(supabase, state.companyId) : Promise.resolve(null)]);
  return calculate(state, recipes, stock);
}

/** Downloads the uploaded menu images, refuses images that are too small or blurry to be read honestly. */
async function loadFiles(supabase: DB, userId: string, companyId: string, documentIds: string[]) {
  const { data: docs } = await supabase.from("documents").select("id, company_id, uploaded_by, file_type, storage_path, original_filename").in("id", documentIds);
  if (!docs || docs.length !== documentIds.length) throw new HttpError(404, "A photo could not be found. Upload it again.", "not_found");
  const files: { mime: string; data: Buffer }[] = [];
  for (const d of docs) {
    if (d.company_id !== companyId || d.uploaded_by !== userId) throw new HttpError(403, "You can only use photos you uploaded yourself.", "forbidden");
    if (!["photo", "screenshot", "pdf"].includes(d.file_type)) throw new HttpError(400, "Upload the menu as a photo, a screenshot or a PDF.", "unsupported_file");
    const { data: blob, error } = await supabase.storage.from("documents").download(d.storage_path);
    if (error || !blob) throw new HttpError(500, "The photo could not be retrieved. Upload it again.", "download_failed");
    const buffer = await blob.arrayBuffer();
    if (buffer.byteLength > MAX_FILE_BYTES) throw new HttpError(413, "A photo is larger than 12 MB. Upload a smaller copy.", "file_too_large");
    const inspected = await inspectFile({ buffer, filename: d.original_filename, fileType: d.file_type, spreadsheetCharLimit: 0 });
    if (inspected.imageQuality?.veryPoor) {
      throw new HttpError(422, `This photo is too small or too blurry to read reliably (${inspected.warnings.filter((w) => /very small|extremely blurry/.test(w)).join(" ") || "very low quality"}). Retake it flat, in good light and in focus.`, "image_too_poor");
    }
    if (inspected.mime === "image/heic" || inspected.mime === "image/heif") throw new HttpError(422, "HEIC photos cannot be read here. Take a screenshot or save the photo as JPG, then upload it.", "heic_unsupported");
    files.push({ mime: inspected.mime, data: Buffer.from(buffer) });
  }
  return files;
}

class HttpError extends Error {
  constructor(readonly status: number, message: string, readonly code: string) {
    super(message);
  }
}

function sessionsFromRead(read: ReadMenu, recipes: RecipeRef[], draft: EventDraft | null): KSession[] {
  const many = read.sessions.length > 1;
  const sessions: KSession[] = read.sessions.map((s, idx) => {
    let pax = s.pax ?? (many ? null : read.pax);
    let paxSource: KSession["paxSource"] = pax !== null ? "photo" : null;
    if (pax === null && draft) {
      // "do not ask for what the event order already says": the same number of sessions are matched in order, a single session takes the total
      if (draft.ctx.sessions.length === read.sessions.length && draft.sessions[idx]?.pax) {
        pax = draft.sessions[idx].pax;
        paxSource = "event";
      } else if (!many) {
        const total = draft.ctx.sessions.reduce((t, x) => t + x.pax, 0);
        if (total > 0) {
          pax = total;
          paxSource = "event";
        }
      }
    }
    return { id: newId("s"), name: s.name ?? (many ? `Session ${idx + 1}` : "Menu"), pax, paxSource, items: s.items.map((i) => makeItem(i.name, "photo", recipes, i.note)) };
  });
  return sessions;
}

function sessionsFromEvent(draft: EventDraft, recipes: RecipeRef[]): KSession[] {
  return draft.sessions.map((s) => ({ id: newId("s"), name: s.name, pax: s.pax, paxSource: s.pax ? ("event" as const) : null, items: s.menu.map((m) => makeItem(m, "event", recipes)) }));
}

/** The reply for the current view; the by-supplier list needs the supplier prices, so it is read from the database here. */
async function replyForAsync(supabase: DB, state: KState, calc: CalcResult, lang: Lang): Promise<string> {
  if (state.view !== "suppliers") return replyFor(state, calc, lang);
  const plan = await loadPurchasePlan(supabase, state.companyId, calc.combined, state.stockCompared, lang);
  return [ingredientsText(state, calc, lang), purchaseText(plan, lang)].join("\n\n");
}

function replyFor(state: KState, calc: CalcResult, lang: Lang): string {
  switch (state.view) {
    case "ingredients":
      return ingredientsText(state, calc, lang);
    case "shopping":
      return shoppingText(state, calc, lang);
    case "dish":
      return dishText(state, calc, lang);
    default:
      return reviewText(state, calc, lang);
  }
}

/** Writes AI estimates for dishes that have no recipe. The estimate is labelled, kept apart and must be reviewed. */
async function runEstimates(state: KState, which: string[] | "all-missing", lang: Lang): Promise<{ lines: string[]; done: number }> {
  const L = text(lang);
  const targets: { item: KItem; pax: number | null }[] = [];
  for (const s of state.sessions) {
    for (const item of s.items) {
      const wanted = which === "all-missing" ? !item.recipeId && !item.estimate : which.includes(item.id);
      if (wanted) targets.push({ item, pax: s.pax });
    }
  }
  if (targets.length === 0) return { lines: [L.estimateNone], done: 0 };
  const limited = targets.slice(0, 6);
  const results = await Promise.allSettled(limited.map((t) => estimateDish(t.item.name, t.pax ?? 100)));
  const ok: string[] = [];
  const bad: string[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      limited[i].item.estimate = r.value;
      limited[i].item.recipeId = null;
      limited[i].item.recipeBy = null;
      ok.push(limited[i].item.name);
    } else bad.push(limited[i].item.name);
  });
  const lines: string[] = [];
  if (ok.length > 0) lines.push(fill(L.estimateDone, ok.join(", ")));
  if (bad.length > 0) lines.push(fill(L.estimateFailed, bad.join(", ")));
  if (targets.length > limited.length) lines.push(`(${targets.length - limited.length} more dishes: ask again for the rest.)`);
  return { lines, done: ok.length };
}

export async function GET(request: Request) {
  const session = await getSessionContext();
  if (!session) return fail(401, "Not signed in.", "unauthorized");
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);

  // the companies the user may use for a menu photo and, when opened from an event order, that order
  if (searchParams.get("meta")) {
    const { data: allCompanies } = await supabase.from("companies").select("id, name").order("name");
    const { accessibleIds } = resolveCompanyScope(session, allCompanies ?? [], undefined);
    const companies = (allCompanies ?? []).filter((c) => accessibleIds.includes(c.id));
    const eventId = searchParams.get("event");
    const draft = eventId ? await loadEventDraft(supabase, eventId) : null;
    const event = draft && accessibleIds.includes(draft.companyId) ? { id: draft.ctx.id, name: draft.ctx.name, date: draft.ctx.date, companyId: draft.companyId } : null;
    return NextResponse.json({ companies, event });
  }

  const conversationId = searchParams.get("conversationId");
  if (!conversationId) return fail(400, "conversationId is required", "bad_request");
  const ks = await loadSession(supabase, conversationId);
  if (!ks) return NextResponse.json({ state: null });
  const [calc, recipeOptions] = await Promise.all([computeAll(supabase, ks.state, ks.state.stockCompared), loadRecipeRefs(supabase, ks.companyId)]);
  return NextResponse.json({ state: ks.state, calc, recipeOptions });
}

type Body = {
  action?: "start" | "message" | "patch" | "purchase";
  conversationId?: string;
  companyId?: string;
  eventId?: string;
  documentIds?: string[];
  text?: string;
  patch?: Record<string, unknown>;
  lang?: string;
  pageLabel?: string;
};

export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return fail(401, "Not signed in.", "unauthorized");
  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body?.action) return fail(400, "action is required", "bad_request");
  const lang: Lang = body.lang === "ms" ? "ms" : "en";
  const L = text(lang);
  const supabase = await createClient();
  const pageLabel = body.pageLabel ?? "AI Assistant";

  try {
    // ------------------------------------------------------------------------------------------------------- start
    if (body.action === "start") {
      const documentIds = (body.documentIds ?? []).slice(0, MAX_FILES);
      if (documentIds.length === 0 && !body.eventId) return fail(400, "Upload a photo of the menu, or open this from an event order.", "bad_request");

      const { data: allCompanies } = await supabase.from("companies").select("id, name");
      const companies = allCompanies ?? [];
      const { accessibleIds } = resolveCompanyScope(session, companies, undefined);

      let draft: EventDraft | null = null;
      if (body.eventId) {
        draft = await loadEventDraft(supabase, body.eventId);
        if (!draft) return fail(404, "That event order was not found, or you do not have access to it.", "not_found");
      }
      const companyId = draft?.companyId ?? body.companyId;
      if (!companyId || !accessibleIds.includes(companyId)) return fail(403, "Choose a company you have access to.", "forbidden");
      const companyName = companies.find((c) => c.id === companyId)?.name ?? "";

      if ((await countTodayUserMessages(supabase)) >= DAILY_MESSAGE_LIMIT) return fail(429, "You have reached today's limit for the AI Assistant. It resets tomorrow.", "limit");
      if (documentIds.length > 0 && !getAiProvider()) return fail(503, "Reading photos needs the AI service, which is not configured on this server.", "not_configured");

      const recipes = await loadRecipeRefs(supabase, companyId);
      let sessions: KSession[];
      let read: ReadMenu | null = null;
      if (documentIds.length > 0) {
        const files = await loadFiles(supabase, session.userId, companyId, documentIds);
        read = await readMenuImages(files);
        if (read.sessions.length === 0) {
          return fail(422, `No menu items could be read from the photo${read.issues.length ? ` (${read.issues.join(" ")})` : ""}. Take a clearer, flat photo of the menu, or type the dishes.`, "nothing_read");
        }
        sessions = sessionsFromRead(read, recipes, draft);
      } else {
        sessions = sessionsFromEvent(draft!, recipes);
        if (sessions.every((s) => s.items.length === 0)) return fail(422, "This event order has no menu written yet.", "nothing_read");
      }

      const state: KState = {
        version: 1,
        companyId,
        companyName,
        event: draft?.ctx ?? null,
        photoEventName: read?.eventName ?? null,
        sessions,
        documentIds,
        unitMode: "auto",
        mismatches: [],
        readerIssues: read?.issues ?? [],
        view: "review",
        viewDish: null,
        stockCompared: false,
      };
      if (draft && read) {
        const cmp = compareWithEvent(state.sessions.map((s) => ({ name: s.name, pax: s.paxSource === "photo" ? s.pax : null, dishes: s.items.map((i) => i.name) })), draft.ctx);
        if (cmp.onlyInPhoto.length > 0) state.mismatches.push(fill(L.onlyPhoto, cmp.onlyInPhoto.join(", ")));
        if (cmp.onlyInOrder.length > 0) state.mismatches.push(fill(L.onlyOrder, cmp.onlyInOrder.join(", ")));
        for (const p of cmp.paxDiffers) state.mismatches.push(fill(L.paxDiffers, p.photo, p.order));
      }
      // a menu whose pax is known and whose dishes all have a recipe goes straight to the ingredient list ("do not ask for what is
      // already stated"); otherwise the person first reviews the menu and what is still missing
      if (state.mismatches.length === 0 && state.sessions.every((s) => s.pax !== null && s.items.length > 0 && s.items.every((i) => i.recipeId))) state.view = "ingredients";

      let conversationId = body.conversationId;
      if (!conversationId) conversationId = await createConversation(supabase, session.userId, companyId, `Kitchen: ${draft?.ctx.name ?? read?.eventName ?? "menu photo"}`.slice(0, 60));
      await saveMessage(supabase, conversationId, "user", documentIds.length > 0 ? `📷 Menu photo${documentIds.length > 1 ? `s (${documentIds.length})` : ""}${draft ? ` — ${draft.ctx.name}` : ""}` : `Ingredient list from the event order: ${draft!.ctx.name}`, pageLabel);
      const calc = await computeAll(supabase, state, false);
      const reply = replyFor(state, calc, lang);
      const messageId = await saveMessage(supabase, conversationId, "assistant", reply, pageLabel);
      await saveState(supabase, conversationId, session.userId, state);
      await touchConversation(supabase, conversationId);
      return NextResponse.json({ conversationId, reply, messageId, state, calc, recipeOptions: recipes });
    }

    // the other actions work on an existing kitchen session
    if (!body.conversationId) return fail(400, "conversationId is required", "bad_request");
    const ks = await loadSession(supabase, body.conversationId);
    if (!ks) return fail(404, "This kitchen conversation was not found. Start again by uploading the menu.", "not_found");
    const conversationId = body.conversationId;
    const recipes = await loadRecipeRefs(supabase, ks.companyId);
    const reviewer = session.fullName;

    // ------------------------------------------------------------------------------------------------------- patch
    if (body.action === "patch") {
      const p = body.patch ?? {};
      const state: KState = structuredClone(ks.state);
      const sessionOf = (id: unknown) => state.sessions.find((s) => s.id === id);
      const findItem = (id: unknown) => state.sessions.flatMap((s) => s.items.map((i) => ({ i, s }))).find((x) => x.i.id === id);
      let reply: string | null = null;
      let userNote: string | null = null;
      let estimateWhich: string[] | null = null;

      switch (p.kind) {
        case "pax": {
          const s = sessionOf(p.sessionId);
          const pax = typeof p.pax === "number" ? Math.round(p.pax) : NaN;
          if (!s || !(pax >= 1 && pax <= 100000)) return fail(400, "Enter a pax between 1 and 100000.", "bad_request");
          s.pax = pax;
          s.paxSource = "user";
          break;
        }
        case "rename_session": {
          const s = sessionOf(p.sessionId);
          if (s && typeof p.name === "string" && p.name.trim()) s.name = p.name.trim().slice(0, 60);
          break;
        }
        case "rename_item": {
          const f = findItem(p.itemId);
          if (f && typeof p.name === "string" && p.name.trim()) {
            const fresh = makeItem(p.name.trim().slice(0, 120), "typed", recipes, f.i.note);
            fresh.id = f.i.id;
            f.s.items = f.s.items.map((x) => (x.id === f.i.id ? fresh : x));
          }
          break;
        }
        case "remove_item": {
          const f = findItem(p.itemId);
          if (f) f.s.items = f.s.items.filter((x) => x.id !== f.i.id);
          break;
        }
        case "add_item": {
          const s = sessionOf(p.sessionId) ?? state.sessions[0];
          if (s && typeof p.name === "string" && p.name.trim()) s.items.push(makeItem(p.name.trim().slice(0, 120), "typed", recipes));
          break;
        }
        case "set_recipe": {
          const f = findItem(p.itemId);
          if (!f) break;
          if (typeof p.recipeId === "string" && recipes.some((r) => r.id === p.recipeId)) {
            f.i.recipeId = p.recipeId;
            f.i.recipeBy = "user";
            f.i.estimate = null;
          } else {
            f.i.recipeId = null;
            f.i.recipeBy = null;
            f.i.candidates = candidatesFor(f.i.name, recipes);
          }
          break;
        }
        case "estimate": {
          const f = findItem(p.itemId);
          if (f) estimateWhich = [f.i.id];
          break;
        }
        case "approve": {
          for (const s of state.sessions) for (const i of s.items) if (i.estimate?.status === "pending") i.estimate = { ...i.estimate, status: "reviewed", reviewedBy: reviewer, reviewedAt: new Date().toISOString() };
          break;
        }
        case "view": {
          const v = p.view;
          if (v === "ingredients" || v === "shopping" || v === "suppliers") {
            state.view = v;
            state.viewDish = null;
            userNote = v === "ingredients" ? "Generate Ingredients" : v === "shopping" ? "Generate Shopping List" : "Purchase by Supplier";
          }
          break;
        }
        case "stock": {
          state.stockCompared = true;
          userNote = "Compare with stock";
          break;
        }
        case "unit_mode": {
          state.unitMode = p.mode === "kg" ? "kg" : "auto";
          break;
        }
        default:
          return fail(400, "Unknown change.", "bad_request");
      }
      if (estimateWhich) {
        const bad = state.sessions.find((s) => s.items.some((i) => estimateWhich!.includes(i.id)) && s.pax === null);
        if (bad) return fail(400, L.estimateNeedPax, "bad_request");
        const est = await runEstimates(state, estimateWhich, lang);
        reply = est.lines.join("\n");
        userNote = "AI estimate";
      }
      // editing the menu or the pax invalidates the differences found at the start
      if (p.kind !== "view" && p.kind !== "stock" && p.kind !== "unit_mode" && p.kind !== "approve") state.mismatches = [];
      const calc = await computeAll(supabase, state, state.stockCompared);
      let messageId: string | null = null;
      if (p.kind === "view" || p.kind === "stock" || estimateWhich) {
        const text0 = p.kind === "stock" ? stockText(state, calc, lang) : p.kind === "view" ? await replyForAsync(supabase, state, calc, lang) : [reply, replyFor({ ...state, view: state.view === "review" ? "review" : state.view }, calc, lang)].filter(Boolean).join("\n\n");
        await saveMessage(supabase, conversationId, "user", userNote ?? "", pageLabel);
        messageId = await saveMessage(supabase, conversationId, "assistant", text0, pageLabel);
        reply = text0;
        await touchConversation(supabase, conversationId);
      }
      await saveState(supabase, conversationId, session.userId, state);
      return NextResponse.json({ conversationId, reply, messageId, state, calc, recipeOptions: recipes });
    }

    // ---------------------------------------------------------------------------------------------------- purchase
    // the by-supplier list for the PDF / print (always the current menu, pax and recipes)
    if (body.action === "purchase") {
      const calc = await computeAll(supabase, ks.state, ks.state.stockCompared);
      const purchase = await loadPurchasePlan(supabase, ks.state.companyId, calc.combined, ks.state.stockCompared, lang);
      return NextResponse.json({ conversationId, purchase, state: ks.state, calc });
    }

    // ----------------------------------------------------------------------------------------------------- message
    if (body.action === "message") {
      const message = (body.text ?? "").trim().slice(0, 500);
      if (!message) return fail(400, "message is required", "bad_request");
      if ((await countTodayUserMessages(supabase)) >= DAILY_MESSAGE_LIMIT) return fail(429, "You have reached today's limit for the AI Assistant. It resets tomorrow.", "limit");
      await saveMessage(supabase, conversationId, "user", message, pageLabel);

      let ops: Op[] | null = sessionPaxShortcut(message, ks.state) ? [sessionPaxShortcut(message, ks.state)!] : parseCommand(message);
      // a bare number answers the question "how many pax?"
      if (!ops && /^\d[\d,]{0,5}$/.test(message)) ops = [{ type: "set_pax", pax: Number(message.replace(/,/g, "")) }];
      if (!ops) {
        const summary = ks.state.sessions.map((s) => `${s.name} (${s.pax ?? "pax not set"}): ${s.items.map((i) => i.name).join(", ")}`).join("\n");
        const viaAi = await interpretWithAi(message, summary);
        ops = viaAi.length > 0 ? viaAi : null;
      }
      if (!ops) {
        const reply = `${lang === "ms" ? "Saya tidak faham permintaan itu." : "I did not understand that request."}\n\n${helpText(lang)}`;
        const messageId = await saveMessage(supabase, conversationId, "assistant", reply, pageLabel);
        const calc = await computeAll(supabase, ks.state, ks.state.stockCompared);
        return NextResponse.json({ conversationId, reply, messageId, state: ks.state, calc, recipeOptions: recipes });
      }

      const applied = applyOps(ks.state, ops, recipes, reviewer);
      const state = applied.state;
      const lines: string[] = [];
      let exportNow = false;
      const changedPax = ops.some((o) => o.type === "set_pax" || o.type === "add_pax");
      const askedView = ops.some((o) => o.type === "view" || o.type === "unit_mode" || o.type === "stock");
      if (changedPax && !askedView && state.sessions.every((s) => s.pax !== null)) state.view = "ingredients";

      const changed = changesText(applied.changes, lang);
      if (changed) lines.push(changed);

      if (applied.effects.estimateItemIds) {
        const needsPax = state.sessions.some((s) => s.pax === null && s.items.some((i) => (applied.effects.estimateItemIds === "all-missing" ? !i.recipeId && !i.estimate : (applied.effects.estimateItemIds as string[]).includes(i.id))));
        if (needsPax) lines.push(L.estimateNeedPax);
        else lines.push(...(await runEstimates(state, applied.effects.estimateItemIds, lang)).lines);
        if (state.view === "review" && state.sessions.every((s) => s.pax !== null)) state.view = "ingredients";
      }
      if (applied.effects.help) lines.push(helpText(lang));
      if (applied.effects.export) {
        exportNow = true;
        lines.push(L.exportReady);
      }
      if (state.view === "review" && (applied.effects.export || applied.effects.stock) && state.sessions.every((s) => s.pax !== null)) state.view = "ingredients";

      const withStock = state.stockCompared || applied.effects.stock;
      const calc = await computeAll(supabase, state, withStock);
      const onlyErrors = applied.changes.length > 0 && applied.changes.every((c: Change) => c.kind === "error");
      if (applied.effects.stock) lines.push(stockText(state, calc, lang));
      else if (!applied.effects.help && !applied.effects.export && !onlyErrors) lines.push(await replyForAsync(supabase, state, calc, lang));
      else if (onlyErrors) lines.push(reviewText(state, calc, lang));
      const reply = lines.filter(Boolean).join("\n\n");

      const messageId = await saveMessage(supabase, conversationId, "assistant", reply, pageLabel);
      await saveState(supabase, conversationId, session.userId, state);
      await touchConversation(supabase, conversationId);
      return NextResponse.json({ conversationId, reply, messageId, state, calc, recipeOptions: recipes, export: exportNow });
    }

    return fail(400, "Unknown action.", "bad_request");
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code);
    if (err instanceof KitchenAiError) return fail(err.code === "not_configured" ? 503 : err.code === "blocked" ? 422 : 502, err.message, err.code);
    const message = err instanceof Error ? err.message : typeof err === "object" && err && "message" in err ? String((err as { message: unknown }).message) : "Something went wrong.";
    return fail(500, message, "server_error");
  }
}
