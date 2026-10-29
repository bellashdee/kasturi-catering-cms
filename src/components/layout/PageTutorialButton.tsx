"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Dialog } from "@/components/priority/ui";
import { GUIDE_INTRO, guideFor } from "@/lib/pageGuides";

/** The Tutorial button at the top of every page: opens the step by step guide of the page the person is on. */
export function PageTutorialButton() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const guide = guideFor(pathname);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={GUIDE_INTRO}
        className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-primary bg-surface px-3 text-[13px] font-bold text-primary hover:bg-surface-alt"
      >
        <span aria-hidden="true" className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[12px] leading-none text-white">?</span>
        <span className="hidden sm:inline">Tutorial</span>
      </button>
      {open && (
        <Dialog title={GUIDE_INTRO} onClose={() => setOpen(false)} wide>
          <div className="mb-3 text-[15px] font-extrabold text-text">{guide.title}</div>
          <ol className="flex flex-col gap-3 text-[14px] text-text-secondary">
            {guide.steps.map((step, i) => (
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
