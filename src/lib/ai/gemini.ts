// Minimal Google Gemini client (REST) so the app can read uploads and answer assistant questions
// with a free Gemini key when no Anthropic key is configured.

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

export type AiProvider = "anthropic" | "gemini";

/** Claude is preferred when both keys exist (paid tier: data isn't used for training). */
export function getAiProvider(): AiProvider | null {
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.GEMINI_API_KEY) return "gemini";
  return null;
}

export type GeminiPart = { text: string } | { inline_data: { mime_type: string; data: string } };
export type GeminiTurn = { role: "user" | "model"; parts: GeminiPart[] };

/** Why a Gemini call failed, so callers can tell "busy, retry later" from "this request is wrong". */
export class GeminiError extends Error {
  constructor(
    message: string,
    readonly kind: "busy" | "rate_limit" | "timeout" | "bad_request" | "blocked" | "other",
    readonly status?: number,
  ) {
    super(message);
    this.name = "GeminiError";
  }
}

export type GeminiResult = { text: string; finishReason: string | null; model: string; sources?: { title: string; url: string }[] };

/**
 * Models tried in order. The preferred model is often "experiencing high demand" (HTTP 503) on the free tier, so rather
 * than waiting and retrying the same one we move on to the next, within an overall time budget.
 */
// Measured 2026-10-24: 3.6-flash, 3-flash-preview and the lite models answer in 1.5-3.5 s; 3.8-flash and 3.7-flash often hang for 30 s or
// answer "high demand", so they come last.
const FALLBACK_MODELS = ["gemini-3-flash-preview", "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.7-flash", "gemini-3.8-flash"];
/** A model that just answered "overloaded" is tried last for a couple of minutes (remembered per server instance). */
const COOLDOWN_MS = 120_000;
const overloadedAt = new Map<string, number>();

function modelChain(): string[] {
  const preferred = process.env.GEMINI_MODEL || "gemini-3.6-flash";
  const all = Array.from(new Set([preferred, ...FALLBACK_MODELS]));
  const hot = (m: string) => Date.now() - (overloadedAt.get(m) ?? 0) < COOLDOWN_MS;
  return [...all.filter((m) => !hot(m)), ...all.filter(hot)];
}

export function isLightModel(model: string | null): boolean {
  return !!model && /lite/i.test(model);
}

type RawResponse = {
  error?: { message?: string };
  candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] }; groundingMetadata?: { groundingChunks?: { web?: { uri?: string; title?: string } }[] } }[];
  promptFeedback?: { blockReason?: string };
};

