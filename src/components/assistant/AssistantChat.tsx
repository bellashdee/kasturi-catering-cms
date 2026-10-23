"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/I18nProvider";
import { resolvePageContext } from "@/lib/assistant/pageContext";
import { uploadDocument } from "@/lib/documents/upload";
import { prepareMenuFile } from "@/lib/kitchenAi/clientImage";
import { exportKitchenList } from "@/lib/kitchenAi/exportXlsx";
import type { RecipeRef } from "@/lib/kitchenAi/match";
import type { CalcResult, KState } from "@/lib/kitchenAi/types";
import { ChatMarkdown } from "./ChatMarkdown";
import { KitchenPanel, type KitchenPatch } from "./KitchenPanel";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  helpful?: boolean | null;
};

type KitchenData = { state: KState; calc: CalcResult; recipeOptions: RecipeRef[] };
type Meta = { companies: { id: string; name: string }[]; event: { id: string; name: string; date: string; companyId: string } | null };

const SUGGESTED_PROMPTS = [
  "How do I use this system?",
  "How do I upload an invoice?",
  "Show me how to create a catering event.",
  "How do I check supplier payments?",
  "What does this page do?",
];

const KITCHEN_HINTS = ["Change the pax to 300", "Remove the soup", "Generate the shopping list only", "Compare with our current stock", "Export this list to Excel"];

