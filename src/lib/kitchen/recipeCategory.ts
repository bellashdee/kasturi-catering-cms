/**
 * Recipe categories by the kind of food ("berasaskan ..."), in the order the kitchen asked for them.
 * The category is worked out from the recipe name, so it needs no extra data; a recipe that fits none of them goes under "Lain-lain".
 */
export const RECIPE_CATEGORIES = [
  { key: "ayam", label: "Ayam" },
  { key: "daging", label: "Daging" },
  { key: "ikan", label: "Ikan" },
  { key: "seafood", label: "Seafood" },
  { key: "telur", label: "Telur" },
  { key: "sayur", label: "Sayur-sayuran" },
  { key: "mee", label: "Mee & Bihun" },
  { key: "sup", label: "Sup" },
  { key: "dessert", label: "Dessert" },
  { key: "kuih", label: "Kuih" },
  { key: "nasi", label: "Nasi" },
  { key: "kambing", label: "Kambing" },
  { key: "tortilla", label: "Tortilla" },
  { key: "roti", label: "Roti" },
  { key: "sauce", label: "Sos Pencecah" },
  { key: "bubur", label: "Bubur" },
  { key: "air", label: "Minuman" },
  { key: "pencuci", label: "Pencuci Mulut" },
  { key: "sambal", label: "Sambal" },
  { key: "lain", label: "Lain-lain" },
] as const;

export type RecipeCategoryKey = (typeof RECIPE_CATEGORIES)[number]["key"];

export const RECIPE_CATEGORY_LABEL: Record<string, string> = Object.fromEntries(RECIPE_CATEGORIES.map((c) => [c.key, c.label]));

const has = (name: string, words: string[]) => words.some((w) => new RegExp(`(^|[^A-Z])${w}([^A-Z]|$)`).test(name));

const PROTEIN = ["AYAM", "CHICKEN", "DAGING", "BEEF", "IKAN", "FISH", "UDANG", "PRAWN", "PRAWNS", "SOTONG", "SQUID", "KETAM", "CRAB", "KAMBING", "LAMB", "MUTTON", "TELUR", "EGG", "EGGS"];

/**
 * The first rule that fits wins, so the more specific kinds of food come first: a drink, a sambal, a dipping sauce, a porridge, bread,
 * noodles and soup are named by what they are; a dish with a meat, fish or egg in its name is named by that meat, fish or egg.
 */
