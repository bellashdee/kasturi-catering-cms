import { errorMessage } from "@/lib/actionResult";
import { isOfflineOp, type Mutation, type MutationOutcome, type OfflineOp } from "@/lib/offline/types";

/** What a handler decides about one change. */
export type HandlerResult =
  | { status: "applied"; recordId?: string }
  | { status: "duplicate"; recordId?: string }
  | { status: "conflict"; table: string; serverVersion: Record<string, unknown> | null; message: string }
  | { status: "rejected"; error: string };

export type Handler<Ctx> = (ctx: Ctx, mutation: Mutation) => Promise<HandlerResult>;

/** The record of changes already received (offline_mutations / sync_conflicts in the database; in memory in the tests). */
export type MutationLog = {
  get(id: string): Promise<{ status: string; result: unknown; userId: string } | null>;
  save(entry: { mutation: Mutation; status: "applied" | "conflict" | "rejected"; result: unknown }): Promise<void>;
  saveConflict(entry: { mutation: Mutation; table: string; serverVersion: Record<string, unknown> | null }): Promise<void>;
};

/** A message thrown by a check the person can act on ("Choose the reason.") rejects the change; anything else is tried again later. */
export class Rejection extends Error {}

const MAX_BATCH = 50;

/**
 * Applies the changes of one device, in the order they were made, as the signed-in person. The same change sent twice is applied
 * once: a change recorded as applied returns its earlier answer; the handlers also use the change's record id as the new row's key.
 */
export async function processMutations<Ctx>(opts: {
  ctx: Ctx;
  userId: string;
  deviceId: string;
  mutations: unknown;
  handlers: Partial<Record<OfflineOp, Handler<Ctx>>>;
  log: MutationLog;
}): Promise<MutationOutcome[]> {
  const list = Array.isArray(opts.mutations) ? opts.mutations.slice(0, MAX_BATCH) : [];
  const outcomes: MutationOutcome[] = [];
  let blocked = false;
  for (const raw of list) {
    const m = raw as Mutation;
    const id = typeof m?.id === "string" ? m.id : "";
    if (!/^[0-9a-f-]{36}$/i.test(id)) continue;
    // a passing problem stops the rest of the batch, so the changes of one device are always applied in the order they were made
    if (blocked) {
      outcomes.push({ id, status: "retry", error: "Waiting for the change before it." });
      continue;
    }
    if (m.userId !== opts.userId) {
      outcomes.push({ id, status: "rejected", error: "This change was made by another person. Sign in as that person to send it." });
      continue;
    }
    if (!isOfflineOp(m.op) || !opts.handlers[m.op] || typeof m.recordId !== "string" || !m.payload || typeof m.payload !== "object") {
      outcomes.push({ id, status: "rejected", error: "This kind of change cannot be sent from the offline queue." });
      continue;
    }
    const mutation: Mutation = { ...m, deviceId: opts.deviceId };
    try {
      const earlier = await opts.log.get(id);
      if (earlier && earlier.userId !== opts.userId) {
        outcomes.push({ id, status: "rejected", error: "This change id was already used." });
        continue;
      }
      if (earlier?.status === "applied") {
        const r = (earlier.result ?? {}) as { recordId?: string };
        outcomes.push({ id, status: "duplicate", recordId: r.recordId });
        continue;
      }
      let result: HandlerResult;
      try {
        result = await opts.handlers[m.op]!(opts.ctx, mutation);
      } catch (err) {
        if (err instanceof Rejection) result = { status: "rejected", error: err.message };
        else throw err;
      }
      if (result.status === "applied" || result.status === "duplicate") {
        await opts.log.save({ mutation, status: "applied", result: { recordId: result.recordId ?? mutation.recordId } });
        outcomes.push({ id, status: result.status, recordId: result.recordId ?? mutation.recordId });
      } else if (result.status === "conflict") {
        await opts.log.save({ mutation, status: "conflict", result: { message: result.message } });
        await opts.log.saveConflict({ mutation, table: result.table, serverVersion: result.serverVersion });
        outcomes.push({ id, status: "conflict", serverVersion: result.serverVersion, message: result.message });
      } else {
        await opts.log.save({ mutation, status: "rejected", result: { error: result.error } });
        outcomes.push({ id, status: "rejected", error: result.error });
      }
    } catch (err) {
      blocked = true;
      outcomes.push({ id, status: "retry", error: errorMessage(err, "The server could not save this change now. It will be tried again.") });
    }
  }
  return outcomes;
}

/** Two values are the same change (numbers kept as text by the database compare as numbers). */
export function sameValues(row: Record<string, unknown> | null, values: Record<string, unknown>): boolean {
  if (!row) return false;
  return Object.entries(values).every(([k, v]) => {
    const r = row[k];
    if (v === null || v === undefined || v === "") return r === null || r === undefined || r === "";
    if (typeof v === "number") return Number(r) === v;
    if (Array.isArray(v)) return Array.isArray(r) && r.length === v.length && v.every((x, i) => x === r[i]);
    return String(r) === String(v);
  });
}
