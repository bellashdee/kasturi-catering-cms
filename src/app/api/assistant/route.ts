import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { geminiGenerate, getAiProvider, type GeminiPart } from "@/lib/ai/gemini";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext, ROLE_LABEL } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import type { ModuleKey } from "@/lib/constants";
import { searchKnowledgeBase } from "@/lib/assistant/search";
import { buildSystemPrompt } from "@/lib/assistant/systemPrompt";
import { matchLiveDataIntent } from "@/lib/assistant/liveData";
import {
  createConversation,
  countTodayUserMessages,
  listConversations,
  listMessages,
  saveMessage,
  setMessageFeedback,
  deleteConversation,
  touchConversation,
} from "@/lib/assistant/actions";

export const runtime = "nodejs";

const DAILY_MESSAGE_LIMIT = 60;
const MAX_ANSWER_TOKENS = 3000;
const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

type Attachment = { mime: string; data: Buffer };

/** Downloads the photos / PDFs the person uploaded for this question (only their own files). */
async function loadAttachments(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, documentIds: string[]): Promise<{ files: Attachment[]; problem: string | null }> {
  if (documentIds.length === 0) return { files: [], problem: null };
  const { data: docs } = await supabase.from("documents").select("id, uploaded_by, file_type, storage_path, original_filename").in("id", documentIds);
  if (!docs || docs.length !== documentIds.length) return { files: [], problem: "A file could not be found. Please upload it again." };
  const files: Attachment[] = [];
  for (const d of docs) {
    if (d.uploaded_by !== userId) return { files: [], problem: "You can only use files you uploaded yourself." };
    const name = (d.original_filename ?? "").toLowerCase();
    const mime = d.file_type === "pdf" || name.endsWith(".pdf") ? "application/pdf" : name.endsWith(".png") ? "image/png" : name.endsWith(".webp") ? "image/webp" : "image/jpeg";
    if (!["photo", "screenshot", "pdf"].includes(d.file_type)) return { files: [], problem: "Only photos, screenshots and PDFs can be read." };
    const { data: blob, error } = await supabase.storage.from("documents").download(d.storage_path);
    if (error || !blob) return { files: [], problem: "A file could not be retrieved. Please upload it again." };
    const buffer = Buffer.from(await blob.arrayBuffer());
    if (buffer.byteLength > MAX_IMAGE_BYTES) return { files: [], problem: "A file is larger than 12 MB. Please upload a smaller copy." };
    files.push({ mime, data: buffer });
  }
  return { files, problem: null };
}

/**
 * The answer from the knowledge base alone (used when no AI service answers): ONE entry, cut down to its title, at most 6
 * numbered steps and one tip, so it stays short and easy to follow.
 */
function condenseEntry(content: string, maxSteps = 6): string {
  const lines = content.split("\n").map((l) => l.trim()).filter(Boolean);
  const title = lines.find((l) => l.startsWith("📌"));
  const steps = lines.filter((l) => /^\d+[.)]\s/.test(l));
  const tip = lines.find((l) => l.startsWith("💡"));
  if (steps.length === 0) {
    const sentences = content.replace(/\s+/g, " ").match(/[^.!?]+[.!?]+/g) ?? [content];
    return sentences.slice(0, 2).join(" ").trim().slice(0, 320);
  }
  const shown = steps.slice(0, maxSteps);
  const out = [title, ...shown, steps.length > maxSteps ? "…" : null, tip ? tip.slice(0, 160) : null].filter(Boolean);
  return out.join("\n");
}

function kbOnlyReply(kbEntries: ReturnType<typeof searchKnowledgeBase>) {
  if (kbEntries.length === 0) {
    return "I'm not sure about that one yet. Try browsing the relevant module in the sidebar, or check with your admin — I don't have a knowledge base entry that covers this question.";
  }
  return condenseEntry(kbEntries[0].content);
}

export async function GET(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const conversationId = searchParams.get("conversationId");

  if (conversationId) {
    const messages = await listMessages(supabase, conversationId);
    return NextResponse.json({ messages });
  }

  const conversations = await listConversations(supabase);
  return NextResponse.json({ conversations });
}

