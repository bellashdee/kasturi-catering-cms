/** Restaurant system (O2 Life, Restoran Bara Ikan Bakar Senibong): the fixed choices shared by the screens, the actions and the reports. */

export const CHANNELS = [
  { key: "dine_in", label: "Dine-in" },
  { key: "takeaway", label: "Takeaway" },
  { key: "delivery", label: "Delivery" },
  { key: "online", label: "Online" },
] as const;
export type ChannelKey = (typeof CHANNELS)[number]["key"];

export const PAYMENT_METHODS = [
  { key: "cash", label: "Cash" },
  { key: "qr_duitnow", label: "QR / DuitNow" },
  { key: "card", label: "Card" },
  { key: "online_platform", label: "Online platform" },
  { key: "other", label: "Other" },
] as const;
export type PaymentMethodKey = (typeof PAYMENT_METHODS)[number]["key"];

export const channelLabel = (key: string) => CHANNELS.find((c) => c.key === key)?.label ?? key;
export const paymentLabel = (key: string) => PAYMENT_METHODS.find((p) => p.key === key)?.label ?? key;

/** The restaurant roles a person can hold on top of their login (Owner and Admin are the Super Admin and Company Admin of the login itself). */
export const RESTAURANT_ROLES = [
  { key: "manager", label: "Manager", note: "Cancels confirmed sales, reopens a closed cash session, approves later phases" },
  { key: "cashier", label: "Cashier", note: "Enters and confirms daily sales, opens and closes the cash" },
  { key: "chef", label: "Chef", note: "Kitchen work (used from the recipe and stock phases)" },
  { key: "kitchen_staff", label: "Kitchen Staff", note: "Kitchen work (used from the recipe and stock phases)" },
  { key: "purchasing", label: "Purchasing", note: "Quotes and purchase orders (used from the purchasing phase)" },
  { key: "storekeeper", label: "Storekeeper", note: "Goods received and stock counts (used from the stock phase)" },
  { key: "finance", label: "Finance", note: "Enters and confirms daily sales, reads the audit trail" },
] as const;
export type RestaurantRoleKey = (typeof RESTAURANT_ROLES)[number]["key"];

/** Who may enter / confirm sales and work with the cash (the database enforces the same lists). */
export const SALES_ROLES: string[] = ["cashier", "manager", "finance"];
export const MANAGER_ROLES: string[] = ["manager"];

export const MODULE_KEY = "restaurant";
