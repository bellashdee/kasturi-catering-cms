import type { Op } from "./intent";
import { autoMatch, candidatesFor, findByPhrase, similarity, type RecipeRef } from "./match";
import type { KItem, KSession, KState } from "./types";

export type Effects = {
  export: boolean;
  stock: boolean;
  help: boolean;
  /** dishes the person asked to be estimated by the AI */
  estimateItemIds: string[] | "all-missing" | null;
};

export type ApplyResult = {
  state: KState;
  /** what changed, in plain words (language keys are filled by the formatter) */
  changes: Change[];
  effects: Effects;
};

export type Change =
  | { kind: "pax"; sessions: string[]; pax: number }
  | { kind: "removed"; name: string }
  | { kind: "replaced"; from: string; to: string; matched: string | null }
  | { kind: "added"; name: string; matched: string | null }
  | { kind: "recipe"; item: string; recipe: string }
  | { kind: "approved"; count: number }
  | { kind: "unit"; mode: "kg" | "auto" }
  | { kind: "error"; code: "no_session" | "no_item" | "no_recipe" | "no_pax" | "unclear"; detail: string };

let counter = 0;
export const newId = (prefix: string) => `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}`;

/** A new dish: matched to a recipe automatically only when one clearly fits; other possible recipes are kept as suggestions. */
export function makeItem(name: string, origin: KItem["origin"], recipes: RecipeRef[], note: string | null = null): KItem {
  const best = autoMatch(name, recipes);
  return {
    id: newId("i"),
    name,
    recipeId: best?.recipeId ?? null,
    recipeBy: best ? "auto" : null,
    candidates: candidatesFor(name, recipes),
    estimate: null,
    origin,
    note,
  };
}

function targetSessions(state: KState, hint: string | undefined): KSession[] {
  if (state.sessions.length <= 1 || !hint) return state.sessions;
  const hit = findByPhrase(hint, state.sessions.map((s) => ({ name: s.name, s })));
  return hit ? [hit.s] : state.sessions;
}

function allItems(state: KState): { item: KItem; session: KSession }[] {
  return state.sessions.flatMap((session) => session.items.map((item) => ({ item, session })));
}

function findItem(state: KState, phrase: string): { item: KItem; session: KSession } | null {
  const hit = findByPhrase(phrase, allItems(state).map((x) => ({ name: x.item.name, x })));
  return hit ? hit.x : null;
}

/** "lunch 200" / "dinner: 150 pax" when the first word is one of the session names. */
export function sessionPaxShortcut(text: string, state: KState): Op | null {
  const m = text.trim().match(/^([a-z][a-z0-9 ]{1,30}?)\s*[:=-]?\s*(\d[\d,]*)\s*(?:pax|orang|people)?$/i);
  if (!m || state.sessions.length < 2) return null;
  const hit = findByPhrase(m[1], state.sessions.map((s) => ({ name: s.name })));
  return hit ? { type: "set_pax", pax: Number(m[2].replace(/,/g, "")), session: hit.name } : null;
}

