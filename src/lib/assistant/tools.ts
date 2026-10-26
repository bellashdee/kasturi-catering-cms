import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { SessionContext } from "@/lib/auth";
import { canAccessModule } from "@/lib/modules";
import { getHrAccess } from "@/lib/hr/access";
import { signOf } from "@/lib/priority/cheer";
import { isOverdue } from "@/lib/procurement/constants";
import { getMonthlyCostBreakdown, getMonthlySales } from "@/lib/finance/queries";
import { addDaysToDateIso, todayInMalaysia } from "@/lib/format";
import { readWebPage, searchWeb } from "@/lib/assistant/web";

type DB = SupabaseClient<Database>;

export type ToolContext = {
  supabase: DB;
  session: SessionContext;
  targetCompanyIds: string[];
  companyLabel: string;
  /** the web pages the answer was built on, filled in by the web tools */
  sources: { title: string; url: string }[];
};

type Declaration = { name: string; description: string; parameters?: { type: "OBJECT"; properties: Record<string, { type: string; description: string }>; required?: string[] } };

const str = (description: string) => ({ type: "STRING", description });
const int = (description: string) => ({ type: "INTEGER", description });
const bool = (description: string) => ({ type: "BOOLEAN", description });

/**
 * What the assistant can look up. Every lookup is read-only and goes through the signed-in person's own access (the same company and module
 * rules as the pages), so the assistant can never show more than the person could open themselves. Payroll and salaries are never available.
 */
function declarationsFor(ctx: ToolContext): Declaration[] {
  const can = (m: Parameters<typeof canAccessModule>[1]) => canAccessModule(ctx.session.allowedModules, m);
  const list: Declaration[] = [
    { name: "get_my_profile", description: "The signed-in person's own details from the system: name, role, position, department, company, nationality, date of birth and star sign. Use it for questions about the person themselves (for example 'what is my star sign', 'when is my birthday')." },
    {
      name: "my_tasks",
      description: "The person's own tasks in their Priority Centre (given to them or created by them): title, company, priority, status, due date.",
      parameters: { type: "OBJECT", properties: { status: str("'open' (not finished, the default) or 'all'") } },
    },
    { name: "latest_announcements", description: "The latest announcements on the Bulletin Board (title, text, date, who posted)." },
    {
      name: "web_search",
      description: "Search the internet for today's facts: news, prices, weather, exchange rates, laws and rules, people, places, products, anything that may have changed or that is not about this business. Returns titles, links and short extracts. Always use it for questions about recent or current events.",
      parameters: { type: "OBJECT", properties: { query: str("The search words, short and specific (in the language that finds the best pages)"), news: bool("true for news and recent events") }, required: ["query"] },
    },
    {
      name: "read_webpage",
      description: "Read the text of one public web page (use a link from web_search) when the extract is not enough to answer.",
      parameters: { type: "OBJECT", properties: { url: str("The full web address (https://...)") }, required: ["url"] },
    },
  ];
  if (can("hr")) {
    list.push(
      {
        name: "find_staff",
        description: "Staff of the company in view: name, position, department, company, employment type, join date, nationality. An admin sees every staff member; anybody else only their own record.",
        parameters: { type: "OBJECT", properties: { search: str("Part of a name or position"), department: str("Department name"), include_inactive: bool("true to include staff who left") } },
      },
      {
        name: "upcoming_birthdays",
        description: "Staff birthdays in the coming days (admins: all staff; others: only their own).",
        parameters: { type: "OBJECT", properties: { days: int("How many days ahead (default 30, at most 366)") } },
      },
    );
  }
  if (can("catering")) {
    list.push({
      name: "list_events",
      description: "Catering events: name, date, time, venue, pax, type, status, company.",
      parameters: { type: "OBJECT", properties: { from: str("First date, YYYY-MM-DD (default today)"), to: str("Last date, YYYY-MM-DD (default 60 days ahead)"), search: str("Part of the event name or venue") } },
    });
  }
  if (can("finance-admin") || can("supplier-procurement")) {
    list.push({
      name: "supplier_invoices",
      description: "Supplier invoices: number, supplier, amount, invoice date, due date, status, overdue or not. Also gives the total outstanding.",
      parameters: { type: "OBJECT", properties: { status: str("'unpaid' (default), 'overdue', 'paid' or 'all'"), supplier: str("Part of the supplier name") } },
    });
  }
  if (can("finance-admin")) {
    list.push({
      name: "monthly_costing",
      description: "The company's costs for one month by category (kitchen purchases, supplier, transport, rental, utilities, petty cash and more) with the sales figure and the cost percentage.",
      parameters: { type: "OBJECT", properties: { year: int("Year, for example 2026"), month: int("Month 1-12") }, required: ["year", "month"] },
    });
  }
  return list;
}

export function toolDeclarations(ctx: ToolContext): Declaration[] {
  return declarationsFor(ctx);
}