export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const documentIds: string[] = Array.isArray(body?.documentIds) ? body.documentIds.filter((x: unknown): x is string => typeof x === "string").slice(0, MAX_IMAGES) : [];
  const message: string = (body?.message ?? "").trim() || (documentIds.length > 0 ? "Please read this and tell me what it is and what is important in it." : "");
  const pageLabel: string = body?.pageLabel ?? "Main Dashboard";
  const pageModule: ModuleKey | "general" = body?.pageModule ?? "general";
  const companyParam: string | undefined = body?.companyParam;
  let conversationId: string | undefined = body?.conversationId;

  if (!message.trim()) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const supabase = await createClient();

  const usedToday = await countTodayUserMessages(supabase);
  if (usedToday >= DAILY_MESSAGE_LIMIT) {
    return NextResponse.json({
      reply:
        "You've reached today's question limit for the AI Assistant. It resets tomorrow — in the meantime, the module pages and Reports still work as normal.",
      conversationId: conversationId ?? null,
    });
  }

  if (!conversationId) {
    conversationId = await createConversation(supabase, session.userId, null, message.slice(0, 60));
  }

  await saveMessage(supabase, conversationId, "user", message, pageLabel);

  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];
  const { targetCompanyIds } = resolveCompanyScope(session, companies, companyParam);
  const companyLabel =
    companyParam && companies.some((c) => c.id === companyParam)
      ? companies.find((c) => c.id === companyParam)!.name
      : "All Companies";

  let liveDataBlock: string | null = null;
  const intent = matchLiveDataIntent(message);
  if (intent && targetCompanyIds.length > 0) {
    try {
      liveDataBlock = await intent.run({ supabase, targetCompanyIds, companyLabel });
    } catch {
      liveDataBlock = null;
    }
  }

  const kbEntries = searchKnowledgeBase(message, pageModule);

  const provider = getAiProvider();
  let reply: string;

  // photos / PDFs sent with the question
  const attachments = await loadAttachments(supabase, session.userId, documentIds);
  if (attachments.problem) {
    const messageId = await saveMessage(supabase, conversationId, "assistant", attachments.problem, pageLabel);
    return NextResponse.json({ conversationId, reply: attachments.problem, messageId });
  }
  if (attachments.files.length > 0 && !provider) {
    const noAi = "Reading photos needs the AI service, which is not set up on this server yet.";
    const messageId = await saveMessage(supabase, conversationId, "assistant", noAi, pageLabel);
    return NextResponse.json({ conversationId, reply: noAi, messageId });
  }

  if (!provider) {
    reply = kbOnlyReply(kbEntries);
    if (liveDataBlock) reply = `${liveDataBlock}\n\n${reply}`;
  } else {
    try {
      const priorMessages = conversationId ? await listMessages(supabase, conversationId) : [];
      const history = priorMessages
        .slice(-10, -1) // exclude the user message we just saved; cap context
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

      const systemPrompt = buildSystemPrompt({
        pageLabel,
        userFullName: session.fullName,
        roleLabel: ROLE_LABEL[session.role],
        kbEntries,
        liveDataBlock,
      });

      if (provider === "gemini") {
        const text = await geminiGenerate({
          system: systemPrompt,
          turns: [
            ...history.map((m) => ({ role: m.role === "assistant" ? ("model" as const) : ("user" as const), parts: [{ text: m.content }] })),
            { role: "user", parts: [...attachments.files.map((f): GeminiPart => ({ inline_data: { mime_type: f.mime, data: f.data.toString("base64") } })), { text: message }] },
          ],
          maxOutputTokens: MAX_ANSWER_TOKENS,
        });
        reply = text.trim() || kbOnlyReply(kbEntries);
      } else {
        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        const response = await anthropic.messages.create({
          model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
          max_tokens: MAX_ANSWER_TOKENS,
          system: systemPrompt,
          messages: [
            ...history,
            {
              role: "user",
              content: [
                ...attachments.files.map((f): Anthropic.ContentBlockParam =>
                  f.mime === "application/pdf"
                    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: f.data.toString("base64") } }
                    : { type: "image", source: { type: "base64", media_type: f.mime as "image/jpeg" | "image/png" | "image/webp", data: f.data.toString("base64") } },
                ),
                { type: "text", text: message },
              ],
            },
          ],
        });
        const textBlock = response.content.find((b) => b.type === "text");
        reply = textBlock && "text" in textBlock ? textBlock.text : kbOnlyReply(kbEntries);
      }
    } catch {
      if (attachments.files.length > 0) {
        reply = "I could not read the file just now (the AI service may be busy). Please try again in a moment, or send a clearer photo.";
      } else {
        reply = kbOnlyReply(kbEntries);
        if (liveDataBlock) reply = `${liveDataBlock}\n\n${reply}`;
      }
    }
  }

  const messageId = await saveMessage(supabase, conversationId, "assistant", reply, pageLabel);
  await touchConversation(supabase, conversationId);

  return NextResponse.json({ conversationId, reply, messageId });
}

export async function PATCH(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const messageId: string | undefined = body?.messageId;
  const helpful: boolean | undefined = body?.helpful;
  if (!messageId || typeof helpful !== "boolean") {
    return NextResponse.json({ error: "messageId and helpful are required" }, { status: 400 });
  }

  const supabase = await createClient();
  await setMessageFeedback(supabase, messageId, helpful);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const conversationId = searchParams.get("conversationId");
  if (!conversationId) return NextResponse.json({ error: "conversationId is required" }, { status: 400 });

  const supabase = await createClient();
  await deleteConversation(supabase, conversationId);
  return NextResponse.json({ ok: true });
}
