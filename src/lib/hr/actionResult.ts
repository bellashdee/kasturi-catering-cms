/**
 * Server actions return expected problems as values instead of throwing: in a production build Next.js hides the
 * message of a thrown error from the browser, so users would only see a generic failure.
 * (Not a "use server" file, so it may export a class.)
 */
export class UserError extends Error {}

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Runs an action body. A UserError carries a message that is safe and useful to show to the user;
 * anything else is unexpected, so it is logged on the server and the user gets a generic message
 * (no internal details, no personal data).
 */
export async function runAction<T>(body: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await body() };
  } catch (err) {
    if (err instanceof UserError) return { ok: false, error: err.message };
    console.error("Unexpected action failure:", err instanceof Error ? err.name : "unknown");
    return { ok: false, error: "Something went wrong. Please try again, or contact support if it keeps happening." };
  }
}
