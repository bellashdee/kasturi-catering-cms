import type { ExtractionReport } from "@/lib/extraction/types";

export type ExtractionResponse = {
  configured?: boolean;
  // Shown as-is by callers that expect a string when `configured` is false.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  message?: any;
  // Each module reads its own field shape from here, as it always did.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extracted?: any;
  report?: ExtractionReport;
  /** Always a readable reason when the call failed — never undefined on failure. */
  error?: string;
  code?: string;
};

function explainHttp(status: number): string {
  if (status === 401 || status === 403) return "Your session has expired or you do not have access to this file. Sign in again and retry.";
  if (status === 404) return "The uploaded file could not be found on the server. Upload it again.";
  if (status === 413) return "The file is too large for the server to accept. Upload a smaller or compressed copy.";
  if (status === 502 || status === 504 || status === 524) {
    return "Reading took longer than the server allows (the AI service was slow, or the file has many pages). The file is saved — try again, or upload fewer pages.";
  }
  return `The server returned an unexpected error (HTTP ${status}) instead of a result.`;
}

/**
 * The one place the browser calls the extraction API. It never throws on a bad response and never returns an empty
 * result without a reason: a non-JSON body (e.g. a platform timeout page), a dropped connection, or a 200 answer with
 * no data all come back as `{ error, code }` so the form can tell the user what happened.
 */
export async function requestExtraction(documentId: string, kind: string): Promise<{ res: { ok: boolean; status: number }; result: ExtractionResponse }> {
  const started = Date.now();
  let res: Response;
  try {
    res = await fetch("/api/extract-document", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId, kind }),
      signal: AbortSignal.timeout(90_000),
    });
  } catch {
    console.warn("[extract] request failed before any response", { kind, ms: Date.now() - started });
    return {
      res: { ok: false, status: 0 },
      result: { error: "Could not reach the server (no internet, or the request took too long). The file is saved — check your connection and try again.", code: "network" },
    };
  }

  const text = await res.text().catch(() => "");
  let result: ExtractionResponse | null = null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === "object") result = parsed as ExtractionResponse;
  } catch {
    result = null;
  }

  if (!result) {
    result = { error: explainHttp(res.status), code: `http_${res.status}` };
  } else if (!res.ok && !result.error) {
    result.error = explainHttp(res.status);
    result.code = result.code ?? `http_${res.status}`;
  } else if (res.ok && result.configured !== false && (!result.extracted || typeof result.extracted !== "object")) {
    result.error = "The server answered but returned no extracted data. Try again, or enter the details manually.";
    result.code = "empty_response";
  }

  console.debug("[extract] response", {
    kind,
    status: res.status,
    ms: Date.now() - started,
    code: result.code ?? null,
    fieldsReturned: result.extracted ? Object.keys(result.extracted).length : 0,
    hasReport: !!result.report,
  });
  const failed = !res.ok || (!!result.error && result.configured !== false);
  return { res: { ok: res.ok && !failed, status: res.status }, result };
}
