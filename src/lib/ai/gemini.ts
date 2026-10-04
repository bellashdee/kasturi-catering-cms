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

export async function geminiGenerate({
  system,
  turns,
  maxOutputTokens,
  json,
}: {
  system?: string;
  turns: GeminiTurn[];
  maxOutputTokens: number;
  json?: boolean;
}): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");
  const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";

  const body = JSON.stringify({
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    contents: turns,
    generationConfig: {
      maxOutputTokens,
      ...(json ? { responseMimeType: "application/json" } : {}),
    },
  });

  // The free tier is rate limited and sometimes overloaded: retry a couple of times before giving up.
  let res: Response | null = null;
  let data: { error?: { message?: string }; candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] } | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    res = await fetch(`${GEMINI_ENDPOINT}/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body,
    });
    data = await res.json().catch(() => null);
    if (res.ok || ![429, 500, 503].includes(res.status)) break;
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
  }

  if (!res || !res.ok) {
    if (res?.status === 429) throw new Error("The AI service is busy or the free daily limit was reached. Wait a minute and try again.");
    if (res?.status === 503 || res?.status === 500) throw new Error("The AI service is temporarily overloaded. Try again shortly.");
    throw new Error(data?.error?.message ?? `AI request failed (${res?.status}).`);
  }

  const parts: { text?: string; thought?: boolean }[] = data?.candidates?.[0]?.content?.parts ?? [];
  return parts
    .filter((p) => !p.thought && typeof p.text === "string")
    .map((p) => p.text)
    .join("");
}
