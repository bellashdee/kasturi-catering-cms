export type Dictionary = Record<string, string>;

export type Translator = {
  /** Translates a piece of text; text that is not in the dictionary is returned unchanged (the English fallback). */
  translate: (text: string) => string;
};

const PLACEHOLDER = /\{(\d+)\}/g;

const collapse = (s: string) => s.replace(/\s+/g, " ").trim();

type Pattern = { regex: RegExp; target: string; weight: number; /** the longest fixed piece of the key: a text without it cannot match, which is checked first because it is cheap */ needle: string };

/**
 * Builds a translator from a dictionary whose keys are the English texts. A key with {0}, {1} ... is a pattern: it matches
 * text with those parts filled in ("{0} overdue supplier invoice(s)") and puts the same parts into the translation.
 */
export function createTranslator(dict: Dictionary | null, finish?: (text: string) => string): Translator {
  if (!dict) return { translate: (text) => text };

  const exact = new Map<string, string>();
  const lower = new Map<string, string>();
  const patterns: Pattern[] = [];
  for (const [key, value] of Object.entries(dict)) {
    if (!value) continue;
    if (/\{\d+\}/.test(key)) {
      const escaped = key.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace(/\{\d+\}/g, (m) => `{${m.slice(1, -1)}}`);
      const source = escaped.replace(/\{(\d+)\}/g, "(?<g$1>.+?)");
      try {
        const needle = key.split(PLACEHOLDER).map((piece) => collapse(piece)).sort((a, b) => b.length - a.length)[0] ?? "";
        patterns.push({ regex: new RegExp(`^${source}$`, "s"), target: value, weight: key.replace(PLACEHOLDER, "").length, needle });
      } catch {
        // a malformed pattern is skipped, never breaks the page
      }
    } else {
      const core = collapse(key);
      exact.set(core, value);
      // the same words in small letters: a name kept in capitals in the database ("BAKERY & BREAD") finds the dictionary's "Bakery & bread"
      if (!lower.has(core.toLowerCase())) lower.set(core.toLowerCase(), value);
    }
  }
  patterns.sort((a, b) => b.weight - a.weight);

  const cache = new Map<string, string>();

  function translate(text: string): string {
    const lead = text.match(/^\s*/)?.[0] ?? "";
    const trail = text.match(/\s*$/)?.[0] ?? "";
    const core = collapse(text);
    if (!core) return text;
    // numbers, dates, times and amounts have no words to translate (most of the text of a long list)
    if (!/[A-Za-z]/.test(core)) return text;

    const cached = cache.get(core);
    if (cached !== undefined) return lead + cached + trail;

    let result = exact.get(core);
    // a text written in capitals only (a category or department kept in capitals in the database) is found by its small-letter form and
    // the translation is put in capitals too
    if (result === undefined && core === core.toUpperCase()) {
      const small = lower.get(core.toLowerCase());
      if (small !== undefined) result = small.toUpperCase();
    }
    if (result === undefined) {
      for (const p of patterns) {
        if (p.needle && !core.includes(p.needle)) continue;
        const m = p.regex.exec(core);
        if (m?.groups) {
          result = p.target.replace(PLACEHOLDER, (_, n: string) => m.groups?.[`g${n}`] ?? "");
          break;
        }
      }
    }
    // several choices kept in one text ("CLEANING & SANITATION SUPPLIES | MISCELLANEOUS") are translated one by one
    if (result === undefined && core.includes(" | ")) {
      const parts = core.split(" | ");
      const done = parts.map((part) => translate(part));
      if (done.some((p, i) => p !== parts[i])) result = done.join(" | ");
    }
    // `finish` puts the language's own touch on the result (month names inside a sentence), whether or not the text was in the dictionary
    const final = finish ? finish(result ?? core) : (result ?? core);
    if (cache.size < 5000) cache.set(core, final);
    return lead + final + trail;
  }

  return { translate };
}

/** Fills {name} style variables of a message: t("Hello {name}", { name }). */
export function fillVars(text: string, vars?: Record<string, string | number>): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}
