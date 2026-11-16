/**
 * The look of the three spending forms (New Company Expense, the petty cash New entry and My Claims), so they read and look alike:
 * the same label, box height, spacing and grid.
 */
export const SPEND_LABEL = "text-[12.5px] font-semibold text-text-secondary";
export const SPEND_INPUT =
  "mt-1 h-9 w-full rounded-lg border border-border-strong bg-white px-2.5 text-[13px] outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";
export const SPEND_HINT = "mt-1 text-[11.5px] text-text-muted";
/** two boxes side by side on a wide screen, one under the other on a phone */
export const SPEND_GRID_2 = "grid grid-cols-1 gap-4 sm:grid-cols-2";
export const SPEND_GRID_3 = "grid grid-cols-1 gap-4 sm:grid-cols-3";
export const SPEND_SAVE_BTN = "rounded-lg bg-primary px-5 py-2.5 text-[13.5px] font-bold text-white disabled:opacity-60";
export const SPEND_CANCEL_BTN = "rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-text";

/** the label and placeholder of the optional invoice number, the same on every form */
export const INVOICE_NO_LABEL = "Invoice No. (optional)";
export const INVOICE_NO_PLACEHOLDER = "e.g. INV-10234, as printed on the invoice or receipt";