export async function geminiGenerateDetailed({
  system,
  turns,
  maxOutputTokens,
  json,
  search,
  budgetMs = 52_000,
  attemptCapMs,
}: {
  system?: string;
  turns: GeminiTurn[];
  maxOutputTokens: number;
  json?: boolean;
  /** Let the model look things up on the web (Google Search) and return the pages it used. Not combined with json. */
  search?: boolean;
  /** Total time allowed across all models/attempts (the serverless function itself is limited to 60s). */
  budgetMs?: number;
  /** A model that has not answered after this long is given up on (the next model is tried): for quick chat answers. */
  attemptCapMs?: number;
}): Promise<GeminiResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new GeminiError("GEMINI_API_KEY is not set.", "other");

  const started = Date.now();
  let lastError: GeminiError | null = null;

  const chain = modelChain();
  for (const [index, model] of chain.entries()) {
    const remaining = budgetMs - (Date.now() - started);
    if (remaining < 4_000) break;
    // A hung model must not eat the whole budget while others could answer.
    const attemptMs = index === chain.length - 1 ? remaining : Math.min(attemptCapMs ?? Infinity, Math.max(20_000, remaining / 2));

    // "low" thinking keeps reading fast and leaves the output budget for the actual JSON.
    const generationConfig = {
      maxOutputTokens,
      thinkingConfig: { thinkingLevel: "low" },
      ...(json ? { responseMimeType: "application/json" } : {}),
    };
    const body = JSON.stringify({
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      contents: turns,
      generationConfig,
      ...(search && !json ? { tools: [{ google_search: {} }] } : {}),
    });

    let res: Response;
    let data: RawResponse | null = null;
    try {
      res = await fetch(`${GEMINI_ENDPOINT}/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body,
        signal: AbortSignal.timeout(Math.min(attemptMs, remaining)),
      });
      data = (await res.json().catch(() => null)) as RawResponse | null;
    } catch {
      lastError = new GeminiError("The AI service did not answer in time.", "timeout");
      overloadedAt.set(model, Date.now());
      continue; // try the next model with whatever time is left
    }

    if (res.ok) {
      const candidate = data?.candidates?.[0];
      const text = (candidate?.content?.parts ?? [])
        .filter((p) => !p.thought && typeof p.text === "string")
        .map((p) => p.text)
        .join("");
      if (!text && data?.promptFeedback?.blockReason) {
        throw new GeminiError(`The AI service refused to read this file (${data.promptFeedback.blockReason}).`, "blocked", 200);
      }
      const seen = new Set<string>();
      const sources = (candidate?.groundingMetadata?.groundingChunks ?? [])
        .map((c) => ({ title: (c.web?.title ?? "").trim(), url: c.web?.uri ?? "" }))
        .filter((c) => /^https?:\/\//.test(c.url) && !seen.has(c.url) && seen.add(c.url))
        .slice(0, 5);
      return { text, finishReason: candidate?.finishReason ?? null, model, ...(sources.length > 0 ? { sources } : {}) };
    }

    if (res.status === 429 || res.status === 503 || res.status === 500) overloadedAt.set(model, Date.now());
    if (res.status === 429 && search) throw new GeminiError("Web search is not available on this AI plan.", "rate_limit", 429);
    if (res.status === 429) lastError = new GeminiError("The AI service is busy or the free daily limit was reached.", "rate_limit", 429);
    else if (res.status === 503 || res.status === 500) lastError = new GeminiError("The AI service is temporarily overloaded.", "busy", res.status);
    else if (res.status === 404 || (res.status === 400 && /thinking|tool|search|grounding/i.test(data?.error?.message ?? ""))) {
      lastError = new GeminiError(data?.error?.message ?? `Model ${model} is not usable.`, "other", res.status);
    } else {
      throw new GeminiError(data?.error?.message ?? `AI request failed (${res.status}).`, "bad_request", res.status);
    }
  }

  throw lastError ?? new GeminiError("The AI service did not answer in time.", "timeout");
}

export async function geminiGenerate(params: {
  system?: string;
  turns: GeminiTurn[];
  maxOutputTokens: number;
  json?: boolean;
  budgetMs?: number;
  attemptCapMs?: number;
}): Promise<string> {
  try {
    return (await geminiGenerateDetailed(params)).text;
  } catch (err) {
    if (err instanceof GeminiError) {
      if (err.kind === "rate_limit") throw new Error("The AI service is busy or the free daily limit was reached. Wait a minute and try again.");
      if (err.kind === "busy" || err.kind === "timeout") throw new Error("The AI service is temporarily overloaded. Try again shortly.");
    }
    throw err;
  }
}

/** Like geminiGenerate, but also returns the web pages used when `search` was on. */
export async function geminiGenerateWithSources(params: {
  system?: string;
  turns: GeminiTurn[];
  maxOutputTokens: number;
  search?: boolean;
  budgetMs?: number;
  attemptCapMs?: number;
}): Promise<{ text: string; sources: { title: string; url: string }[] }> {
  try {
    const r = await geminiGenerateDetailed(params);
    return { text: r.text, sources: r.sources ?? [] };
  } catch (err) {
    if (err instanceof GeminiError) {
      if (err.kind === "rate_limit") throw new Error("The AI service is busy or the free daily limit was reached. Wait a minute and try again.");
      if (err.kind === "busy" || err.kind === "timeout") throw new Error("The AI service is temporarily overloaded. Try again shortly.");
    }
    throw err;
  }
}
