import type { KState } from "./types";

export type EoCalcInput = {
  companyId: string;
  companyName: string;
  eventId: string | null;
  eventName: string | null;
  eventDate: string | null;
  sessions: { name: string; pax: number | null; items: { name: string; recipeId: string | null }[] }[];
  compareStock: boolean;
};

/** The kitchen calculator's state for a menu taken from an Event Order (every recipe was chosen by a person on the screen). */
export function buildEoState(input: EoCalcInput): KState {
  return {
    version: 1,
    companyId: input.companyId,
    companyName: input.companyName,
    event: input.eventId
      ? { id: input.eventId, name: input.eventName ?? "", date: input.eventDate ?? "", status: "", eventTime: null, setupTime: null, sessions: [], menu: [] }
      : null,
    photoEventName: input.eventId ? null : input.eventName,
    sessions: input.sessions.map((s, i) => ({
      id: `s${i}`,
      name: s.name,
      pax: s.pax,
      paxSource: "user" as const,
      items: s.items.map((it, j) => ({
        id: `s${i}-i${j}`,
        name: it.name,
        recipeId: it.recipeId,
        recipeBy: "user" as const,
        candidates: [],
        estimate: null,
        origin: input.eventId ? ("event" as const) : ("typed" as const),
        note: null,
      })),
    })),
    documentIds: [],
    unitMode: "auto",
    mismatches: [],
    readerIssues: [],
    view: "ingredients",
    viewDish: null,
    stockCompared: input.compareStock,
  };
}
