"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { AssistantChat } from "./AssistantChat";

/**
 * Floating "Ask AI" button available from any authenticated page — mounted
 * once in the dashboard layout. Hidden on /ai-assistant itself since that
 * page already shows the full-size chat.
 */
export function AssistantWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  if (pathname?.startsWith("/ai-assistant")) return null;

  return (
    <>
      {open && (
        <div className="fixed bottom-24 right-6 z-50 flex h-[520px] w-[380px] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-2xl print:hidden">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="text-[13.5px] font-bold text-text">🤖 AI Assistant</span>
            <button onClick={() => setOpen(false)} className="text-text-secondary hover:text-text" aria-label="Close">
              ✕
            </button>
          </div>
          <div className="min-h-0 flex-1">
            <AssistantChat variant="widget" />
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-2xl text-white shadow-xl transition hover:scale-105 print:hidden"
        aria-label="Ask AI"
      >
        🤖
      </button>
    </>
  );
}
