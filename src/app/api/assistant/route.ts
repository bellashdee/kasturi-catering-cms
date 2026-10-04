import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { geminiGenerate, getAiProvider } from "@/lib/ai/gemini";
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

function kbOnlyReply(kbEntries: ReturnType<typeof searchKnowledgeBase>) {
  if (kbEntries.length === 0) {
    return "I'm not sure about that one yet. Try browsing the relevant module in the sidebar, or check with your admin — I don't have a knowledge base entry that covers this question.";
  }
  return kbEntries.map((e) => e.content).join("\n\n---\n\n");
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
  const message: string = body?.message ?? "";
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
            { role: "user", parts: [{ text: message }] },
          ],
          maxOutputTokens: 1500,
        });
        reply = text.trim() || kbOnlyReply(kbEntries);
      } else {
        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        const response = await anthropic.messages.create({
          model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
          max_tokens: 700,
          system: systemPrompt,
          messages: [...history, { role: "user", content: message }],
        });
        const textBlock = response.content.find((b) => b.type === "text");
        reply = textBlock && "text" in textBlock ? textBlock.text : kbOnlyReply(kbEntries);
      }
    } catch {
      reply = kbOnlyReply(kbEntries);
      if (liveDataBlock) reply = `${liveDataBlock}\n\n${reply}`;
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
