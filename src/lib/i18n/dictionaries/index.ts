import type { Language } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/translate";

/**
 * One dictionary per language, loaded only when that language is used (English needs none: the English text in the code is
 * the source). Each dictionary maps an English text to its translation; see lib/i18n/translate.ts.
 */
export const DICTIONARY_LOADERS: Record<Language, (() => Promise<Dictionary>) | null> = {
  ms: () => import("./ms").then((m) => m.default),
  en: null,
  zh: () => import("./zh").then((m) => m.default),
  my: () => import("./my").then((m) => m.default),
  bn: () => import("./bn").then((m) => m.default),
};
