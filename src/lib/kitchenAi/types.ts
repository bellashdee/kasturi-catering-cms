import type { Candidate } from "./match";
import type { UnitMode } from "./units";

export type Lang = "en" | "ms";

export type EstimateLine = { name: string; quantity: number; unit: string };

/** An AI-written starting estimate for a dish that has no recipe. It is never an official recipe and must be reviewed first. */
export type Estimate = {
  /** the number of servings the quantities were written for */
  basisPax: number;
  /** the serving size and cooking basis the AI assumed, in its own words */
  assumptions: string[];
  lines: EstimateLine[];
  status: "pending" | "reviewed";
  reviewedBy: string | null;
  reviewedAt: string | null;
};

export type KItem = {
  id: string;
  /** the dish exactly as read from the photo, typed, or taken from the event order */
  name: string;
  recipeId: string | null;
  /** "auto" = chosen by name match (shown for review), "user" = picked by a person */
  recipeBy: "auto" | "user" | null;
  candidates: Candidate[];
  estimate: Estimate | null;
  origin: "photo" | "event" | "typed";
  /** a remark written next to the dish on the menu (for example "no chilli") */
  note: string | null;
};

export type KSession = {
  id: string;
  name: string;
  pax: number | null;
  paxSource: "photo" | "event" | "user" | null;
  items: KItem[];
};

export type EventContext = {
  id: string;
  name: string;
  date: string;
  status: string;
  /** the kitchen preparation deadline: food-ready / event time and the set-up time, as they are in the order */
  eventTime: string | null;
  setupTime: string | null;
  sessions: { name: string; pax: number }[];
  /** the confirmed menu, one dish per entry */
  menu: string[];
};

export type KState = {
  version: 1;
  companyId: string;
  companyName: string;
  event: EventContext | null;
  /** the event name when the photo itself states one */
  photoEventName: string | null;
  sessions: KSession[];
  documentIds: string[];
  unitMode: UnitMode;
  /** differences found between the photo and the event order */
  mismatches: string[];
  /** problems with the photo itself (partly legible, cut off ...) */
  readerIssues: string[];
  view: "review" | "ingredients" | "shopping" | "suppliers" | "dish";
  viewDish: string | null;
  stockCompared: boolean;
};

/** A recipe as the calculator needs it. */
export type RecipeData = {
  id: string;
  name: string;
  yieldPax: number;
  lines: { ingredientId: string; name: string; quantity: number; unit: string | null }[];
};

export type StockInfo = { name: string; qty: number; unit: string | null };

export type CalcLine = {
  name: string;
  ingredientId: string | null;
  /** quantity in the base unit of its family (g, ml, pcs or the unit itself) */
  qty: number;
  family: "mass" | "volume" | "count" | "other";
  key: string;
  estimate: boolean;
};

export type CalcDish = {
  sessionId: string;
  sessionName: string;
  itemId: string;
  itemName: string;
  pax: number | null;
  source: "recipe" | "estimate" | "missing";
  recipeName: string | null;
  recipeYield: number | null;
  estimateStatus: "pending" | "reviewed" | null;
  lines: CalcLine[];
  /** why the dish has no quantities ("Recipe Data Required", "pax missing" ...) */
  problem: string | null;
};

export type ConsolRow = {
  name: string;
  ingredientId: string | null;
  family: CalcLine["family"];
  key: string;
  qty: number;
  /** the part of the quantity that comes from AI estimates (not from approved recipes) */
  estimateQty: number;
  stock: { qty: number; known: boolean } | null;
  shortage: number | null;
};

export type CalcSession = { id: string; name: string; pax: number | null; dishes: CalcDish[]; consolidated: ConsolRow[] };

export type CalcResult = {
  sessions: CalcSession[];
  combined: ConsolRow[];
  /** dishes with no recipe and no estimate, or no pax */
  needsData: { sessionName: string; itemId: string; itemName: string; reason: "recipe" | "pax" | "recipe_empty" }[];
  usesEstimate: boolean;
  usesPendingEstimate: boolean;
};
