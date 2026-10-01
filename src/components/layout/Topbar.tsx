import { ROLE_LABEL, type SessionContext } from "@/lib/auth";
import { SignOutButton } from "./SignOutButton";
import { MobileMenuButton } from "./MobileMenuButton";

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function Topbar({ session }: { session: SessionContext }) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border bg-surface px-4 sm:gap-4 sm:px-6 print:hidden">
      <MobileMenuButton />

      <div className="min-w-0 flex-1">
        <div className="hidden text-[11.5px] font-semibold text-text-muted sm:block">Central Management System</div>
      </div>

      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-[12px] font-bold text-white">
          {initials(session.fullName) || "?"}
        </div>
        <div className="hidden sm:block">
          <div className="text-[13px] font-semibold leading-tight">{session.fullName}</div>
          <div className="text-[11px] leading-tight text-text-muted">{ROLE_LABEL[session.role]}</div>
        </div>
      </div>

      <div className="h-6 w-px bg-border" />
      <SignOutButton />
    </header>
  );
}
