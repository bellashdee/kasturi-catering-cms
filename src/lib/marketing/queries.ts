import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type DB = SupabaseClient<Database>;

export async function listCampaigns(supabase: DB, companyIds: string[], search?: string) {
  let query = supabase
    .from("campaigns")
    .select("id, name, objective, channel, status, start_date, end_date, budget, company_id, companies(name)")
    .in("company_id", companyIds)
    .order("start_date", { ascending: false, nullsFirst: false });

  if (search) query = query.ilike("name", `%${search}%`);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getCampaign(supabase: DB, campaignId: string) {
  const { data, error } = await supabase
    .from("campaigns")
    .select("*, companies(name)")
    .eq("id", campaignId)
    .single();
  if (error) throw error;
  return data;
}

export async function listContentForCampaign(supabase: DB, campaignId: string) {
  const { data, error } = await supabase
    .from("content_items")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("scheduled_date", { ascending: true });
  if (error) throw error;
  return data;
}

export async function listContentForCompanies(supabase: DB, companyIds: string[]) {
  const { data, error } = await supabase
    .from("content_items")
    .select("*, campaigns(name), companies(name)")
    .in("company_id", companyIds)
    .order("scheduled_date", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data;
}

export async function listPerformanceForCampaign(supabase: DB, campaignId: string) {
  const { data, error } = await supabase
    .from("campaign_performance")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("report_date", { ascending: false });
  if (error) throw error;
  return data;
}

export async function listExpensesForCampaign(supabase: DB, campaignId: string) {
  const { data, error } = await supabase
    .from("marketing_expenses")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("expense_date", { ascending: false });
  if (error) throw error;
  return data;
}

export async function listExpensesForCompanies(supabase: DB, companyIds: string[]) {
  const { data, error } = await supabase
    .from("marketing_expenses")
    .select("*, campaigns(name), companies(name)")
    .in("company_id", companyIds)
    .order("expense_date", { ascending: false });
  if (error) throw error;
  return data;
}

export async function listLeadsForCompanies(supabase: DB, companyIds: string[], search?: string) {
  let query = supabase
    .from("leads")
    .select("*, campaigns(name), companies(name)")
    .in("company_id", companyIds)
    .order("created_at", { ascending: false });

  if (search) query = query.ilike("name", `%${search}%`);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function listCustomersForCompanies(supabase: DB, companyIds: string[], search?: string) {
  let query = supabase
    .from("customers")
    .select("*, companies(name)")
    .in("company_id", companyIds)
    .order("name", { ascending: true });

  if (search) query = query.ilike("name", `%${search}%`);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function listPromotionsForCompanies(supabase: DB, companyIds: string[]) {
  const { data, error } = await supabase
    .from("promotions")
    .select("*, campaigns(name), companies(name)")
    .in("company_id", companyIds)
    .order("start_date", { ascending: false });
  if (error) throw error;
  return data;
}
