/** Equipment Checklist (Operation Management): the items of the catering equipment template, and shared types. */

export type ChecklistItem = { name: string; side: "left" | "right"; out: number | null; in: number | null };

export type SignatureKey = "out_prepared" | "out_checked" | "in_received" | "in_checked";

export const SIGNATURES: { key: SignatureKey; label: string; group: "out" | "in" }[] = [
  { key: "out_prepared", label: "Prepared by (Equipment Out)", group: "out" },
  { key: "out_checked", label: "Checked by (Equipment Out)", group: "out" },
  { key: "in_received", label: "Received by (Equipment In)", group: "in" },
  { key: "in_checked", label: "Checked by (Equipment In)", group: "in" },
];

/** The items of TEMPLATE EQUIPMENT CATERING.xlsx, spelling corrected, duplicates removed, in the same two columns. */
export const TEMPLATE_ITEMS: { left: string[]; right: string[] } = {
  left: [
    "Dome Set",
    "Base Dome",
    "Tray Dome",
    "Round Insert",
    "Edge Dome",
    "Small Bowl (Porridge)",
    "Rice Bowl",
    "Stainless Steel Water Pitcher",
    "Thermos Flask",
    "Melamine Round Dinner Plate",
    "Melamine Round B/B Plate",
    "Ceramic Round Dinner Plate",
    "Ceramic White Plate (Pinggan Putih)",
    "Melamine Bowl",
    "Ceramic Coffee Cup",
    "Melamine Coffee Cup (Old/New)",
    "Ceramic Saucer",
    "Ceramic B/B Plate",
    "Goblet",
    "Blue Juice Glass",
    "Glass Juice Glass / High Bowl",
    "Blue Line Small Bowl",
    "Teaspoon (Small/Medium)",
    "Blue Line Medium Square Plate",
    "Blue Line Dinner Plate",
    "Blue Line Small Square Plate",
    "Blue Line Oval Plate",
    "Blue Line Footed Plate",
    "Blue Line Rice Bowl",
    "Electric Soup Tureen",
    "Chafing Dish (Long)",
    "Chafing Dish (Round)",
    "Stainless Steel Coffee Urn (Large)",
    "Stainless Steel Coffee Urn (Small)",
  ],
  right: [
    "Long Insert",
    "Deep Insert",
    "Stainless Steel Round/Oval Fork & Spoon",
    "Fork",
    "Spoon",
    "Dessert Spoon",
    "Dessert Fork",
    "VIP Dessert Spoon",
    "VIP Dessert Fork",
    "Food Tongs (Large/Small)",
    "Buffet Serving Gear",
    "Ladle (Porridge/Large/Small)",
    "Stainless Steel Ladle",
    "Napkin (Cream/Blue/White)",
    "VIP Plate Mat (Alas Pinggan)",
    "Chinese Spoon",
    "Dinner Spoon",
    "Dinner Fork",
  ],
};

export function templateItems(): ChecklistItem[] {
  return [
    ...TEMPLATE_ITEMS.left.map((name) => ({ name, side: "left" as const, out: null, in: null })),
    ...TEMPLATE_ITEMS.right.map((name) => ({ name, side: "right" as const, out: null, in: null })),
  ];
}

/** The saved items, with any template item that is missing added back (so the form always shows the full template). */
export function mergeWithTemplate(saved: ChecklistItem[] | null | undefined): ChecklistItem[] {
  const list = (saved ?? []).map((i) => ({ ...i, side: i.side === "right" ? ("right" as const) : ("left" as const) }));
  const have = new Set(list.map((i) => i.name.toLowerCase()));
  for (const t of templateItems()) if (!have.has(t.name.toLowerCase())) list.push(t);
  return list;
}

/** Status of a checklist, for the list of events. */
export function checklistStatus(items: ChecklistItem[], signed: Partial<Record<SignatureKey, boolean>>): { label: string; tone: "neutral" | "warning" | "success" | "danger"; short: number } {
  const used = items.filter((i) => (i.out ?? 0) > 0);
  const short = used.reduce((sum, i) => sum + Math.max(0, (i.out ?? 0) - (i.in ?? 0)), 0);
  if (used.length === 0) return { label: "Not started", tone: "neutral", short: 0 };
  if (!signed.in_received && !signed.in_checked) return { label: "Equipment out", tone: "warning", short };
  if (short > 0) return { label: `${short} pcs missing`, tone: "danger", short };
  return { label: "All returned", tone: "success", short: 0 };
}
