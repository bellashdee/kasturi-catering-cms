/** How a customer paid, as chosen on the sales agent's payment proof form. */
export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  bank_transfer: "Bank transfer",
  online_banking: "Online banking (FPX / DuitNow)",
  ewallet: "E-wallet",
  cash: "Cash",
  cheque: "Cheque",
  card: "Card",
  other: "Other",
};

/** The choices on the sales agent's form (the key is what is stored). */
export const PUBLIC_PAYMENT_METHODS: { key: string; label: string }[] = [
  { key: "cash", label: "Cash" },
  { key: "bank_transfer", label: "Transfer" },
  { key: "cheque", label: "Cheque" },
];

/** What the payment is for. */
export const PAYMENT_REMARK_OPTIONS = ["Partial payment", "Deposit", "Full payment"];

/** The proof can be a photo, a screenshot or a PDF, up to this size. */
export const PROOF_MAX_BYTES = 10 * 1024 * 1024;
export const PROOF_ALLOWED_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "heic", "pdf"];
export const PROOF_ACCEPT = ".jpg,.jpeg,.png,.webp,.heic,.pdf,image/*,application/pdf";

/** The folder (inside the private documents bucket) where proofs of a company are kept. */
export const proofFolder = (companyId: string) => `${companyId}/payment-proofs`;

export type PaymentProofInput = {
  salesAgent: string;
  invoiceNumber: string;
  paymentDate: string;
  paymentMethod: string;
  amount?: number;
  reference?: string;
  remarks?: string;
  /** the receipt / proof is optional */
  proofPath?: string;
  proofFilename?: string;
  proofMime?: string;
  /** Honeypot: real people leave it empty. */
  website?: string;
};

export const proofExtension = (filename: string) => filename.split(".").pop()?.toLowerCase() ?? "";
