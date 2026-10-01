"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { resolvePageContext } from "@/lib/assistant/pageContext";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  helpful?: boolean | null;
};

const SUGGESTED_PROMPTS = [
  "How do I use this system?",
  "How do I upload an invoice?",
  "Show me how to create a catering event.",
  "How do I check supplier payments?",
  "What does this page do?",
];

export function AssistantChat({ variant = "widget" }: { variant?: "widget" | "page" }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const companyParam = searchParams.get("company") ?? undefined;
  const { label: pageLabel, module: pageModule } = resolvePageContext(pathname);

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [history, setHistory] = useState<{ id: string; title: string }[] | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const localIdRef = useRef(0);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function loadHistory() {
    const res = await fetch("/api/assistant");
    if (!res.ok) return;
    const data = await res.json();
    setHistory((data.conversations ?? []).map((c: { id: string; title: string }) => ({ id: c.id, title: c.title })));
  }

  async function openConversation(id: string) {
    setShowHistory(false);
    setError(null);
    const res = await fetch(`/api/assistant?conversationId=${id}`);
    if (!res.ok) return;
    const data = await res.json();
    setConversationId(id);
    setMessages(
      (data.messages ?? []).map((m: { id: string; role: "user" | "assistant"; content: string; helpful: boolean | null }) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        helpful: m.helpful,
      })),
    );
  }

  function newConversation() {
    setConversationId(null);
    setMessages([]);
    setError(null);
    setShowHistory(false);
  }

  async function clearChat() {
    if (conversationId) {
      await fetch(`/api/assistant?conversationId=${conversationId}`, { method: "DELETE" });
    }
    newConversation();
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const optimisticUser: Message = { id: `local-${localIdRef.current++}`, role: "user", content: trimmed };
    setMessages((prev) => [...prev, optimisticUser]);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          conversationId,
          pageLabel,
          pageModule,
          companyParam,
        }),
      });

      if (!res.ok) throw new Error("The assistant couldn't respond just now.");

      const data = await res.json();
      if (data.conversationId) setConversationId(data.conversationId);
      setMessages((prev) => [
        ...prev,
        { id: data.messageId ?? `local-reply-${localIdRef.current++}`, role: "assistant", content: data.reply },
      ]);
    } catch {
      setError("Something went wrong reaching the AI Assistant. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function giveFeedback(messageId: string, helpful: boolean) {
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, helpful } : m)));
    if (messageId.startsWith("local-")) return;
    await fetch("/api/assistant", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId, helpful }),
    });
  }

  function copy(id: string, content: string) {
    navigator.clipboard?.writeText(content).catch(() => {});
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  const isPage = variant === "page";

  return (
    <div className={`flex flex-col ${isPage ? "h-[75vh]" : "h-full"} min-h-0`}>
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <span className="text-[12.5px] font-semibold text-text-secondary">Viewing: {pageLabel}</span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => {
              setShowHistory((v) => !v);
              if (!history) loadHistory();
            }}
            className="rounded-md px-2 py-1 text-[12px] font-medium text-text-secondary hover:bg-bg"
          >
            History
          </button>
          <button onClick={newConversation} className="rounded-md px-2 py-1 text-[12px] font-medium text-text-secondary hover:bg-bg">
            New chat
          </button>
          <button onClick={clearChat} className="rounded-md px-2 py-1 text-[12px] font-medium text-text-secondary hover:bg-bg">
            Clear
          </button>
        </div>
      </div>

      {showHistory && (
        <div className="border-b border-border bg-bg px-4 py-2">
          {history === null ? (
            <p className="text-[12px] text-text-secondary">Loading…</p>
          ) : history.length === 0 ? (
            <p className="text-[12px] text-text-secondary">No previous conversations yet.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {history.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => openConversation(c.id)}
                    className="w-full truncate rounded-md px-2 py-1 text-left text-[12.5px] text-text hover:bg-white"
                  >
                    {c.title || "Conversation"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {messages.length === 0 && (
          <div className="flex flex-col gap-3">
            <p className="text-[13px] text-text-secondary">
              🤖 Hi! I&apos;m your AI Assistant. I can explain how to use this system, walk you through tutorials, and
              look up authorized data you have access to. Try one of these:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTED_PROMPTS.map((p) => (
                <button
                  key={p}
                  onClick={() => send(p)}
                  className="rounded-full border border-border bg-white px-3 py-1.5 text-[12px] font-medium text-text hover:border-primary hover:text-primary"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                m.role === "user" ? "bg-primary text-white" : "bg-bg text-text"
              }`}
            >
              {m.content}
              {m.role === "assistant" && (
                <div className="mt-2 flex items-center gap-2 border-t border-black/5 pt-1.5">
                  <button onClick={() => copy(m.id, m.content)} className="text-[11px] text-text-secondary hover:text-text">
                    {copiedId === m.id ? "Copied!" : "Copy"}
                  </button>
                  <button
                    onClick={() => giveFeedback(m.id, true)}
                    className={`text-[11px] ${m.helpful === true ? "text-success" : "text-text-secondary hover:text-text"}`}
                  >
                    👍
                  </button>
                  <button
                    onClick={() => giveFeedback(m.id, false)}
                    className={`text-[11px] ${m.helpful === false ? "text-danger" : "text-text-secondary hover:text-text"}`}
                  >
                    👎
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="rounded-xl bg-bg px-3.5 py-2.5 text-[13px] text-text-secondary">Thinking…</div>
          </div>
        )}

        {error && (
          <div className="flex justify-start">
            <div className="rounded-xl bg-danger-bg px-3.5 py-2.5 text-[13px] text-danger">{error}</div>
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex items-center gap-2 border-t border-border px-3 py-2.5"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question… (English or Bahasa Melayu)"
          className="flex-1 rounded-lg border border-border px-3 py-2 text-[13px] outline-none focus:border-primary"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="rounded-lg bg-primary px-3.5 py-2 text-[13px] font-semibold text-white disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  );
}
