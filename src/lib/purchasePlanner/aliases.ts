/**
 * The other names the kitchen and the suppliers use for the same thing (the recipe says BAWANG MERAH, the supplier sells it as BAWANG
 * HOLLAND). Only plain synonyms (Malay / English / spelling) are listed; nothing that is merely similar. A match found through an alias
 * is still a suggestion: the person can always choose another item.
 */
const RULES: [RegExp, string[]][] = [
  [/^BAWANG MERAH\b/, ["BAWANG HOLLAND"]],
  [/\b(SOO ?HOON|SUHUN)\b/, ["SOOHON"]],
  [/\b(MEE ?HUN|BEE ?HOON|BIHUN|MEEHON)\b/, ["MEEHON", "BIHUN BOTAN"]],
  [/\b(KUEH?|KWAY) ?(TIAW|TEOW)\b/, ["KUEH TEOW"]],
  [/\b(TAUGEH|TOGEH|TAUGE|TAO GEH)\b/, ["TAO GEH"]],
  [/^TOMATO (PES|PURE|PASTE|PUREE)\b/, ["TOMATO PUREE"]],
  [/^(AYAM CUT|AYAM POTONG|AYAM HIDUP|WHOLE CHICKEN)\b/, ["AYAM MUDA"]],
  [/\b(CHICKEN BREAST|DADA AYAM)\b/, ["BONELESS BREAST"]],
  [/^GARAM$/, ["GARAM HALUS"]],
  [/\b(MENTEGA|BUTTER)\b/, ["BUTTER"]],
  [/\b(MARJERIN|MAJERIN|MARGARINE|PLANTA)\b/, ["MAJERIN"]],
  [/\b(MAYONIS|MAYONNAISE)\b/, ["MAYO"]],
  [/\b(KICAP CAIR|KICAP MASIN|LIGHT SOY)\b/, ["LIGHT SOY SAUCE"]],
  [/\b(SIRAP ROS|CORDIAL ROS)\b/, ["DOUBLE LION ROSE"]],
  [/\bCORDIAL\b.*\bJAGUNG\b/, ["DOUBLE LION JAGUNG"]],
  [/\b(TOMATO SAUCE|SOS TOMATO)\b/, ["SOS TOMATO"]],
  [/\b(SOS CILI|SOS CHILI|CHILI SAUCE|CHILLI SAUCE)\b/, ["SOS CHILI", "MAGGI CHILI SAUCE"]],
  [/\b(LOBAK MERAH|CARROT)\b/, ["CARROT"]],
  [/\bPARSLEY\b/, ["PARSLEY", "PARSLY ENGLISH"]],
  [/\bBASIL\b/, ["BASIL LEAF"]],
  [/\bDORY\b/, ["DORY FILLET"]],
  [/\b(SIAKAP|SEABASS|SEA BASS)\b/, ["SEABASS"]],
  [/\b(CILI KISAR|CHILI BOH|CILI BOH|LADA BOH)\b/, ["CILI BOH"]],
  [/\bCHILL?I FLAKES?\b/, ["CHILI FLAKES"]],
  [/\b(CHILL?I POWDER|CILI POWDER|SERBUK CILI)\b/, ["SERBUK CILI BABAS"]],
  [/^(LADA|CILI|CILIPADI|CILI PADI) ?(PADI )?HIJAU\b/, ["CILI PADI HIJAU", "CILI HIJAU"]],
  [/^(LADA|CILI) (PADI )?MERAH\b/, ["CILI PADI MERAH", "CILI MERAH"]],
  [/^CILI BESAR\b/, ["CILI MERAH"]],
  [/^LADA KERING\b/, ["CILI KERING"]],
  [/^DAUN LIMAU\b/, ["DAUN LIMAU"]],
  [/\b(DAUN KETUMBAR|CORIANDER LEAF)\b/, ["KETUMBAR THAILAND"]],
  [/^(SAYUR )?SAWI\b/, ["SAWI"]],
  [/\bKACANG DAL\b/, ["KACANG DHALL"]],
  [/^SANTAN PEKAT\b/, ["SANTAN KARA"]],
  [/^SUSU PEKAT\b/, ["SUSU PEKAT SAJI"]],
  [/\bWHIPPING CREAM\b/, ["ANC ANCHOR WHIPPING"]],
  [/^(TAHU|TAUHU|TOFU)\b/, ["TAUHU KERAS"]],
  [/^(LADA HITAM|BLACK PEPPER)\b/, ["BLACK PEPPER"]],
  [/\bLADA SULAH\b/, ["LADA SULAH"]],
  [/\bAJINOMOTO\b/, ["AJINOMOTO"]],
  [/^(AIR )?JERUK NIPIS\b|^LIMAU NIPIS\b/, ["LIMAU NIPIS"]],
  [/^MINYAK (MASAK|GORENG)\b/, ["MINYAK MASAK"]],
  [/^KICAP PEKAT\b/, ["KICAP PEKAT JALEN"]],
  [/^KICAP MANIS\b/, ["KICAP MANIS JALEN"]],
  [/^SOS TIRAM\b|^OYSTER SAUCE\b/, ["SOS TIRAM BUMI HIJAU"]],
  [/^TEPUNG JAGUNG\b|^CORN ?FLOUR\b/, ["TEPUNG JAGUNG"]],
  [/^KELAPA PARUT\b/, ["KELAPA PARUT"]],
  [/^SERBUK KUNYIT\b|^TURMERIC POWDER\b/, ["SERBUK KUNYIT"]],
  [/^DAUN PANDAN\b/, ["DAUN PANDAN"]],
  [/^DAUN KARI\b|^CURRY LEAF\b/, ["DAUN KARI"]],
];

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9/ ]+/g, " ").replace(/\s+/g, " ").trim();

/** Other ways to write the same ingredient (empty when there is none). */
export function aliasesOf(ingredient: string): string[] {
  const name = norm(ingredient);
  const out: string[] = [];
  for (const [re, names] of RULES) if (re.test(name)) out.push(...names);
  return Array.from(new Set(out));
}
