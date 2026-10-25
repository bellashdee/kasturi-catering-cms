/** The number of a supplier as WhatsApp wants it (digits with the country code, no + or spaces), or null when there is no usable number. */
export function whatsappNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  // a supplier can have several numbers in the box ("012-345 6789 / 016-111 2222"): the first one is used
  const candidates = phone.split(/[/,;&]|\bor\b|\bdan\b/i).map((p) => p.replace(/\D/g, ""));
  const digits = candidates.find((d) => d.length >= 8);
  if (!digits) return null;
  const national = digits.startsWith("00") ? digits.slice(2) : digits;
  if (national.startsWith("0")) return `60${national.slice(1)}`; // Malaysian number written with the leading 0
  if (national.startsWith("60")) return national;
  if (/^1\d{8,9}$/.test(national)) return `60${national}`; // Malaysian mobile written without the 0
  return national;
}

const dateOf = (iso: string) => iso.replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$3/$2/$1");

/** The events as written on the order, with their dates as day/month/year: "Wedding A (25/12/2026); Dinner B (02/01/2027)". */
export function eventsText(sourceEvents: string | null | undefined): string {
  return (sourceEvents ?? "").replace(/\((\d{4})-(\d{2})-(\d{2})\)/g, (_m, y: string, m: string, d: string) => `(${d}/${m}/${y})`).trim();
}

const qtyText = (q: number) => String(Math.round(q * 1000) / 1000);

/** What is sent to the supplier on WhatsApp: the events with their dates and the items to order with their quantities. */
export function purchaseOrderMessage(o: {
  companyName: string;
  contactPerson?: string | null;
  poNumber: string;
  orderDate: string;
  sourceEvents: string | null;
  items: { itemName: string; quantity: number; unit: string | null }[];
}): string {
  const lines = [`Salam${o.contactPerson?.trim() ? ` ${o.contactPerson.trim()}` : ""},`, "", "Mohon sediakan barang berikut:"];
  const events = eventsText(o.sourceEvents);
  if (events) lines.push(`Event: ${events}`);
  lines.push(`No. pesanan: ${o.poNumber}`, `Tarikh pesanan: ${dateOf(o.orderDate)}`, "");
  o.items.forEach((i, n) => lines.push(`${n + 1}. ${i.itemName} - ${qtyText(i.quantity)}${i.unit?.trim() ? ` ${i.unit.trim()}` : ""}`));
  lines.push("", `Daripada: ${o.companyName}`, "Terima kasih.");
  return lines.join("\n");
}

/** The link that opens WhatsApp to the supplier with the message typed in (nothing is sent until the person presses send). */
export function whatsappLink(phone: string | null | undefined, message: string): string | null {
  const number = whatsappNumber(phone);
  return number ? `https://wa.me/${number}?text=${encodeURIComponent(message)}` : null;
}