const cap = <T,>(rows: T[], n: number) => ({ count: rows.length, shown: Math.min(rows.length, n), rows: rows.slice(0, n) });
const asText = (v: unknown, n = 200) => (typeof v === "string" ? v.slice(0, n) : "");

/** Runs one lookup and returns plain data for the AI to read; a problem is returned as { error } so the AI can tell the person. */
export async function runTool(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<unknown> {
  const allowed = new Set(declarationsFor(ctx).map((d) => d.name));
  if (!allowed.has(name)) return { error: "This lookup is not available for this person." };
  const { supabase, session, targetCompanyIds, companyLabel } = ctx;
  try {
    switch (name) {
      case "get_my_profile": {
        const { data } = await supabase.from("employees").select("full_name, short_name, position, department, nationality, date_of_birth, join_date, employment_type, companies(name)").eq("user_id", session.userId);
        const records = (data ?? []).map((e) => {
          const m = e.date_of_birth?.match(/^\d{4}-(\d{2})-(\d{2})/);
          const sign = m ? signOf(Number(m[1]), Number(m[2])) : null;
          return { name: e.full_name, shortName: e.short_name, company: e.companies?.name ?? null, position: e.position, department: e.department, nationality: e.nationality, dateOfBirth: e.date_of_birth, starSign: sign ? `${sign.name} ${sign.symbol}` : null, joinDate: e.join_date, employmentType: e.employment_type };
        });
        return { loginName: session.fullName, email: session.email, role: session.role, today: todayInMalaysia(), staffRecords: records.length > 0 ? records : "No staff record is linked to this login, so the date of birth and position are not in the system." };
      }
      case "my_tasks": {
        const all = asText(args.status, 10) === "all";
        let query = supabase.from("priority_tasks").select("title, priority, status, due_at, companies(name)").or(`responsible_id.eq.${session.userId},created_by.eq.${session.userId}`).order("due_at", { ascending: true, nullsFirst: false }).limit(60);
        if (!all) query = query.not("status", "in", "(completed,cancelled)");
        const { data, error } = await query;
        if (error) throw error;
        return cap((data ?? []).map((t) => ({ title: t.title, company: t.companies?.name, priority: t.priority, status: t.status, due: t.due_at })), 30);
      }
      case "latest_announcements": {
        const ids = targetCompanyIds.length ? `company_id.is.null,company_id.in.(${targetCompanyIds.join(",")})` : "company_id.is.null";
        const { data, error } = await supabase.from("bulletin_posts").select("title, body, category, created_by_name, created_at, expires_on").or(ids).order("created_at", { ascending: false }).limit(6);
        if (error) throw error;
        const today = todayInMalaysia();
        return (data ?? []).filter((p) => !p.expires_on || p.expires_on >= today).map((p) => ({ title: p.title, text: p.body.slice(0, 600), category: p.category, postedBy: p.created_by_name, postedOn: p.created_at.slice(0, 10) }));
      }
      case "web_search": {
        const query = asText(args.query, 300);
        if (!query) return { error: "Give the search words." };
        const results = await searchWeb(query, { news: args.news === true });
        for (const r of results.slice(0, 5)) if (!ctx.sources.some((s) => s.url === r.url)) ctx.sources.push({ title: r.title, url: r.url });
        return results.length > 0 ? { query, results: results.map((r) => ({ title: r.title, url: r.url, extract: r.snippet.slice(0, 400), date: r.date })) } : { query, results: [], note: "The web search gave nothing now. Say so, and answer from what you know (mention it may be out of date)." };
      }
      case "read_webpage": {
        const page = await readWebPage(asText(args.url, 500));
        if (!ctx.sources.some((s) => s.url === page.url)) ctx.sources.push({ title: page.title || page.url, url: page.url });
        return page;
      }
      case "find_staff": {
        const access = await getHrAccess(supabase, session, targetCompanyIds);
        const { data, error } = await supabase.from("employees").select("id, company_id, full_name, position, department, employment_type, join_date, nationality, status, companies(name)").in("company_id", targetCompanyIds).order("full_name").limit(500);
        if (error) throw error;
        const search = asText(args.search, 80).toLowerCase();
        const dept = asText(args.department, 80).toLowerCase();
        const rows = (data ?? [])
          .filter((e) => access.canSee(e) && (args.include_inactive === true || e.status === "active"))
          .filter((e) => !search || `${e.full_name} ${e.position ?? ""}`.toLowerCase().includes(search))
          .filter((e) => !dept || (e.department ?? "").toLowerCase().includes(dept))
          .map((e) => ({ name: e.full_name, position: e.position, department: e.department, company: e.companies?.name, employmentType: e.employment_type, joinDate: e.join_date, nationality: e.nationality, status: e.status }));
        return { company: companyLabel, ...cap(rows, 40), seeingAllStaff: access.adminAnywhere };
      }
      case "upcoming_birthdays": {
        const access = await getHrAccess(supabase, session, targetCompanyIds);
        const days = Math.min(366, Math.max(1, Number(args.days) || 30));
        const today = todayInMalaysia();
        const end = addDaysToDateIso(today, days);
        const { data, error } = await supabase.from("employees").select("id, company_id, full_name, date_of_birth, status").in("company_id", targetCompanyIds).eq("status", "active").not("date_of_birth", "is", null).limit(500);
        if (error) throw error;
        const next = (dob: string) => {
          const md = dob.slice(5);
          let d = `${today.slice(0, 4)}-${md}`;
          if (d < today) d = `${Number(today.slice(0, 4)) + 1}-${md}`;
          return d;
        };
        const seen = new Set<string>();
        const rows = (data ?? [])
          .filter((e) => access.canSee(e) && e.date_of_birth)
          .map((e) => ({ name: e.full_name, date: next(e.date_of_birth as string) }))
          .filter((r) => r.date <= end && !seen.has(r.name) && seen.add(r.name))
          .sort((a, b) => a.date.localeCompare(b.date));
        return { from: today, to: end, ...cap(rows, 40) };
      }
      case "list_events": {
        const from = /^\d{4}-\d{2}-\d{2}$/.test(asText(args.from, 10)) ? asText(args.from, 10) : todayInMalaysia();
        const to = /^\d{4}-\d{2}-\d{2}$/.test(asText(args.to, 10)) ? asText(args.to, 10) : addDaysToDateIso(from, 60);
        const { data, error } = await supabase
          .from("catering_events")
          .select("event_name, event_date, event_time, location, pax_count, event_type, status, companies(name)")
          .in("company_id", targetCompanyIds)
          .gte("event_date", from)
          .lte("event_date", to)
          .order("event_date", { ascending: true })
          .limit(100);
        if (error) throw error;
        const search = asText(args.search, 80).toLowerCase();
        const rows = (data ?? [])
          .filter((e) => !search || `${e.event_name} ${e.location ?? ""}`.toLowerCase().includes(search))
          .map((e) => ({ name: e.event_name, date: e.event_date, time: e.event_time, venue: e.location, pax: e.pax_count, type: e.event_type, status: e.status, company: e.companies?.name }));
        return { from, to, company: companyLabel, ...cap(rows, 40) };
      }
      case "supplier_invoices": {
        const status = asText(args.status, 10) || "unpaid";
        const { data, error } = await supabase.from("supplier_invoices").select("invoice_number, invoice_date, due_date, amount, status, suppliers(name), companies(name)").in("company_id", targetCompanyIds).order("due_date", { ascending: true }).limit(500);
        if (error) throw error;
        const supplier = asText(args.supplier, 80).toLowerCase();
        const all = (data ?? []).filter((i) => !supplier || (i.suppliers?.name ?? "").toLowerCase().includes(supplier));
        const unpaid = all.filter((i) => i.status !== "paid");
        const wanted = status === "all" ? all : status === "paid" ? all.filter((i) => i.status === "paid") : status === "overdue" ? unpaid.filter((i) => isOverdue(i.due_date, i.status)) : unpaid;
        const rows = wanted.map((i) => ({ invoice: i.invoice_number, supplier: i.suppliers?.name, company: i.companies?.name, amount: Number(i.amount), invoiceDate: i.invoice_date, dueDate: i.due_date, status: i.status, overdue: isOverdue(i.due_date, i.status) }));
        return { company: companyLabel, filter: status, totalOfThese: Math.round(wanted.reduce((t, i) => t + Number(i.amount), 0) * 100) / 100, totalUnpaidInView: Math.round(unpaid.reduce((t, i) => t + Number(i.amount), 0) * 100) / 100, ...cap(rows, 30) };
      }
      case "monthly_costing": {
        const year = Number(args.year);
        const month = Number(args.month);
        if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) return { error: "Give a valid year and month." };
        const [rows, sales] = await Promise.all([getMonthlyCostBreakdown(supabase, targetCompanyIds, year, month), getMonthlySales(supabase, targetCompanyIds, year, month)]);
        const byCategory = new Map<string, number>();
        const bySource = new Map<string, number>();
        let total = 0;
        for (const r of rows) {
          byCategory.set(r.category, (byCategory.get(r.category) ?? 0) + r.amount);
          bySource.set(r.source, (bySource.get(r.source) ?? 0) + r.amount);
          total += r.amount;
        }
        const top = (m: Map<string, number>) => Array.from(m.entries()).map(([k, v]) => ({ name: k, amount: Math.round(v * 100) / 100 })).sort((a, b) => b.amount - a.amount).slice(0, 25);
        return {
          company: companyLabel,
          month: `${year}-${String(month).padStart(2, "0")}`,
          totalCost: Math.round(total * 100) / 100,
          sales: Math.round(sales.amount * 100) / 100,
          salesFigureRecorded: sales.recorded,
          costVsSalesPercent: sales.amount > 0 ? Math.round((total / sales.amount) * 1000) / 10 : null,
          byCategory: top(byCategory),
          bySource: top(bySource),
        };
      }
      default:
        return { error: "Unknown lookup." };
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message.slice(0, 200) : "The lookup failed." };
  }
}
