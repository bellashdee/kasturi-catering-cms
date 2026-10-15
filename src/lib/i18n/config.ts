/** The languages of the interface. The English text written in the code is the source: it is also the fallback when a translation is missing. */
export const LANGUAGES = [
  { code: "ms", native: "Bahasa Melayu", short: "BM", locale: "ms-MY" },
  { code: "en", native: "English", short: "EN", locale: "en-GB" },
  { code: "zh", native: "中文", short: "中文", locale: "zh-CN" },
  { code: "my", native: "မြန်မာဘာသာ", short: "မြန်", locale: "my-MM" },
  { code: "bn", native: "বাংলা", short: "বাং", locale: "bn-BD" },
] as const;

export type Language = (typeof LANGUAGES)[number]["code"];

/** Used when a person has not chosen a language yet. */
export const DEFAULT_LANGUAGE: Language = "ms";

export const LANGUAGE_COOKIE = "cms_lang";

export function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && LANGUAGES.some((l) => l.code === value);
}

/**
 * The Intl locale of a language. Digits stay 0-9 in every language (the "nu-latn" extension), so amounts, dates and invoice
 * numbers read the same and are never mistaken for another figure; month and day names follow the language.
 */
export function intlLocale(lang: Language): string {
  const base = LANGUAGES.find((l) => l.code === lang)?.locale ?? "en-GB";
  return `${base}-u-nu-latn`;
}
