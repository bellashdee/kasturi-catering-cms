"use client";

import { useState } from "react";
import { answerQuestion, QUICK_QUESTIONS, type HelpContext, type HelpLang } from "@/lib/kitchenPlan/help";
import { kitchenPlanText } from "@/lib/kitchenPlan/text";

/** "Need help?": a few tap-to-ask questions and a box to type one. Answers come from the plan and the saved recipes only. */
export function PlanHelp({ context, lang }: { context: HelpContext; lang: HelpLang }) {
  const t = kitchenPlanText(lang);
  const [text, setText] = useState("");
  const [asked, setAsked] = useState<{ q: string; lines: string[] } | null>(null);

  function ask(q: string) {
    const question = q.trim();
    if (!question) return;
    setAsked({ q: question, lines: answerQuestion(question, context, lang) });
    setText("");
  }

  return (
    <details className="rounded-xl border border-border bg-surface">
      <summary className="cursor-pointer select-none px-4 py-3.5 text-[15px] font-bold text-text">💬 {t.helpTitle}</summary>
      <div className="flex flex-col gap-3 border-t border-border px-4 py-4">
        <p className="text-[13px] text-text-secondary">{t.helpHint}</p>
        <div className="flex flex-wrap gap-2">
          {QUICK_QUESTIONS[lang].map((q) => (
            <button key={q} type="button" onClick={() => ask(q)} className="rounded-full border border-border-strong bg-white px-3.5 py-2 text-[13px] font-semibold text-text hover:border-primary hover:text-primary">
              {q}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(text);
          }}
          className="flex gap-2"
        >
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t.helpPlaceholder} className="h-12 min-w-0 flex-1 rounded-lg border border-border-strong bg-white px-3 text-[15px] outline-none focus:border-primary" />
          <button type="submit" className="h-12 rounded-lg bg-primary px-5 text-[14px] font-bold text-white">
            {t.ask}
          </button>
        </form>
        {asked && (
          <div aria-live="polite" className="rounded-lg bg-surface-alt px-4 py-3 text-[14.5px] leading-relaxed text-text">
            <div className="mb-1.5 text-[12.5px] font-bold text-text-muted">{asked.q}</div>
            {asked.lines.map((l, i) => (
              <p key={i} className={i > 0 ? "mt-1" : ""}>
                {l}
              </p>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}
