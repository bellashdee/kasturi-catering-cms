"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/I18nProvider";
import { deleteCookingPlan, setPlanTaskStatus, updatePlanTask } from "@/lib/kitchenPlan/actions";
import { clockText, dayText, lengthText } from "@/lib/kitchenPlan/schedule";
import { kitchenPlanText } from "@/lib/kitchenPlan/text";
import type { HelpTask } from "@/lib/kitchenPlan/help";
import { PlanHelp } from "./PlanHelp";

export type ViewTask = {
  id: string;
  dish: string;
  startAt: string;
  endAt: string;
  minutes: number;
  estimate: boolean;
  assignedTo: string;
  status: "not_started" | "in_progress" | "completed";
  pax: number;
  steps: string[];
  ingredients: { name: string; quantity: number; unit: string | null }[] | null;
};

const hhmmKl = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
const big = "h-14 w-full rounded-xl text-[16px] font-extrabold disabled:opacity-60";

/** Step 4: the plan in time order, what to do next, big Start / Completed buttons, and the progress of the event. */
export function PlanView({
  eventId,
  dayId,
  eventName,
  pax,
  readyAt,
  tasks,
  canManage,
  me,
}: {
  eventId: string;
  dayId: string | null;
  eventName: string;
  pax: number;
  readyAt: string;
  tasks: ViewTask[];
  canManage: boolean;
  me: string;
}) {
  const router = useRouter();
  const { lang: appLang, t: tr } = useI18n();
  const lang = appLang === "ms" ? "ms" : "en";
  const t = kitchenPlanText(lang);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const done = tasks.filter((x) => x.status === "completed").length;
  const current = tasks.find((x) => x.status === "in_progress") ?? tasks.find((x) => x.status === "not_started") ?? null;
  const mine = (x: ViewTask) => !!me && x.assignedTo.toLowerCase().includes(me.toLowerCase());

  async function run(key: string, work: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(key);
    setError(null);
    try {
      const r = await work();
      if (!r.ok) setError(r.error ?? t.failed);
      else router.refresh();
    } catch {
      setError(t.failed);
    } finally {
      setBusy(null);
    }
  }

  const helpTasks: HelpTask[] = tasks.map((x) => ({ dish: x.dish, startMs: new Date(x.startAt).getTime(), endMs: new Date(x.endAt).getTime(), minutes: x.minutes, assignedTo: x.assignedTo, status: x.status, pax: x.pax, steps: x.steps, ingredients: x.ingredients }));

  function actions(x: ViewTask) {
    if (x.status === "completed")
      return (
        <button type="button" disabled={!!busy} onClick={() => run(x.id, () => setPlanTaskStatus(x.id, "in_progress"))} className="h-11 rounded-lg border border-border-strong bg-white px-4 text-[13.5px] font-semibold text-text-secondary">
          {t.undo}
        </button>
      );
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        {x.status === "not_started" && (
          <button type="button" disabled={!!busy} onClick={() => run(x.id, () => setPlanTaskStatus(x.id, "in_progress"))} className={`${big} border border-primary bg-white text-primary hover:bg-info-bg`}>
            {t.startTask}
          </button>
        )}
        <button type="button" disabled={!!busy} onClick={() => run(x.id, () => setPlanTaskStatus(x.id, "completed"))} className={`${big} bg-primary text-white hover:bg-primary-hover ${x.status === "in_progress" ? "sm:col-span-2" : ""}`}>
          {t.markDone}
        </button>
      </div>
    );
  }

  function details(x: ViewTask) {
    return (
      <div className="flex flex-col gap-4 text-[14.5px] text-text">
        <div>
          <div className="mb-1 text-[12px] font-bold uppercase tracking-wide text-text-muted">{t.instructions}</div>
          {x.steps.length === 0 ? (
            <p className="text-text-secondary">{t.noSteps}</p>
          ) : (
            <ol className="list-decimal space-y-1 pl-5">
              {x.steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          )}
        </div>
        <div>
          <div className="mb-1 text-[12px] font-bold uppercase tracking-wide text-text-muted">
            {t.ingredients} {x.ingredients ? t.ingredientsFor(x.pax) : ""}
          </div>
          {!x.ingredients ? (
            <p className="text-text-secondary">{t.noIngredients}</p>
          ) : (
            <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
              {x.ingredients.map((i) => (
                <li key={i.name} className="flex justify-between gap-3 border-b border-border py-1">
                  <span>{i.name}</span>
                  <span className="font-semibold">
                    {Math.round(i.quantity * 100) / 100} {i.unit ?? ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  const headline = (x: ViewTask) => (
    <div className="text-[13.5px] text-text-secondary">
      {t.start}: <b className="text-text">{clockText(x.startAt)}</b> · {t.estimatedDone}: <b className="text-text">{clockText(x.endAt)}</b> ({lengthText(x.minutes)}) · {t.assigned}: <b className="text-text">{x.assignedTo}</b>{" "}
      <span className={`ml-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${x.estimate ? "bg-warning-bg text-warning" : "bg-success-bg text-success"}`}>{x.estimate ? t.estimate : t.confirmed}</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="text-[12px] font-bold tracking-wide text-text-muted">{t.yourPlan}</div>
        <div className="mt-1 text-[18px] font-extrabold text-text">{eventName}</div>
        <div className="text-[14px] text-text-secondary">
          {pax} {t.pax} · {t.foodReady}: <b className="text-text">{clockText(readyAt)}</b> · {dayText(readyAt)}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between text-[14px] font-bold text-text">
          <span>{t.progress(done, tasks.length)}</span>
        </div>
        <div className="mt-2 h-3 overflow-hidden rounded-full bg-surface-alt" role="progressbar" aria-valuemin={0} aria-valuemax={tasks.length} aria-valuenow={done}>
          <div className="h-full rounded-full bg-success" style={{ width: `${tasks.length ? (done / tasks.length) * 100 : 0}%` }} />
        </div>
      </div>

      {current ? (
        <section className="rounded-2xl border-2 border-primary bg-surface p-5 shadow-sm">
          <div className="text-[12px] font-extrabold tracking-wide text-primary">{t.nextTask}</div>
          <div className="mt-1 text-[22px] font-extrabold text-text">{current.dish}</div>
          <div className="mt-1">{headline(current)}</div>
          <div className="mt-4">{details(current)}</div>
          <div className="mt-5">{actions(current)}</div>
        </section>
      ) : (
        <div className="rounded-2xl bg-success-bg px-5 py-5 text-[16px] font-bold text-success">{t.allDone}</div>
      )}

      {error && (
        <div role="alert" className="rounded-lg bg-danger-bg px-4 py-3 text-[14px] text-danger">
          {error}
        </div>
      )}

      <section className="flex flex-col gap-3">
        {tasks.map((x, i) => (
          <details key={x.id} className={`rounded-xl border bg-surface ${x.status === "in_progress" ? "border-primary" : "border-border"}`}>
            <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-4 py-3.5">
              <span className="min-w-0">
                <span className="block text-[11.5px] font-extrabold tracking-wide text-text-muted">
                  {t.task} {i + 1}
                  {i === 0 ? ` – ${t.startFirst}` : ""}
                  {mine(x) && <span className="ml-2 rounded-full bg-info-bg px-2 py-0.5 text-primary">{t.yours}</span>}
                </span>
                <span className={`block text-[16px] font-bold ${x.status === "completed" ? "text-text-muted line-through" : "text-text"}`}>{x.dish}</span>
                <span className="block text-[13px] text-text-secondary">
                  {clockText(x.startAt)} → {clockText(x.endAt)} · {x.assignedTo}
                </span>
              </span>
              <span className={`rounded-full px-3 py-1 text-[12px] font-bold ${x.status === "completed" ? "bg-success-bg text-success" : x.status === "in_progress" ? "bg-info-bg text-primary" : "bg-surface-alt text-text-secondary"}`}>{t.status[x.status]}</span>
            </summary>
            <div className="flex flex-col gap-4 border-t border-border px-4 py-4">
              {headline(x)}
              {details(x)}
              {actions(x)}
            </div>
          </details>
        ))}
        <p className="text-[12.5px] text-text-muted">{t.estimateNote}</p>
      </section>

      <PlanHelp lang={lang} context={{ eventName, pax, readyMs: new Date(readyAt).getTime(), tasks: helpTasks, me }} />

      {canManage && (
        <details className="rounded-xl border border-border bg-surface">
          <summary className="cursor-pointer select-none px-4 py-3.5 text-[14px] font-bold text-text-secondary">⚙ {t.manage}</summary>
          <div className="flex flex-col gap-4 border-t border-border px-4 py-4">
            {tasks.map((x) => (
              <TaskEditor key={`${x.id}:${x.minutes}:${x.startAt}:${x.assignedTo}`} task={x} busy={busy === `edit-${x.id}`} onSave={(minutes, cook, start) => run(`edit-${x.id}`, () => updatePlanTask({ taskId: x.id, minutes, assignedTo: cook, startHhmm: start }))} />
            ))}
            <button
              type="button"
              disabled={!!busy}
              onClick={() => {
                if (window.confirm(tr(t.redoAsk))) void run("redo", () => deleteCookingPlan(eventId, dayId));
              }}
              className="h-12 rounded-lg border border-danger px-4 text-[14px] font-bold text-danger hover:bg-danger-bg"
            >
              {t.redo}
            </button>
          </div>
        </details>
      )}
    </div>
  );
}

function TaskEditor({ task, busy, onSave }: { task: ViewTask; busy: boolean; onSave: (minutes: number, cook: string, start: string) => void }) {
  const { lang } = useI18n();
  const t = kitchenPlanText(lang === "ms" ? "ms" : "en");
  const [minutes, setMinutes] = useState(String(task.minutes));
  const [cook, setCook] = useState(task.assignedTo);
  const [start, setStart] = useState(hhmmKl(task.startAt));
  const input = "mt-1 h-11 w-full rounded-lg border border-border-strong bg-white px-3 text-[14px] outline-none focus:border-primary";
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="mb-2 text-[14px] font-bold text-text">{task.dish}</div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="text-[12px] font-semibold text-text-secondary">
          {t.minutes}
          <input type="number" min={5} max={1440} value={minutes} onChange={(e) => setMinutes(e.target.value)} className={input} />
        </label>
        <label className="text-[12px] font-semibold text-text-secondary">
          {t.startsAt}
          <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className={input} />
        </label>
        <label className="col-span-2 text-[12px] font-semibold text-text-secondary">
          {t.cook}
          <input value={cook} onChange={(e) => setCook(e.target.value)} className={input} />
        </label>
      </div>
      <button type="button" disabled={busy} onClick={() => onSave(Number(minutes), cook, start)} className="mt-3 h-11 rounded-lg bg-primary px-5 text-[14px] font-bold text-white disabled:opacity-60">
        {busy ? t.saving : t.save}
      </button>
    </div>
  );
}
