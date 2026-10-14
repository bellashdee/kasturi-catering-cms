"use client";

/** Shown when a page cannot load its data (instead of a blank screen). Nothing is changed by trying again. */
export default function ErrorState({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto mt-10 max-w-lg rounded-xl border border-danger/30 bg-danger-bg p-8 text-center" role="alert">
      <div className="text-[18px] font-extrabold text-text">This page could not be loaded</div>
      <p className="mt-2 text-[14px] text-text-secondary">
        Something went wrong while fetching the figures. Your data is safe. Try again, and if it keeps happening tell the system administrator.
      </p>
      <button type="button" onClick={reset} className="mt-5 rounded-lg bg-primary px-5 py-2.5 text-[14px] font-semibold text-white hover:bg-primary-hover">
        Try again
      </button>
    </div>
  );
}
