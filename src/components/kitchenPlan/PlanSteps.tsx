import { kitchenPlanText } from "@/lib/kitchenPlan/text";
import type { HelpLang } from "@/lib/kitchenPlan/help";

/** The four steps of the Cooking Plan, with the current one marked (1 = Select event ... 4 = Cook). */
export function PlanSteps({ current, lang }: { current: 1 | 2 | 3 | 4; lang: HelpLang }) {
  const t = kitchenPlanText(lang);
  return (
    <ol className="flex items-center gap-1.5 text-[12.5px] font-semibold" aria-label="Steps">
      {t.steps.map((label, i) => {
        const n = i + 1;
        const state = n === current ? "now" : n < current ? "done" : "later";
        return (
          <li key={label} className="flex items-center gap-1.5" aria-current={state === "now" ? "step" : undefined}>
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-full text-[12.5px] font-bold ${
                state === "now" ? "bg-primary text-white" : state === "done" ? "bg-success-bg text-success" : "bg-surface-alt text-text-muted"
              }`}
            >
              {state === "done" ? "✓" : n}
            </span>
            <span className={`hidden sm:inline ${state === "now" ? "text-text" : "text-text-muted"}`}>{label}</span>
            {n < 4 && <span className="mx-1 h-px w-4 bg-border-strong sm:w-6" />}
          </li>
        );
      })}
    </ol>
  );
}
