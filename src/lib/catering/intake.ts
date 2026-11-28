/** Saved as the "sales agent" of a direct company job (JDT FC SDN BHD): there is no agent and no commission. */
export const DIRECT_JOB_AGENT = "Direct (no agent)";

/**
 * The public customer-details form has one link per company, so the company is fixed by the link
 * (the sales agent never picks it and the browser never sends a company id).
 */
export const INTAKE_COMPANIES: Record<string, { id: string; name: string; fixedCustomer?: string; fixedAgent?: string }> = {
  // Signature Solution caters for one customer only, JDT FC SDN BHD: a direct company job with no sales agent, no PIC and no commission
  // (it pays in cash). Mr. Ismaizal only forwards the chats of JDT's management; he does not handle JDT. Its form asks neither agent nor customer.
  "signature-solution": { id: "bf86ef51-fc00-4331-aef6-a0deaee07183", name: "Signature Solution Sdn Bhd", fixedCustomer: "JDT FC SDN. BHD.", fixedAgent: DIRECT_JOB_AGENT },
  "kasturi-indah": { id: "a57fb12e-e446-4ede-9e35-f7eed46058c2", name: "Kasturi Indah Sdn Bhd" },
};

export type CustomerIntakeInput = {
  salesAgent: string;
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  registrationNo?: string;
  billingAddress?: string;
  deliveryAddress?: string;
  area?: string;
  notes?: string;
  /** Honeypot: real people leave it empty. */
  website?: string;
};

/** Who is emailed when a sales agent sends a quotation request (override with QUOTATION_NOTIFY_EMAIL on the server). */
export const QUOTATION_NOTIFY_EMAIL = "nabilahshidee@gmail.com";

/** The live site, used for the links inside notification emails (override with NEXT_PUBLIC_SITE_URL). */
export const SITE_URL = "https://kasturi-catering-cms.vercel.app";

/** At most this many public submissions per company per hour (stops a bot flooding the review list). */
export const INTAKE_HOURLY_LIMIT = 30;
