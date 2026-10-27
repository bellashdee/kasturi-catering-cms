import Link from "next/link";
import type { Alert } from "@/lib/queries/dashboard";
import { SectionCard, EmptyRow } from "./SectionCard";

const DOT_COLOR: Record<Alert["severity"], string> = {
  danger: "bg-danger",
  warning: "bg-warning",
  info: "bg-primary",
};

export function AlertsPanel({ alerts }: { alerts: Alert[] }) {
  return (
    <SectionCard title="Alerts">
      {alerts.length === 0 ? (
        <EmptyRow text="No alerts right now — everything is on track." />
      ) : (
        <div className="-mx-5 -mb-5 divide-y divide-border">
          {alerts.map((a, i) => {
            const body = (
              <>
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT_COLOR[a.severity]}`} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-semibold text-text">{a.title}</div>
                  <div className="mt-0.5 text-xs text-text-muted">{a.meta}</div>
                </div>
              </>
            );
            const cls = "flex items-start gap-3 px-5 py-3.5";
            return a.href ? (
              <Link key={i} href={a.href} className={`${cls} hover:bg-bg`}>
                {body}
              </Link>
            ) : (
              <div key={i} className={cls}>
                {body}
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}
