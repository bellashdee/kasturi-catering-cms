"use client";

import { useState } from "react";
import { Dialog } from "@/components/priority/ui";

/** A button that opens a step by step guide (the steps are written in English; the page translates them like all other text). */
export function StepGuideButton({ steps, label = "Tutorial (step by step)" }: { steps: string[]; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="rounded-lg bg-primary px-4 py-2 text-[13px] font-bold text-white hover:bg-primary-hover">
        {label}
      </button>
      {open && (
        <Dialog title={label} onClose={() => setOpen(false)} wide>
          <ol className="flex flex-col gap-3 text-[14px] text-text-secondary">
            {steps.map((step, i) => (
              <li key={step} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-[13px] font-bold text-white">{i + 1}</span>
                <span className="pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
          <div className="mt-5 flex justify-end">
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-border-strong bg-surface px-5 py-2 text-[13px] font-semibold text-text hover:bg-surface-alt">
              Close
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
