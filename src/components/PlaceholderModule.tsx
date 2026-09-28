export function PlaceholderModule({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border-strong bg-surface px-6 py-20 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-info-bg">
        <svg width="26" height="26" viewBox="0 0 20 20" fill="none" stroke="var(--color-primary)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="10" cy="10" r="7.2" />
          <path d="M10 6.5v4M10 13.2h.01" />
        </svg>
      </div>
      <h1 className="mt-4 text-lg font-bold text-text">{title}</h1>
      <p className="mt-1.5 max-w-sm text-sm text-text-secondary">
        This module hasn&apos;t been built yet. Its data model already feeds the Main
        Dashboard — the full workflow (manual entry, uploads, OCR review) comes in a
        later phase.
      </p>
    </div>
  );
}