export function recipeCategory(rawName: string): RecipeCategoryKey {
  const name = rawName.trim().toUpperCase();

  if (/^AIR\b/.test(name) || has(name, ["KOPI", "TEH", "COFFEE", "TEA", "SIRAP", "SUNQUICK", "SUNQUIK", "KORDIAL", "CORDIAL", "JUICE", "JUS", "LEMONADE", "SARSI", "MASALA CHAI", "LEMON MINT", "ANGGUR", "ASAM ASIN", "OREN", "KELADI", "SELASIH", "MILO", "NESCAFE", "BLUE LAGOON", "MOCKTAIL", "SOYA", "KOKO"])) return "air";
  if (/^SAMBAL\b/.test(name) || /^BELACAN\b/.test(name)) return "sambal";
  if (has(name, ["DRESSING", "THOUSAND ISLAND", "TARTAR", "CHIMICHURRI", "KETCHUP", "KUAH KACANG", "MAYONNAISE", "MAYO", "DIP"]) || (/(\bSAUCE|\bSOS)$/.test(name) && !has(name, [...PROTEIN, "WITH", "TAUHU", "TOFU", "POTATO", "POTATOES"]))) return "sauce";
  if (/^BUBUR\b/.test(name)) return "bubur";
  if (has(name, ["TORTILLA", "WRAP", "WRAPS", "QUESADILLA", "BURRITO", "TACO", "TACOS", "FAJITA", "ENCHILADA"])) return "tortilla";
  if (has(name, ["ROTI", "BREAD", "SANDWICH", "BURGER", "BUN", "TOAST", "CHAPATI", "NAAN", "PRATA", "CANAI", "MURTABAK", "CROISSANT", "BAGUETTE"])) return "roti";
  if (has(name, ["MEE", "BEE HOON", "BIHUN", "MEE HOON", "KWAY TEOW", "KUETIAW", "KUEY TEOW", "LAKSA", "SPAGHETTI", "PASTA", "PENNE", "MACARONI", "MAGGI", "NOODLE", "NOODLES", "LONTONG", "KUEH TIAW", "BEE HUN"])) return "mee";
  if (/^SUP\b/.test(name) || /^SOTO\b/.test(name) || /^TOMYAM\b/.test(name) || has(name, ["SOUP", "RASSAM", "RASAM", "KALDU", "CHOWDER"])) return "sup";
  if (has(name, ["KUIH", "KARIPAP", "SAMOSA", "SPRING ROLL", "SPRING ROLLS", "POPIA", "CUCUR", "TALAM", "BINGKA", "LAPIS", "SERI MUKA", "DONUT", "GETUK", "SAGU", "KOLE", "APAM", "ONDE", "CURRY PUFF", "PULUT", "GENDANG", "KASWI", "NONA MANIS", "CARA MANIS"])) return "kuih";
  if (has(name, ["DESSERT", "CAKE", "CAKES", "KEK", "TART", "PUFF", "PUFFS", "BROWNIE", "BROWNIES", "CUPCAKE", "PUDDING", "PUDING", "CRÈME", "CREME", "CHOUX", "JALEBI", "KESARI", "PAYASAM", "MURUKKU", "TIRAMISU", "MOUSSE", "CHEESECAKE", "PANNA COTTA", "PASTRY", "PASTRIES"])) return "dessert";
  if (has(name, ["FRUIT", "FRUITS", "BUAH", "PENGAT", "CENDOL", "AGAR", "JELLY", "AIS"])) return "pencuci";
  if (/^NASI\b/.test(name) || has(name, ["RICE", "BASMATHI", "BERAS"])) return "nasi";
  if (/^TELUR\b/.test(name)) return "telur";
  if (/^AYAM\b/.test(name) || has(name, ["CHICKEN"])) return "ayam";
  if (has(name, ["TELUR", "EGG", "EGGS"])) return "telur";
  if (/^DAGING\b/.test(name) || /^PARU\b/.test(name) || has(name, ["BEEF", "MEATBALL", "BRISKET", "STEAK", "SIRLOIN", "RIBEYE"])) return "daging";
  if (has(name, ["KAMBING", "LAMB", "MUTTON"])) return "kambing";
  if (/^IKAN\b/.test(name) || has(name, ["IKAN", "FISH", "SEABASS", "SALMON", "DORY", "TUNA", "SARDINE", "SIAKAP", "KERAPU", "PATIN"])) return "ikan";
  if (has(name, ["UDANG", "SOTONG", "KETAM", "SIPUT", "KERANG", "PRAWN", "PRAWNS", "SQUID", "CRAB", "LOBSTER", "SEAFOOD", "SCALLOP", "CALAMARI"])) return "seafood";
  if (has(name, ["KOBIS", "SAYUR", "SAWI", "ACAR", "PACERI", "NENAS", "VEGETABLE", "VEGETABLES", "DALCHA", "SERUNDING", "PENCUK", "LEMAK LABU", "SALAD", "KERABU", "ULAM", "POTATO", "POTATOES", "KENTANG", "CORN", "JAGUNG", "BROKOLI", "BROCCOLI", "CARROT", "TERUNG", "BENDI", "LABU", "KACANG", "MUSHROOM", "CENDAWAN", "BROCOLLI", "PUMPKIN", "ZUCHINI", "ZUCCHINI", "VEGE", "KELEDEK", "ONION", "LETTUCE", "LOLLO", "COLESLAW", "CUCUMBER", "TOMATO", "TOMATOES", "LEMON WEDGES", "CABBAGE", "RAITA", "DHAL", "PAKORA", "ALOO", "GOBHI", "BAYAM", "PETOLA", "TAUHU", "TAUFU", "TOFU", "UBI", "SPINACH", "BEANS", "PORIYAL", "KARELA", "CHAP CHAI"])) return "sayur";
  return "lain";
}

/**
 * Desserts, kuih, bakery and fruit are bought ready from outside: they are not offered when choosing recipes to cook for a purchase request.
 */
const BOUGHT_READY = /\b(BUAH|BUAH-BUAHAN|FRUITS?|TART|TARTS|CAKES?|KEK|BAKERY|PASTRY|PASTRIES|MUFFINS?|BROWNIES?|COOKIES?|DONUTS?|DOUGHNUTS?|CROISSANTS?|PUDDING|PUDING|JELLY|AGAR)\b/;
export const isBoughtReadyRecipe = (name: string): boolean =>
  ["dessert", "kuih", "pencuci", "roti"].includes(recipeCategory(name)) || BOUGHT_READY.test(name.trim().toUpperCase());
