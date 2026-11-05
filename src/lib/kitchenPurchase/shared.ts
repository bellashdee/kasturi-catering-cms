import type { SupabaseClient } from "@supabase/supabase-js";

/** The tables of the Kitchen purchase request are not in the generated types yet, so they are reached through an untyped client. */
export function untyped(client: unknown): SupabaseClient {
  return client as SupabaseClient;
}

export const UNITS = ["KG", "GRAM", "LITRE", "ML", "BOTTLE", "PACKET", "BOX", "CARTON", "PCS", "TIN", "BLOCK"] as const;

/** An ingredient unit as written in the stock list ("kg", "g", "pcs") as one of the units of the purchase request. */
export function normalizeUnit(raw: string | null | undefined): string {
  const u = (raw ?? "").trim().toUpperCase().replace(/\./g, "");
  const map: Record<string, string> = { KG: "KG", KGS: "KG", KILO: "KG", KILOGRAM: "KG", G: "GRAM", GM: "GRAM", GRAM: "GRAM", GRAMS: "GRAM", L: "LITRE", LT: "LITRE", LITRE: "LITRE", LITER: "LITRE", ML: "ML", BTL: "BOTTLE", BOTTLE: "BOTTLE", PKT: "PACKET", PACK: "PACKET", PACKET: "PACKET", BOX: "BOX", CTN: "CARTON", CARTON: "CARTON", PC: "PCS", PCS: "PCS", PIECE: "PCS", PIECES: "PCS", TIN: "TIN", CAN: "TIN", BLOCK: "BLOCK" };
  return map[u] ?? (UNITS as readonly string[]).find((x) => x === u) ?? "PCS";
}

/** The same item written a little differently ("butter ", "BUTTER") is one item. */
export function itemKey(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
}

export const REQUEST_STATUSES = ["draft", "pending_submission", "submitted", "under_review", "revision_required", "pending_approval", "approved", "purchased", "completed", "rejected"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const STATUS_LABEL: Record<RequestStatus, string> = {
  draft: "Draft",
  pending_submission: "Pending Submission",
  submitted: "Submitted to Purchaser",
  under_review: "Under Review",
  revision_required: "Revision Required",
  pending_approval: "Pending Approval",
  approved: "Approved",
  purchased: "Purchased",
  completed: "Completed",
  rejected: "Rejected",
};

export function statusTone(status: string): "success" | "warning" | "danger" | "info" | "neutral" {
  if (status === "completed" || status === "approved" || status === "purchased") return "success";
  if (status === "rejected") return "danger";
  if (status === "revision_required") return "warning";
  if (status === "submitted" || status === "under_review" || status === "pending_approval") return "info";
  return "neutral";
}

/** Kitchen can change the list while it is theirs: before it is submitted, and after the Purchaser sent it back. */
export const KITCHEN_EDITABLE: RequestStatus[] = ["draft", "pending_submission", "revision_required"];
/** The Purchaser works on the prices once Kitchen has submitted it, until it goes for approval. */
export const PURCHASER_WORKING: RequestStatus[] = ["under_review"];

export type RequestItem = {
  id: string;
  sortOrder: number;
  itemName: string;
  unit: string;
  quantity: number | null;
  menus: string[];
  remark: string | null;
  selectedQuoteId: string | null;
};

export type Quote = {
  id: string;
  supplierId: string;
  supplierName: string;
  itemKey: string;
  pricePerUnit: number;
  unit: string;
  quotedOn: string;
  note: string | null;
  createdAt: string;
};

/** Estimated total of one line: the quantity Kitchen wrote times the price per unit the Purchaser selected. */
export function lineTotal(quantity: number | null, price: number | null): number | null {
  if (quantity === null || price === null) return null;
  return Math.round(quantity * price * 100) / 100;
}

export type MenuIngredients = { menu: string; lines: { name: string; unit: string | null }[] };

/**
 * The ingredients of the selected menus as one purchase list: an ingredient that appears in several menus becomes ONE item that keeps
 * the name of every menu it came from. No quantity is worked out: the quantity stays empty for Kitchen to write. When the menus write
 * the same ingredient in different units, the first unit is kept and the item carries a remark so that Kitchen confirms the unit.
 */
export function consolidateIngredients(menus: MenuIngredients[]): { itemName: string; unit: string; menus: string[]; remark: string | null }[] {
  const byKey = new Map<string, { itemName: string; unit: string; menus: string[]; units: Set<string> }>();
  for (const m of menus) {
    for (const line of m.lines) {
      const name = line.name.replace(/\s+/g, " ").trim();
      if (!name) continue;
      const key = itemKey(name);
      const unit = normalizeUnit(line.unit);
      const cur = byKey.get(key);
      if (cur) {
        if (!cur.menus.includes(m.menu)) cur.menus.push(m.menu);
        cur.units.add(unit);
      } else byKey.set(key, { itemName: name, unit, menus: [m.menu], units: new Set([unit]) });
    }
  }
  return [...byKey.values()].map((x) => ({
    itemName: x.itemName,
    unit: x.unit,
    menus: x.menus,
    remark: x.units.size > 1 ? `The menus use different units (${[...x.units].join(" / ")}). Kitchen: confirm the unit.` : null,
  }));
}
