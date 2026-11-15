"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { runAction, type ActionResult } from "@/lib/actionResult";
import { recordAudit } from "@/lib/audit";
import { geminiGenerate } from "@/lib/ai/gemini";
import { menuText, type MenuFromPdf, type MenuSection } from "@/lib/catering/menuPdf";

const PROMPT = `You are reading the text of a final quotation or invoice of a catering company in Malaysia (made in AutoCount). The kitchen needs the MENU: the food and drinks that will be cooked or served.
Respond with ONLY a JSON object, no other text:
{
  "document_type": "quotation" | "invoice" | "other",
  "document_number": the quotation / invoice number as printed, else null,
  "sections": [
    {
      "label": the name of this part of the menu as printed (e.g. "Day 1 - Lunch", "Breakfast", "Hi-Tea", "Menu A"), else null,
      "date": the date printed for this part, as YYYY-MM-DD, else null,
      "pax": the number of pax printed for this part (a whole number), else null,
      "items": the dishes and drinks of this part, one entry per dish, exactly as printed
    }
  ]
}
Rules:
- Only food and drinks. Leave out prices, amounts, quantities, units, taxes, service charges, deposits, transport, set-up, equipment, tents, tables, crockery, staff, decoration and terms and conditions.
- When one line lists several dishes (separated by commas, slashes, "&" or new lines), give each dish as its own entry. Keep the dish names as printed (Malay or English), without numbering or bullets.
- One section per menu part (per day, per meal, or per menu option). If the document has only one menu, return one section.
- Never invent a dish, a date or a pax that is not in the text. If there is no menu in the text, return "sections": [].`;

type Raw = { document_type?: unknown; document_number?: unknown; sections?: unknown };

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

function clean(raw: Raw): MenuFromPdf {
  const sections: MenuSection[] = (Array.isArray(raw.sections) ? raw.sections : [])
    .map((s: Record<string, unknown>) => {
      const date = str(s?.date);
      const pax = Number(s?.pax);
      return {
        label: str(s?.label),
        date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
        pax: Number.isFinite(pax) && pax > 0 ? Math.round(pax) : null,
        items: (Array.isArray(s?.items) ? s.items : []).map((i: unknown) => str(i)).filter((i: string | null): i is string => !!i),
      };
    })
    .filter((s) => s.items.length > 0);
  return { documentType: str(raw.document_type), documentNumber: str(raw.document_number), sections };
}

/** Picks the menu out of the text of the event's quotation / invoice PDF. Nothing is saved here. */
export async function readMenuFromPdfText(input: { eventId: string; text: string }): Promise<ActionResult<{ menu: MenuFromPdf }>> {
  return runAction(async () => {
    const session = await getSessionContext();
    if (!session) throw new Error("Please sign in again.");
    const supabase = await createClient();
    const { data: event } = await supabase.from("catering_events").select("id").eq("id", input.eventId).maybeSingle();
    if (!event) throw new Error("This event was not found, or you do not have access to it.");
    const text = input.text.trim();
    if (text.length < 20) throw new Error("This PDF has no text to read (it may be a scan or a photo). Upload the PDF saved from AutoCount.");
    if (!process.env.GEMINI_API_KEY) throw new Error("The menu reader is not set up (no AI key). Type the menu with Edit instead.");
    const answer = await geminiGenerate({
      system: PROMPT,
      turns: [{ role: "user", parts: [{ text: `Text of the document:\n\n${text.slice(0, 40_000)}` }] }],
      maxOutputTokens: 4096,
      json: true,
    });
    let raw: Raw;
    try {
      raw = JSON.parse(answer.replace(/^```(?:json)?\s*|\s*```$/g, "")) as Raw;
    } catch {
      throw new Error("The menu could not be read from this PDF. Try again, or type the menu with Edit.");
    }
    const menu = clean(raw);
    if (menu.sections.length === 0) throw new Error("No menu was found in this PDF. Check that it is the quotation or invoice with the menu.");
    return { menu };
  }, "The menu could not be read from this PDF. Try again.");
}

/** Where a part of the menu goes: the event's own menu, or one day of a multi-day event. */
export type MenuTarget = { target: "event" | string; items: string[] };

/**
 * Saves the menu read from the PDF (after the person checked it) as the event's menu, which the kitchen uses for its purchase request.
 * The menu of each chosen day (or of the event) is replaced; days not chosen keep theirs. The PDF stays linked to the event.
 */
export async function saveMenuFromPdf(input: { eventId: string; documentId: string | null; documentNumber: string | null; targets: MenuTarget[] }): Promise<ActionResult> {
  return runAction(async () => {
    const session = await getSessionContext();
    if (!session) throw new Error("Please sign in again.");
    const supabase = await createClient();
    const { data: event } = await supabase.from("catering_events").select("id, company_id, menu_description").eq("id", input.eventId).maybeSingle();
    if (!event) throw new Error("This event was not found, or you do not have access to it.");

    // several parts put into the same place are joined, in the order of the document
    const byTarget = new Map<string, string[]>();
    for (const t of input.targets) {
      const items = t.items.map((i) => i.trim()).filter(Boolean);
      if (items.length === 0) continue;
      byTarget.set(t.target, [...(byTarget.get(t.target) ?? []), ...items]);
    }
    if (byTarget.size === 0) throw new Error("There is no menu to save. Choose where each part of the menu goes.");

    const { data: days } = await supabase.from("catering_event_days").select("id, day_date").eq("catering_event_id", event.id);
    const dayIds = new Set((days ?? []).map((d) => d.id));
    const changed: string[] = [];
    for (const [target, items] of byTarget) {
      if (target === "event") {
        const { error } = await supabase.from("catering_events").update({ menu_description: menuText(items) }).eq("id", event.id);
        if (error) throw error;
        changed.push(`event menu (${items.length} dishes)`);
      } else {
        if (!dayIds.has(target)) throw new Error("A chosen day is not part of this event. Reload the page and try again.");
        const { error } = await supabase.from("catering_event_days").update({ menu_details: menuText(items) }).eq("id", target).eq("catering_event_id", event.id);
        if (error) throw error;
        const day = (days ?? []).find((d) => d.id === target);
        changed.push(`${day?.day_date ?? "day"} (${items.length} dishes)`);
      }
    }

    // the PDF stays with the event, for the kitchen to open
    if (input.documentId) {
      await supabase.from("documents").update({ related_table: "catering_events", related_id: event.id, reviewed_at: new Date().toISOString(), reviewed_by: session.userId }).eq("id", input.documentId);
    }
    await recordAudit({
      companyId: event.company_id,
      relatedTable: "catering_events",
      relatedId: event.id,
      action: "menu_from_pdf",
      newValue: `Menu from ${input.documentNumber ?? "the quotation / invoice PDF"}: ${changed.join(", ")}`,
    });
    revalidatePath(`/catering/${event.id}`);
    revalidatePath("/kitchen/purchase-requests/event");
    revalidatePath("/kitchen/plan");
    return {};
  });
}