export function AssistantChat({ variant = "widget" }: { variant?: "widget" | "page" }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { lang } = useI18n();
  const companyParam = searchParams.get("company") ?? undefined;
  const eventParam = searchParams.get("event") ?? undefined;
  const { label: pageLabel, module: pageModule } = resolvePageContext(pathname);

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [history, setHistory] = useState<{ id: string; title: string }[] | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [kitchen, setKitchen] = useState<KitchenData | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [companyId, setCompanyId] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const localIdRef = useRef(0);

  // a new answer is read from its top (an ingredient list is long); everything else scrolls to the end
  useEffect(() => {
    const box = scrollRef.current;
    if (!box) return;
    const last = messages[messages.length - 1];
    const answers = box.querySelectorAll<HTMLElement>("[data-answer]");
    if (!loading && last?.role === "assistant" && answers.length > 0) {
      box.scrollTo({ top: Math.max(0, answers[answers.length - 1].offsetTop - 8), behavior: "smooth" });
    } else {
      box.scrollTo({ top: box.scrollHeight, behavior: "smooth" });
    }
  }, [messages, loading]);

  // the companies the user may use (recipes are kept per company) and, when opened from an event order, that order
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/kitchen-assistant?meta=1${eventParam ? `&event=${encodeURIComponent(eventParam)}` : ""}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Meta | null) => {
        if (cancelled || !data) return;
        setMeta(data);
        const preferred = data.event?.companyId ?? (companyParam && data.companies.some((c) => c.id === companyParam) ? companyParam : data.companies[0]?.id);
        if (preferred) setCompanyId(preferred);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [companyParam, eventParam]);

  const nextLocalId = (prefix: string) => `${prefix}-${localIdRef.current++}`;

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
    // a kitchen conversation comes back with its menu, pax and recipe choices
    setKitchen(null);
    const k = await fetch(`/api/kitchen-assistant?conversationId=${id}`);
    if (k.ok) {
      const kd = await k.json();
      if (kd.state) setKitchen({ state: kd.state, calc: kd.calc, recipeOptions: kd.recipeOptions ?? [] });
    }
  }

  function newConversation() {
    setConversationId(null);
    setMessages([]);
    setKitchen(null);
    setError(null);
    setShowHistory(false);
  }

  async function clearChat() {
    if (conversationId) {
      await fetch(`/api/assistant?conversationId=${conversationId}`, { method: "DELETE" });
    }
    newConversation();
  }

  /** One call to the kitchen engine. Returns the answer, or null after showing a clear error. */
  async function kitchenCall(body: Record<string, unknown>): Promise<(KitchenData & { conversationId: string; reply: string | null; messageId: string | null; export?: boolean }) | null> {
    try {
      const res = await fetch("/api/kitchen-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, lang, pageLabel }),
        signal: AbortSignal.timeout(90_000),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        setError(data?.error ?? (res.status === 504 ? "Reading took longer than the server allows. Try again, or use a smaller photo." : "The kitchen assistant could not answer just now. Please try again."));
        return null;
      }
      setConversationId(data.conversationId);
      setKitchen({ state: data.state, calc: data.calc, recipeOptions: data.recipeOptions ?? kitchen?.recipeOptions ?? [] });
      return data;
    } catch {
      setError("Could not reach the server (no internet, or the request took too long). Please try again.");
      return null;
    }
  }

  async function startKitchen(documentIds: string[], eventId?: string, userText?: string) {
    setLoading(true);
    setError(null);
    setWorking(documentIds.length > 0 ? "Reading the menu photo… this can take up to a minute" : "Preparing the event menu…");
    if (userText) setMessages((prev) => [...prev, { id: nextLocalId("local"), role: "user", content: userText }]);
    const data = await kitchenCall({ action: "start", companyId, eventId, documentIds, conversationId: conversationId ?? undefined });
    if (data?.reply) setMessages((prev) => [...prev, { id: data.messageId ?? nextLocalId("local-reply"), role: "assistant", content: data.reply! }]);
    setWorking(null);
    setLoading(false);
  }

  async function handleFiles(list: FileList | null) {
    const files = Array.from(list ?? []).slice(0, 4);
    if (fileRef.current) fileRef.current.value = "";
    if (camRef.current) camRef.current.value = "";
    if (files.length === 0 || loading) return;
    if (!companyId) {
      setError("Choose the company first (its recipes are used for the quantities).");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const ids: string[] = [];
      for (const [i, f] of files.entries()) {
        setWorking(`Preparing photo ${i + 1} of ${files.length}…`);
        const prepared = await prepareMenuFile(f);
        setWorking(`Uploading photo ${i + 1} of ${files.length}…`);
        const doc = await uploadDocument({ companyId, module: "kitchen", fileType: prepared.type, file: prepared.file, skipMarkdown: true });
        ids.push(doc.id);
      }
      setLoading(false);
      await startKitchen(ids, meta?.event?.id && !kitchen ? meta.event.id : undefined, `📷 Menu photo${ids.length > 1 ? `s (${ids.length})` : ""}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The photo could not be uploaded.");
      setWorking(null);
      setLoading(false);
    }
  }

  async function patch(p: KitchenPatch) {
    if (!conversationId || loading) return;
    setLoading(true);
    setError(null);
    const asks: Record<string, string> = { view: "", stock: "Compare with stock", estimate: "AI estimate" };
    setWorking(p.kind === "estimate" ? "Writing the AI estimate…" : null);
    const data = await kitchenCall({ action: "patch", conversationId, patch: p });
    if (data?.reply && (p.kind === "view" || p.kind === "stock" || p.kind === "estimate")) {
      const userLine = p.kind === "view" ? (p.view === "shopping" ? "Generate Shopping List" : "Generate Ingredients") : asks[p.kind];
      setMessages((prev) => [
        ...prev,
        { id: nextLocalId("local"), role: "user", content: userLine },
        { id: data.messageId ?? nextLocalId("local-reply"), role: "assistant", content: data.reply! },
      ]);
    }
    setWorking(null);
    setLoading(false);
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const optimisticUser: Message = { id: nextLocalId("local"), role: "user", content: trimmed };
    setMessages((prev) => [...prev, optimisticUser]);
    setInput("");
    setLoading(true);
    setError(null);

    if (kitchen && conversationId) {
      const data = await kitchenCall({ action: "message", conversationId, text: trimmed });
      if (data?.reply) setMessages((prev) => [...prev, { id: data.messageId ?? nextLocalId("local-reply"), role: "assistant", content: data.reply! }]);
      if (data?.export) exportKitchenList(data.state, data.calc);
      setLoading(false);
      return;
    }

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
        { id: data.messageId ?? nextLocalId("local-reply"), role: "assistant", content: data.reply },
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
  const showEventBanner = !!meta?.event && !kitchen && messages.length === 0;
  const iconBtn = "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-[16px] hover:border-primary disabled:opacity-40";

  return (
    <div className={`flex flex-col ${isPage ? "h-[85vh] min-h-[520px]" : "h-full"} min-h-0`}>
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

      {kitchen && (
        <div className="max-h-[40%] overflow-y-auto">
          <KitchenPanel
            state={kitchen.state}
            calc={kitchen.calc}
            recipeOptions={kitchen.recipeOptions}
            busy={loading}
            onPatch={patch}
            onExport={() => exportKitchenList(kitchen.state, kitchen.calc)}
            onExit={() => setKitchen(null)}
          />
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
            <div className="rounded-xl border border-border bg-bg px-3 py-2.5 text-[12.5px] text-text-secondary">
              <div className="font-bold text-text">🍳 Kitchen: ingredients from a menu photo</div>
              <p className="mt-1">Upload (📎) or take (📷) a photo of a printed or handwritten menu. I read the dishes, ask for the pax only if it is not on the menu, and work out the ingredients from your approved recipes.</p>
            </div>
            {showEventBanner && meta?.event && (
              <div className="rounded-xl border border-primary/40 bg-white px-3 py-2.5 text-[12.5px]">
                <div className="font-bold text-text">Event order: {meta.event.name} ({meta.event.date})</div>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => startKitchen([], meta.event!.id, `Ingredient list from the event order: ${meta.event!.name}`)}
                  className="mt-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-40"
                >
                  Generate ingredients from this event order
                </button>
                <span className="ml-2 text-text-muted">or upload a menu photo to compare it with the order.</span>
              </div>
            )}
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} data-answer={m.role === "assistant" ? "" : undefined} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[92%] rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                m.role === "user" ? "whitespace-pre-wrap bg-primary text-white" : "bg-bg text-text"
              }`}
            >
              {m.role === "assistant" ? <ChatMarkdown content={m.content} /> : m.content}
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
            <div className="flex items-center gap-2 rounded-xl bg-bg px-3.5 py-2.5 text-[13px] text-text-secondary" role="status">
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-hidden="true" />
              {working ?? "Thinking…"}
            </div>
          </div>
        )}

        {error && (
          <div className="flex justify-start">
            <div className="rounded-xl bg-danger-bg px-3.5 py-2.5 text-[13px] text-danger" role="alert">{error}</div>
          </div>
        )}
      </div>

      {kitchen && (
        <div className="flex gap-1.5 overflow-x-auto whitespace-nowrap border-t border-border px-3 pt-2">
          {KITCHEN_HINTS.map((h) => (
            <button key={h} type="button" disabled={loading} onClick={() => send(h)} className="shrink-0 rounded-full border border-border bg-white px-2.5 py-1 text-[11.5px] font-medium text-text-secondary hover:border-primary hover:text-primary disabled:opacity-40">
              {h}
            </button>
          ))}
        </div>
      )}

      {!kitchen && meta && meta.companies.length > 1 && (
        <div className="flex items-center gap-2 border-t border-border px-3 pt-2 text-[12px] text-text-secondary">
          <label htmlFor="kitchen-company" className="font-semibold">Recipes of</label>
          <select id="kitchen-company" value={companyId} disabled={!!meta.event} onChange={(e) => setCompanyId(e.target.value)} className="h-7 rounded-md border border-border-strong bg-white px-1.5 text-[12px] disabled:opacity-60">
            {meta.companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <span className="text-text-muted">(for menu photos)</span>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex items-center gap-2 border-t border-border px-3 py-2.5"
      >
        <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => handleFiles(e.target.files)} />
        <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => handleFiles(e.target.files)} />
        <button type="button" onClick={() => fileRef.current?.click()} disabled={loading} aria-label="Upload a menu photo or PDF" title="Upload a menu photo or PDF" className={iconBtn}>
          📎
        </button>
        <button type="button" onClick={() => camRef.current?.click()} disabled={loading} aria-label="Take a photo of the menu" title="Take a photo of the menu" className={iconBtn}>
          📷
        </button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={kitchen ? "e.g. Change the pax to 300 · Remove the soup · Shopping list" : "Ask a question… (English or Bahasa Melayu)"}
          className="min-w-0 flex-1 rounded-lg border border-border px-3 py-2 text-[13px] outline-none focus:border-primary"
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
