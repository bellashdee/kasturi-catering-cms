"use client";

import { useEffect } from "react";
import { isLanguage } from "@/lib/i18n/config";
import { useI18n } from "@/components/i18n/I18nProvider";

const FLAG = "cms_lang_synced";

/**
 * Once per browser session, applies the language saved on the signed-in person's profile, so a sign-in on another device
 * (or after logout and login) opens in their own language. After that, what they pick in the menu wins.
 */
export function LanguageBootstrap({ profileLanguage }: { profileLanguage: string | null }) {
  const { lang, setLanguage } = useI18n();

  useEffect(() => {
    try {
      if (sessionStorage.getItem(FLAG)) return;
      sessionStorage.setItem(FLAG, "1");
    } catch {
      // storage can be blocked: then the profile language is simply applied every time the page opens
    }
    if (isLanguage(profileLanguage) && profileLanguage !== lang) setLanguage(profileLanguage, { persist: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on the first load of the session
  }, []);

  return null;
}
