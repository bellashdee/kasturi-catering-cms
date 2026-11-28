import { getAiProvider, type AiProvider } from "@/lib/ai/gemini";

/**
 * Which service reads the pixels / text of an invoice. Keys live only in server environment variables (never in the
 * browser). INVOICE_READER_PROVIDER picks one when several are configured; otherwise Claude is preferred over Gemini.
 *
 * Evaluated (Nov 2026) for this company's invoices (EN / BM / Chinese, thermal cash bills, handwritten bills, WhatsApp photos):
 *
 * | Provider                              | Accuracy on messy photos | Line items          | Languages          | Cost (approx.)                  |
 * |---------------------------------------|--------------------------|---------------------|--------------------|---------------------------------|
 * | Gemini (current, free key)            | good; free tier is often | yes, with page refs | EN / BM / ZH       | free tier, rate limited; paid   |
 * |                                       | busy (503) -> fallbacks  |                     |                    | tier cheap per page             |
 * | Claude (ANTHROPIC_API_KEY)            | very good, follows the   | yes, with page refs | EN / BM / ZH       | per token, ~1-3 sen per page    |
 * |                                       | "never guess" rules best |                     |                    |                                 |
 * | Azure Document Intelligence (invoice) | very good on printed;    | yes, fixed schema   | EN / BM (Latin);   | ~USD 10 per 1,000 pages         |
 * |                                       | weaker on handwriting    |                     | ZH supported       |                                 |
 * | Google Document AI (Invoice Parser)   | very good on printed;    | yes, fixed schema   | EN; BM/ZH limited  | ~USD 10 per 1,000 pages + GCP   |
 * |                                       | needs GCP project setup  |                     | for invoice parser | project / processor setup       |
 *
 * Recommendation: keep the LLM reader (it already gives per-field page, printed text and confidence, reads chat screenshots
 * and mixed languages, and is wired into the never-guess checks), and move from the free Gemini key to a paid key
 * (ANTHROPIC_API_KEY, or a paid Gemini key) so invoices are not delayed by "busy" answers or used for training. Azure
 * Document Intelligence is the best second opinion if a dedicated OCR is wanted later: it would plug in here as one more
 * provider. Neither Azure nor Google is implemented, because no credentials exist to test them against real invoices.
 */
export type InvoiceReaderProvider = AiProvider;

export function getInvoiceReaderProvider(): InvoiceReaderProvider | null {
  const wanted = process.env.INVOICE_READER_PROVIDER;
  if (wanted === "anthropic" && process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (wanted === "gemini" && process.env.GEMINI_API_KEY) return "gemini";
  return getAiProvider();
}
