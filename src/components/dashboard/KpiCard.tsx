export function KpiCard({
  label,
  value,
  hint,
  tone = "neutral",
  iconTone = "info",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "success" | "warning" | "danger";
  iconTone?: "info" | "success" | "warning" | "danger";
}) {
  const hintColor = {
    neutral: "text-text-muted",
    success: "text-success",
    warning: "text-warning",
    danger: "text-danger",
  }[tone];

  const iconBg = {
    info: "bg-info-bg",
    success: "bg-success-bg",
    warning: "bg-warning-bg",
    danger: "bg-danger-bg",
  }[iconTone];

  return (
    <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="text-[11.5px] font-bold uppercase tracking-wide text-text-muted">
          {label}
        </div>
        <div className={`h-[30px] w-[30px] rounded-lg ${iconBg}`} />
      </div>
      <div className="mt-2 text-2xl font-extrabold text-text">{value}</div>
      {hint && <div className={`mt-1.5 text-xs font-semibold ${hintColor}`}>{hint}</div>}
    </div>
  );
}
