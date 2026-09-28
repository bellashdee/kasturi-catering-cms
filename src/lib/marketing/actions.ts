"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  return { supabase, userId: user.id };
}

export type CampaignInput = {
  companyId: string;
  name: string;
  objective?: string;
  channel: string;
  status: string;
  startDate?: string;
  endDate?: string;
  budget?: number;
};

export async function createCampaign(input: CampaignInput) {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("campaigns")
    .insert({
      company_id: input.companyId,
      name: input.name,
      objective: input.objective || null,
      channel: input.channel,
      status: input.status,
      start_date: input.startDate || null,
      end_date: input.endDate || null,
      budget: input.budget ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  revalidatePath("/marketing");
  return data;
}

export async function updateCampaign(campaignId: string, input: Partial<CampaignInput>) {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("campaigns")
    .update({
      name: input.name,
      objective: input.objective || null,
      channel: input.channel,
      status: input.status,
      start_date: input.startDate || null,
      end_date: input.endDate || null,
      budget: input.budget ?? null,
    })
    .eq("id", campaignId);
  if (error) throw error;
  revalidatePath("/marketing");
  revalidatePath(`/marketing/${campaignId}`);
}

export type ContentItemInput = {
  companyId: string;
  campaignId?: string;
  platform: string;
  contentType: string;
  title: string;
  scheduledDate?: string;
  status: string;
  notes?: string;
};

export async function createContentItem(input: ContentItemInput) {
  const { supabase, userId } = await requireUser();
  const { error } = await supabase.from("content_items").insert({
    company_id: input.companyId,
    campaign_id: input.campaignId || null,
    platform: input.platform,
    content_type: input.contentType,
    title: input.title,
    scheduled_date: input.scheduledDate || null,
    status: input.status,
    notes: input.notes || null,
    created_by: userId,
  });
  if (error) throw error;
  revalidatePath("/marketing/content");
  if (input.campaignId) revalidatePath(`/marketing/${input.campaignId}`);
}

export type LeadInput = {
  companyId: string;
  campaignId?: string;
  name: string;
  phone?: string;
  email?: string;
  source: string;
  notes?: string;
};

export async function createLead(input: LeadInput) {
  const { supabase, userId } = await requireUser();
  const { error } = await supabase.from("leads").insert({
    company_id: input.companyId,
    campaign_id: input.campaignId || null,
    name: input.name,
    phone: input.phone || null,
    email: input.email || null,
    source: input.source,
    notes: input.notes || null,
    created_by: userId,
  });
  if (error) throw error;
  revalidatePath("/marketing/leads");
}

export type BulkLeadRow = {
  name: string;
  phone?: string;
  email?: string;
  source?: string;
  notes?: string;
};

export async function bulkImportLeads(companyId: string, rows: BulkLeadRow[]) {
  const { supabase, userId } = await requireUser();

  const payload = rows
    .filter((r) => r.name?.trim())
    .map((r) => ({
      company_id: companyId,
      name: r.name.trim(),
      phone: r.phone || null,
      email: r.email || null,
      source: r.source || "other",
      notes: r.notes || null,
      created_by: userId,
    }));

  if (payload.length === 0) return { inserted: 0 };

  const { error, count } = await supabase.from("leads").insert(payload, { count: "exact" });
  if (error) throw error;

  revalidatePath("/marketing/leads");
  return { inserted: count ?? payload.length };
}

export async function updateLeadStatus(leadId: string, status: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("leads").update({ status }).eq("id", leadId);
  if (error) throw error;
  revalidatePath("/marketing/leads");
}

export async function convertLeadToCustomer(leadId: string) {
  const { supabase } = await requireUser();

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id, company_id, name, phone, email")
    .eq("id", leadId)
    .single();
  if (leadError) throw leadError;

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .insert({
      company_id: lead.company_id,
      name: lead.name,
      phone: lead.phone,
      email: lead.email,
    })
    .select("id")
    .single();
  if (customerError) throw customerError;

  const { error: updateError } = await supabase
    .from("leads")
    .update({ status: "converted", converted_customer_id: customer.id })
    .eq("id", leadId);
  if (updateError) throw updateError;

  revalidatePath("/marketing/leads");
  revalidatePath("/marketing/customers");
  return customer;
}

export type CustomerInput = {
  companyId: string;
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
};

export async function createCustomer(input: CustomerInput) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("customers").insert({
    company_id: input.companyId,
    name: input.name,
    contact_person: input.contactPerson || null,
    phone: input.phone || null,
    email: input.email || null,
  });
  if (error) throw error;
  revalidatePath("/marketing/customers");
}

export type PromotionInput = {
  companyId: string;
  campaignId?: string;
  title: string;
  code?: string;
  discountType: string;
  discountValue: number;
  startDate: string;
  endDate: string;
  status: string;
};

export async function createPromotion(input: PromotionInput) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("promotions").insert({
    company_id: input.companyId,
    campaign_id: input.campaignId || null,
    title: input.title,
    code: input.code || null,
    discount_type: input.discountType,
    discount_value: input.discountValue,
    start_date: input.startDate,
    end_date: input.endDate,
    status: input.status,
  });
  if (error) throw error;
  revalidatePath("/marketing/promotions");
}

export type MarketingExpenseInput = {
  companyId: string;
  campaignId?: string;
  category: string;
  description: string;
  amount: number;
  expenseDate: string;
  documentId?: string;
};

export async function createMarketingExpense(input: MarketingExpenseInput) {
  const { supabase, userId } = await requireUser();

  const { data, error } = await supabase
    .from("marketing_expenses")
    .insert({
      company_id: input.companyId,
      campaign_id: input.campaignId || null,
      category: input.category,
      description: input.description,
      amount: input.amount,
      expense_date: input.expenseDate,
      document_id: input.documentId || null,
      created_by: userId,
    })
    .select("id")
    .single();
  if (error) throw error;

  if (input.documentId) {
    await supabase
      .from("documents")
      .update({
        extraction_status: "confirmed",
        related_table: "marketing_expenses",
        related_id: data.id,
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", input.documentId);
  }

  revalidatePath("/marketing/expenses");
  revalidatePath("/");
  if (input.campaignId) revalidatePath(`/marketing/${input.campaignId}`);
  return data;
}

export type CampaignPerformanceInput = {
  companyId: string;
  campaignId: string;
  reportDate: string;
  impressions?: number;
  clicks?: number;
  leadsGenerated?: number;
  conversions?: number;
  spend?: number;
  documentId?: string;
};

export async function createCampaignPerformance(input: CampaignPerformanceInput) {
  const { supabase, userId } = await requireUser();

  const { data, error } = await supabase
    .from("campaign_performance")
    .insert({
      company_id: input.companyId,
      campaign_id: input.campaignId,
      report_date: input.reportDate,
      impressions: input.impressions ?? null,
      clicks: input.clicks ?? null,
      leads_generated: input.leadsGenerated ?? null,
      conversions: input.conversions ?? null,
      spend: input.spend ?? null,
      document_id: input.documentId || null,
      created_by: userId,
    })
    .select("id")
    .single();
  if (error) throw error;

  if (input.documentId) {
    await supabase
      .from("documents")
      .update({
        extraction_status: "confirmed",
        related_table: "campaign_performance",
        related_id: data.id,
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", input.documentId);
  }

  revalidatePath(`/marketing/${input.campaignId}`);
  return data;
}
