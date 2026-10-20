/** Words that start many Malaysian names but are not what the person is called (MUHAMMAD, MOHD, NUR ...). */
const NAME_PREFIXES = new Set(["MUHAMMAD", "MUHAMAD", "MOHAMMAD", "MOHAMAD", "MOHD", "MD", "MUHD", "NUR", "NIK", "WAN", "SITI", "NOR", "NURUL", "AHMAD", "ABDUL", "ABD", "AB"]);
/** Common Chinese surnames: the given name follows them. */
const SURNAMES = new Set(["CHAN", "TAN", "LIM", "LEE", "WONG", "NG", "LOW", "LAU", "LIEW", "CHONG", "YAP", "GOH", "TEO", "ONG", "CHEW", "KOH", "SIM", "HO", "CHIN", "YEO", "FOO", "LOH", "WEE"]);

/**
 * The name a person is called at work, shown as a label (birthday calendar): the short name written on the staff record when there is
 * one; otherwise worked out from the full name: a nickname in brackets, the first real name before BIN / BINTI (MUHAMMAD SYAMIE BIN
 * SAIPULLAZIM gives SYAMIE), the given name after a Chinese surname, or the first words of a short foreign name.
 */
export function shortNameOf(fullName: string, stored?: string | null): string {
  const given = stored?.trim();
  if (given) return given.toUpperCase();
  const name = fullName.toUpperCase().replace(/\s+/g, " ").trim();
  const nick = name.match(/\(([^)]+)\)/)?.[1]?.trim();
  if (nick) return nick;
  const words = name.replace(/\.+/g, " ").split(" ").filter(Boolean);
  const cut = words.findIndex((w) => w === "BIN" || w === "BINTI" || w === "B." || w === "BT");
  const own = cut > 0 ? words.slice(0, cut) : words;
  const real = own.filter((w) => !NAME_PREFIXES.has(w));
  const use = real.length > 0 ? real : own;
  if (cut > 0) return use[0] ?? name;
  if (use.length > 1 && SURNAMES.has(use[0])) return use.slice(1).join(" ");
  return use.length <= 2 ? use.join(" ") : use.slice(0, 2).join(" ");
}
