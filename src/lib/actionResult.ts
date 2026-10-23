/**
 * Server actions must not throw for problems the user can fix ("enter a reason", "already clocked in", "no permission").
 * In production Next.js replaces the message of an error thrown from a server action by a generic one, which the browser then
 * shows as "Minified React error #441" and the user never learns what was wrong. An action returns this result instead.
 */
export type ActionResult<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };

type DbErrorLike = { message?: string; code?: string };

/** A readable message for anything that was thrown: an Error, a Supabase / Postgres error object or something else. */
export function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object") {
    const { message, code } = err as DbErrorLike;
    if (code === "42501" || (typeof message === "string" && /row-level security/i.test(message))) return "You do not have permission to do this.";
    if (code === "23505") return "This record already exists.";
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

/** Runs the work and turns anything it throws into `{ ok: false, error }`. */
export async function runAction<T extends object>(work: () => Promise<T>, fallback = "Something went wrong. Please try again."): Promise<ActionResult<T>> {
  try {
    return { ok: true, ...(await work()) };
  } catch (err) {
    return { ok: false, error: errorMessage(err, fallback) };
  }
}
