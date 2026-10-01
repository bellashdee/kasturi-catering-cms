import { KNOWLEDGE_BASE, type KBEntry } from "./knowledge";
import type { ModuleKey } from "@/lib/constants";

function tokenize(s: string): Set<string> {
  return new Set(s.toLowerCase().match(/[a-z0-9]+/g) ?? []);
}

/**
 * Deliberately simple word-overlap scoring — no vector DB needed at this
 * scale. Uses token overlap rather than substring matching so a natural
 * phrasing like "upload an invoice" still matches the keyword "upload
 * invoice" even though the exact phrase isn't a substring of the question.
 */
export function searchKnowledgeBase(question: string, moduleHint: ModuleKey | "general", limit = 4): KBEntry[] {
  const qTokens = tokenize(question);

  const scored = KNOWLEDGE_BASE.map((entry) => {
    let score = 0;
    for (const kw of entry.keywords) {
      const kwTokens = [...tokenize(kw)];
      if (kwTokens.length === 0) continue;
      const hits = kwTokens.filter((t) => qTokens.has(t)).length;
      if (hits === 0) continue;
      score += hits === kwTokens.length ? hits + 2 : hits;
    }
    if (entry.module === moduleHint) score += 2;
    return { entry, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.entry);
}
