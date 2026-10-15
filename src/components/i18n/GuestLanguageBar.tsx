import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";

/** The language menu for pages without the dashboard header (login, sign-up and the public forms), fixed in the top corner. */
export function GuestLanguageBar() {
  return (
    <div className="fixed right-3 top-3 z-40 print:hidden">
      <LanguageSwitcher />
    </div>
  );
}
