"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SALES_AGENTS } from "@/lib/catering/constants";
import { INTAKE_COMPANIES, INTAKE_HOURLY_LIMIT, type CustomerIntakeInput } from "@/lib/catering/intake";

const clean = (s: string | undefined, max = 500) => {
  const v = s?.trim();
  if (!v) return null;
  if (v.length > max) throw new Error("One of the fields is too long.");
  return v;
};

/**
 * Public (no login): a sales agent sends a customer's details. The company comes from the link, the entry is only
 * stored as "pending" and never becomes a customer until someone with Catering access approves it.
 */
export async function submitCustomerIntake(companySlug: string, input: CustomerIntakeInput): Promise<{ ok: boolean; error?: string }> {
  // the message is returned (not thrown) so the person always sees it, also on the live site where thrown messages are hidden
  try {
    return await saveCustomerIntake(companySlug, input);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not save. Please try again." };
  }
}

async function saveCustomerIntake(companySlug: string, input: CustomerIntakeInput) {
  const company = INTAKE_COMPANIES[companySlug];
  if (!company) throw new Error("This link is not valid.");
  // a bot fills the hidden field; pretend it worked so it learns nothing
  if (input.website?.trim()) return { ok: true };

  if (!SALES_AGENTS.includes(input.salesAgent)) throw new Error("Select your name from the sales agent list.");
  const name = clean(input.name, 200);
  if (!name) throw new Error("Enter the customer / company name.");
  const phone = clean(input.phone, 50);
  const email = clean(input.email, 200);
  if (!phone && !email) throw new Error("Enter a contact phone number or an email.");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("The email address does not look right.");

  const admin = createAdminClient();
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("customer_intake_submissions")
    .select("id", { count: "exact", head: true })
    .eq("company_id", company.id)
    .gte("created_at", since);
  if ((count ?? 0) >= INTAKE_HOURLY_LIMIT) throw new Error("Too many submissions right now. Please try again in a while.");

  const { error } = await admin.from("customer_intake_submissions").insert({
    company_id: company.id,
    sales_agent: input.salesAgent,
    name,
    contact_person: clean(input.contactPerson, 200),
    phone,
    email,
    registration_no: clean(input.registrationNo, 100),
    billing_address: clean(input.billingAddress, 1000),
    delivery_address: clean(input.deliveryAddress, 1000),
    area: clean(input.area, 200),
    notes: clean(input.notes, 2000),
  });
  if (error) throw new Error("Could not save. Please try again.");
  return { ok: true };
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  return { supabase, userId: user.id };
}

/** Turns a pending submission into a real customer (duplicate names are refused) and marks it approved. */
export async function approveCustomerIntake(submissionId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await approveIntake(submissionId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not approve. Please try again." };
  }
}

async function approveIntake(submissionId: string) {
  const { supabase, userId } = await requireUser();
  const { data: s, error: readError } = await supabase.from("customer_intake_submissions").select("*").eq("id", submissionId).single();
  if (readError) throw readError;
  if (s.status !== "pending") throw new Error("This submission has already been reviewed.");

  const submitted = `Submitted by sales agent ${s.sales_agent} through the customer form on ${s.created_at.slice(0, 10)}.`;
  const { data: customer, error } = await supabase
    .from("customers")
    .insert({
      company_id: s.company_id,
      name: s.name,
      contact_person: s.contact_person,
      phone: s.phone,
      email: s.email,
      registration_no: s.registration_no,
      billing_address: s.billing_address,
      delivery_address: s.delivery_address,
      area: s.area,
      notes: s.notes ? `${s.notes}\n${submitted}` : submitted,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") throw new Error(`A customer named "${s.name}" already exists for this company. Reject this one or change the name first.`);
    throw error;
  }

  const { error: updateError } = await supabase
    .from("customer_intake_submissions")
    .update({ status: "approved", customer_id: customer.id, reviewed_by: userId, reviewed_at: new Date().toISOString() })
    .eq("id", submissionId);
  if (updateError) throw updateError;
  revalidatePath("/catering/customers");
  revalidatePath("/catering/customers/submissions");
  return customer;
}

export async function rejectCustomerIntake(submissionId: string) {
  const { supabase, userId } = await requireUser();
  const { error } = await supabase
    .from("customer_intake_submissions")
    .update({ status: "rejected", reviewed_by: userId, reviewed_at: new Date().toISOString() })
    .eq("id", submissionId)
    .eq("status", "pending");
  if (error) throw error;
  revalidatePath("/catering/customers/submissions");
}