export function applyOps(input: KState, ops: Op[], recipes: RecipeRef[], reviewer: string): ApplyResult {
  const state: KState = structuredClone(input);
  const changes: Change[] = [];
  const effects: Effects = { export: false, stock: false, help: false, estimateItemIds: null };

  for (const op of ops) {
    switch (op.type) {
      case "set_pax": {
        const sessions = targetSessions(state, op.session);
        if (sessions.length === 0) {
          changes.push({ kind: "error", code: "no_session", detail: "" });
          break;
        }
        for (const s of sessions) {
          s.pax = op.pax;
          s.paxSource = "user";
        }
        changes.push({ kind: "pax", sessions: sessions.map((s) => s.name), pax: op.pax });
        break;
      }
      case "add_pax": {
        const sessions = targetSessions(state, op.session);
        const missing = sessions.filter((s) => s.pax === null);
        if (sessions.length === 0 || missing.length === sessions.length) {
          changes.push({ kind: "error", code: "no_pax", detail: "" });
          break;
        }
        for (const s of sessions) if (s.pax !== null) s.pax = Math.max(1, s.pax + op.delta);
        changes.push({ kind: "pax", sessions: sessions.filter((s) => s.pax !== null).map((s) => s.name), pax: sessions.find((s) => s.pax !== null)!.pax! });
        break;
      }
      case "remove_item": {
        const hit = findItem(state, op.phrase);
        if (!hit) {
          changes.push({ kind: "error", code: "no_item", detail: op.phrase });
          break;
        }
        hit.session.items = hit.session.items.filter((i) => i.id !== hit.item.id);
        changes.push({ kind: "removed", name: hit.item.name });
        break;
      }
      case "replace_item": {
        const hit = findItem(state, op.from);
        if (!hit) {
          changes.push({ kind: "error", code: "no_item", detail: op.from });
          break;
        }
        const fresh = makeItem(op.to, hit.item.origin === "photo" ? "typed" : hit.item.origin, recipes);
        hit.session.items = hit.session.items.map((i) => (i.id === hit.item.id ? fresh : i));
        changes.push({ kind: "replaced", from: hit.item.name, to: op.to, matched: fresh.recipeId ? recipes.find((r) => r.id === fresh.recipeId)?.name ?? null : null });
        break;
      }
      case "add_item": {
        const session = targetSessions(state, op.session)[0] ?? state.sessions[0];
        if (!session) {
          changes.push({ kind: "error", code: "no_session", detail: "" });
          break;
        }
        const fresh = makeItem(op.name, "typed", recipes);
        session.items.push(fresh);
        changes.push({ kind: "added", name: op.name, matched: fresh.recipeId ? recipes.find((r) => r.id === fresh.recipeId)?.name ?? null : null });
        break;
      }
      case "use_recipe": {
        const hit = findItem(state, op.phrase);
        if (!hit) {
          changes.push({ kind: "error", code: "no_item", detail: op.phrase });
          break;
        }
        const exact = recipes.filter((r) => r.hasIngredients).map((r) => ({ r, s: similarity(op.recipe, r.name) })).sort((a, b) => b.s - a.s)[0];
        if (!exact || exact.s < 0.6) {
          changes.push({ kind: "error", code: "no_recipe", detail: op.recipe });
          break;
        }
        hit.item.recipeId = exact.r.id;
        hit.item.recipeBy = "user";
        hit.item.estimate = null;
        changes.push({ kind: "recipe", item: hit.item.name, recipe: exact.r.name });
        break;
      }
      case "view":
        state.view = op.view;
        state.viewDish = op.view === "dish" ? op.dish ?? null : null;
        break;
      case "unit_mode":
        state.unitMode = op.mode;
        changes.push({ kind: "unit", mode: op.mode });
        break;
      case "stock":
        state.stockCompared = true;
        effects.stock = true;
        break;
      case "export":
        effects.export = true;
        break;
      case "help":
        effects.help = true;
        break;
      case "estimate": {
        if (!op.phrase) {
          effects.estimateItemIds = "all-missing";
          break;
        }
        const hit = findItem(state, op.phrase);
        if (!hit) {
          changes.push({ kind: "error", code: "no_item", detail: op.phrase });
          break;
        }
        effects.estimateItemIds = [...(Array.isArray(effects.estimateItemIds) ? effects.estimateItemIds : []), hit.item.id];
        break;
      }
      case "approve": {
        let count = 0;
        for (const { item } of allItems(state)) {
          if (item.estimate && item.estimate.status === "pending") {
            item.estimate.status = "reviewed";
            item.estimate.reviewedBy = reviewer;
            item.estimate.reviewedAt = new Date().toISOString();
            count++;
          }
        }
        changes.push({ kind: "approved", count });
        break;
      }
    }
  }
  return { state, changes, effects };
}

/** Dishes with neither a recipe nor an estimate. */
export function dishesWithoutRecipe(state: KState): KItem[] {
  return allItems(state).filter((x) => !x.item.recipeId && !x.item.estimate).map((x) => x.item);
}
