import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { todayInMalaysia } from "@/lib/format";

type DB = SupabaseClient<Database>;

export type BulletinPost = Database["public"]["Tables"]["bulletin_posts"]["Row"] & { company_name: string | null; expired: boolean; isNew: boolean };

const NEW_FOR_MS = 3 * 24 * 3600 * 1000;

/**
 * The announcements the person may read: for every company, or for the companies they can open. Pinned first, then the newest.
 * An announcement past its "show until" date is only listed for those who may post (to renew or delete it).
 */
export async function listBulletinPosts(supabase: DB, companyIds: string[], opts: { includeExpired: boolean; limit?: number }): Promise<BulletinPost[]> {
  const today = todayInMalaysia();
  const now = Date.now();
  const ids = companyIds.length ? `company_id.is.null,company_id.in.(${companyIds.join(",")})` : "company_id.is.null";
  let query = supabase
    .from("bulletin_posts")
    .select("*, companies(name)")
    .or(ids)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false });
  if (!opts.includeExpired) query = query.or(`expires_on.is.null,expires_on.gte.${today}`);
  if (opts.limit) query = query.limit(opts.limit);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(({ companies, ...p }) => ({ ...p, company_name: companies?.name ?? null, expired: !!p.expires_on && p.expires_on < today, isNew: now - Date.parse(p.created_at) < NEW_FOR_MS }));
}
