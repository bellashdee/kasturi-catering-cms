export function SectionCard({
  title,
  action,
  children,
  noPrint = false,
  collapsed,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  /** left out of the printed page (cards that only make sense on screen) */
  noPrint?: boolean;
  /**
   * closed until its button is pressed (edit history and audit trails: easy to find, no space taken); the number is how many entries it
   * has, shown on the button
   */
  collapsed?: { count: number };
}) {
  if (collapsed) {
    return (
      <details className={`group break-inside-avoid rounded-3xl border border-border bg-surface shadow-sm print:shadow-none ${noPrint ? "print:hidden" : ""}`}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3.5 [&::-webkit-details-marker]:hidden">
          <span className="text-[15px] font-bold text-text">{title}</span>
          <span className="rounded-lg border border-border-strong bg-surface px-3 py-1 text-[12.5px] font-semibold text-text group-open:bg-surface-alt">
            <span className="group-open:hidden">Show ({collapsed.count})</span>
            <span className="hidden group-open:inline">Hide</span>
          </span>
        </summary>
        <div className="border-t border-border p-5">{children}</div>
      </details>
    );
  }
  return (
    <div className={`break-inside-avoid rounded-3xl border border-border bg-surface shadow-sm print:shadow-none ${noPrint ? "print:hidden" : ""}`}>
      <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <div className="text-[15px] font-bold text-text">{title}</div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

export function EmptyRow({ text }: { text: string }) {
  return <div className="py-6 text-center text-[13px] text-text-muted">{text}</div>;
}

export function StatRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2 text-[13.5px]">
      <span className="text-text-secondary">{label}</span>
      <span className="font-semibold text-text">{value}</span>
    </div>
  );
}
