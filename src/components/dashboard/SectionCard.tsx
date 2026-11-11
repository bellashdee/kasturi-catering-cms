export function SectionCard({
  title,
  action,
  children,
  noPrint = false,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  /** left out of the printed page (cards that only make sense on screen) */
  noPrint?: boolean;
}) {
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
