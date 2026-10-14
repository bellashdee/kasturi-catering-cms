/** Shown while a page's figures are being fetched: grey blocks in the shape of the page, so nothing jumps when it arrives. */
export default function Loading() {
  return (
    <div className="flex flex-col gap-6" role="status" aria-live="polite" aria-label="Loading">
      <div className="h-8 w-72 max-w-full animate-pulse rounded-lg bg-border" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[118px] animate-pulse rounded-xl border border-border bg-surface" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-56 animate-pulse rounded-xl border border-border bg-surface" />
        ))}
      </div>
      <span className="sr-only">Loading...</span>
    </div>
  );
}
