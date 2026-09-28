const TONE_CLASSES: Record<string, string> = {
  success: "bg-success-bg text-success",
  warning: "bg-warning-bg text-warning",
  danger: "bg-danger-bg text-danger",
  info: "bg-info-bg text-primary",
  neutral: "bg-[#F2F4F7] text-text-secondary",
};

export function StatusBadge({
  tone = "neutral",
  children,
}: {
  tone?: "success" | "warning" | "danger" | "info" | "neutral";
  children: React.ReactNode;
}) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11.5px] font-bold ${TONE_CLASSES[tone]}`}>
      {children}
    </span>
  );
}
