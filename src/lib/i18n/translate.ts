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
      exact.set(collapse(key), value);
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
