import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type DB = SupabaseClient<Database>;

export async function listConversations(supabase: DB) {
  const { data, error } = await supabase
    .from("ai_conversations")
    .select("id, title, created_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  return data;
}

export async function listMessages(supabase: DB, conversationId: string) {
  const { data, error } = await supabase
    .from("ai_messages")
    .select("id, role, content, page_context, helpful, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

export async function createConversation(supabase: DB, userId: string, companyId: string | null, title: string) {
  const { data, error } = await supabase
    .from("ai_conversations")
    .insert({ user_id: userId, company_id: companyId, title })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function touchConversation(supabase: DB, conversationId: string) {
  await supabase.from("ai_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
}

export async function saveMessage(
  supabase: DB,
  conversationId: string,
  role: "user" | "assistant",
  content: string,
  pageContext: string | null,
) {
  const { data, error } = await supabase
    .from("ai_messages")
    .insert({ conversation_id: conversationId, role, content, page_context: pageContext })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

/**
 * RLS on ai_messages only ever surfaces rows belonging to the caller's own
 * conversations, so this count is already scoped to the signed-in user
 * without needing to filter by user id explicitly.
 */
export async function countTodayUserMessages(supabase: DB) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const { count, error } = await supabase
    .from("ai_messages")
    .select("id", { count: "exact", head: true })
    .eq("role", "user")
    .gte("created_at", startOfDay.toISOString());
  if (error) throw error;
  return count ?? 0;
}

export async function setMessageFeedback(supabase: DB, messageId: string, helpful: boolean) {
  const { error } = await supabase.from("ai_messages").update({ helpful }).eq("id", messageId);
  if (error) throw error;
}

export async function deleteConversation(supabase: DB, conversationId: string) {
  const { error } = await supabase.from("ai_conversations").delete().eq("id", conversationId);
  if (error) throw error;
}
