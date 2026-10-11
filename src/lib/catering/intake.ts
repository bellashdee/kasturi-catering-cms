/**
 * The public customer-details form has one link per company, so the company is fixed by the link
 * (the sales agent never picks it and the browser never sends a company id).
 */
export const INTAKE_COMPANIES: Record<string, { id: string; name: string }> = {
  "signature-solution": { id: "bf86ef51-fc00-4331-aef6-a0deaee07183", name: "Signature Solution Sdn Bhd" },
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

/** At most this many public submissions per company per hour (stops a bot flooding the review list). */
export const INTAKE_HOURLY_LIMIT = 30;
