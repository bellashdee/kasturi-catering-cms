/**
 * Structured, privacy-safe diagnostics for the extraction pipeline (visible in Vercel runtime logs). Only ids, counts,
 * types, durations and error codes are logged — never document text, extracted values, names, amounts or bank details.
 */
export function logExtraction(stage: string, fields: Record<string, string | number | boolean | null | undefined> = {}): void {
  console.log(JSON.stringify({ evt: "extract", stage, at: new Date().toISOString(), ...fields }));
}

/** Error text safe to log: first line only, long digit runs masked, capped in length. */
export function safeMessage(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  return text.split("\n")[0].replace(/\d{6,}/g, "#").slice(0, 200);
}
