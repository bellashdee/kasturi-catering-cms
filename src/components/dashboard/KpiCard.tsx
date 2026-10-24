export type KpiIconName = "sales" | "expenses" | "costing" | "supplier" | "invoice" | "calendar" | "payments" | "approvals";

const ICON_PATH: Record<KpiIconName, React.ReactNode> = {
  sales: <path d="M3 17l6-6 4 4 8-9M15 6h6v6" />,
  expenses: <path d="M21 17l-6-6-4 4-8-9M9 18H3v-6" />,
  costing: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 7h8M8 11h2M12 11h2M16 11h0M8 15h2M12 15h2M16 15h0" />
    </>
  ),
  supplier: (
    <>
      <path d="M3 8l9-5 9 5v9l-9 5-9-5V8Z" />
      <path d="M3 8l9 5 9-5M12 13v9" />
    </>
  ),
  invoice: (
    <>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" />
      <path d="M9 8h6M9 12h6" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  payments: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  approvals: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l3 3 5-6" />
    </>
  ),
};

export function KpiCard({
  label,
  value,
  hint,
  tone = "neutral",
  iconTone = "info",
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "success" | "warning" | "danger";
  iconTone?: "info" | "success" | "warning" | "danger";
  icon?: KpiIconName;
}) {
  const hintColor = {
    neutral: "text-text-secondary",
    success: "text-success",
    warning: "text-warning",
    danger: "text-danger",
  }[tone];

  const iconStyle = {
    info: "bg-info-bg text-primary",
    success: "bg-success-bg text-success",
    warning: "bg-warning-bg text-warning",
    danger: "bg-danger-bg text-danger",
  }[iconTone];

  return (
    <div className="min-w-0 rounded-3xl border border-border bg-surface p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="text-[12.5px] font-bold uppercase tracking-wide text-text-secondary">{label}</div>
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-[1.5px] border-[#cfae67] ${iconStyle}`} aria-hidden="true">
          {icon && (
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              {ICON_PATH[icon]}
            </svg>
          )}
        </div>
      </div>
      <div className="mt-3 break-words text-[28px] font-extrabold leading-tight tabular-nums text-text">{value}</div>
      {hint && <div className={`mt-1.5 text-[13px] font-semibold ${hintColor}`}>{hint}</div>}
    </div>
  );
}
