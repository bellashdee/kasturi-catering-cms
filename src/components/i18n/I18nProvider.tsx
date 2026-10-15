"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { LANGUAGE_COOKIE, intlLocale, type Language } from "@/lib/i18n/config";
import { DICTIONARY_LOADERS } from "@/lib/i18n/dictionaries";
import { startDomTranslation } from "@/lib/i18n/dom";
import { saveLanguage } from "@/lib/i18n/actions";
import { createTranslator, fillVars, type Translator } from "@/lib/i18n/translate";

type I18nValue = {
  lang: Language;
  /** Intl locale for dates and numbers (digits stay 0-9). */
  locale: string;
  /** Translates a text that is built in code (confirm dialogs, messages): t("Delete {name}?", { name }). */
  t: (text: string, vars?: Record<string, string | number>) => string;
  /** Changes the language at once, without reloading the page. `persist: false` is used when applying a saved profile choice. */
  setLanguage: (lang: Language, options?: { persist?: boolean }) => void;
};

const I18nContext = createContext<I18nValue | null>(null);

const IDENTITY: Translator = createTranslator(null);

export function I18nProvider({ initialLanguage, children }: { initialLanguage: Language; children: React.ReactNode }) {
  const [active, setActive] = useState<{ lang: Language; translator: Translator; ready: boolean }>({
    lang: initialLanguage,
    translator: IDENTITY,
    ready: false,
  });
  const latest = useRef(initialLanguage);

  const activate = useCallback(async (lang: Language) => {
    latest.current = lang;
    const loader = DICTIONARY_LOADERS[lang];
    let translator = IDENTITY;
    try {
      translator = createTranslator(loader ? await loader() : null);
    } catch {
      // the dictionary could not be loaded: the page stays in English instead of breaking
    }
    if (latest.current === lang) setActive({ lang, translator, ready: true });
  }, []);

  // load and apply the language the page was opened with
  useEffect(() => {
    const t = setTimeout(() => void activate(initialLanguage), 0);
    return () => clearTimeout(t);
  }, [activate, initialLanguage]);

  // translate the page now and keep translating what it shows later
  useEffect(() => {
    document.documentElement.lang = active.lang;
    if (!active.ready) return;
    const stop = startDomTranslation(active.translator, active.lang === "en");
    document.documentElement.dataset.i18n = "ready";
    return stop;
  }, [active]);

  const setLanguage = useCallback(
    (lang: Language, options?: { persist?: boolean }) => {
      document.cookie = `${LANGUAGE_COOKIE}=${lang}; path=/; max-age=31536000; samesite=lax`;
      void activate(lang);
      if (options?.persist !== false) void saveLanguage(lang).catch(() => undefined);
    },
    [activate],
  );

  const value = useMemo<I18nValue>(
    () => ({
      lang: active.lang,
      locale: intlLocale(active.lang),
      t: (text, vars) => fillVars(active.translator.translate(text), vars),
      setLanguage,
    }),
    [active, setLanguage],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
