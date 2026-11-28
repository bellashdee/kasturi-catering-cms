import { ROLE_LABEL, type SessionContext } from "@/lib/auth";
import { MobileMenuButton } from "./MobileMenuButton";
import { HeaderTitle } from "./HeaderTitle";
import { LiveClock } from "./LiveClock";
import { NotificationBell } from "./NotificationBell";
import { ProfileMenu } from "./ProfileMenu";
import { PageTutorialButton } from "./PageTutorialButton";
import { SyncStatus } from "@/components/offline/SyncStatus";

type Company = { id: string; name: string; legal_name: string };

export function Topbar({ session, companies, priorityTitle }: { session: SessionContext; companies: Company[]; priorityTitle?: string }) {
  return (
    <header className="flex h-[72px] shrink-0 items-center gap-3 border-b border-t-[3px] border-border border-t-company-current bg-surface px-4 shadow-sm sm:gap-5 sm:px-6 print:hidden">
      <MobileMenuButton />

      <div className="min-w-0 flex-1">
        <HeaderTitle companies={companies} priorityTitle={priorityTitle} />
      </div>

      <LiveClock />
      <div className="hidden h-8 w-px bg-border xl:block" />
      <SyncStatus />
      <PageTutorialButton />
      <NotificationBell userId={session.userId} />
      <ProfileMenu fullName={session.fullName} email={session.email} roleLabel={ROLE_LABEL[session.role]} />
    </header>
  );
}
