import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { formatMalaysiaDateTime, formatPrice, malaysiaDateOf, todayInMalaysia } from "@/lib/format";
import { getPriorityAccess } from "@/lib/priority/access";
import { loadEventsNeedingDecision, loadOtherPendingApprovals, loadPayables, loadPeople, loadTasks, type PriorityTask } from "@/lib/priority/queries";
import {
  APPROVAL_LABEL,
  OPS_ALERT_LABEL,
  PAYMENT_STATUS_LABEL,
  PRIORITY_LABEL,
  PRIORITY_TONE,
  daysBetween,
  filterPayables,
  summarisePayables,
  type PayableView,
} from "@/lib/priority/payables";
import { formatDue, TASK_PRIORITIES, TASK_PRIORITY_LABEL, TASK_STATUSES, TASK_STATUS_LABEL, dueBucket, isOpenStatus, nowMs, sortTasks, summariseTasks, type TaskPriority, type TaskStatus } from "@/lib/priority/tasks";
import { loadReminderSettings } from "@/lib/priority/reminders";
import { syncWithData } from "@/lib/priority/sync";
import { TaskBoard, type TaskCard } from "@/components/priority/TaskBoard";
import { PayablesTable } from "@/components/priority/PayablesTable";
import { ApprovalList, BriefingTaskCheck, NotificationList, ReminderSettingsForm, type ApprovalItem } from "@/components/priority/ReminderPanels";
import { Pill, FIELD, LABEL, BTN, BTN_GHOST } from "@/components/priority/ui";
import { SoftPage, shortName } from "@/components/ui/Soft";
import { dailyCheer } from "@/lib/priority/cheer";
import { MultiPersonFilter } from "@/components/priority/MultiPersonFilter";
import { CheerCard, DashGreeting, MonthCalendar, ProgressList, StatTile, TopTasks, UpcomingReminders, WeekChart, type ReminderRow, type TopTask } from "@/components/priority/PriorityDashboard";
import { MONTH_LABEL } from "@/lib/finance/constants";
import type { EventOption } from "@/components/priority/PayableManager";
import { Select } from "@/components/ui/Select";

type Params = Record<string, string | undefined>;

const TASK_KEYS = ["tResp", "tPriority", "tStatus", "tDue"];
const PAY_KEYS = ["supplier", "pPriority", "pStatus", "pApproval", "dueFrom", "dueTo"];

function Hidden({ params, keys }: { params: Params; keys: string[] }) {
  return (
    <>
      {keys.map((k) => (params[k] ? <input key={k} type="hidden" name={k} value={params[k]} /> : null))}
    </>
  );
}

function SectionBox({ id, title, subtitle, children }: { id: string; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-4 rounded-3xl border border-border bg-surface shadow-sm">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-[18px] font-extrabold text-text">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[13.5px] text-text-secondary">{subtitle}</p>}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

function viewHref(p: PayableView) {
  return p.type === "supplier_invoice" ? `/supplier-procurement/invoices/${p.id}` : `/finance/payments/${p.id}`;
}

export default async function PriorityCentrePage({ searchParams }: { searchParams: Promise<Params> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  const params = await searchParams;

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name").order("name");
  const companies = allCompanies ?? [];
  const { accessibleIds, targetCompanyIds } = resolveCompanyScope(session, companies, params.company);
  const accessibleCompanies = companies.filter((c) => accessibleIds.includes(c.id));
  if (accessibleIds.length === 0) {
    return <div className="py-10 text-center text-[14px] text-text-secondary">You don&apos;t have access to any company yet.</div>;
  }

  const now = nowMs();
  const today = todayInMalaysia(now);
  // the birthday (for the star sign line of the day) comes from the person's own staff record, when there is one
  const { data: ownRecord } = await supabase.from("employees").select("date_of_birth").eq("user_id", session.userId).not("date_of_birth", "is", null).limit(1).maybeSingle();
  const birthDate = ownRecord?.date_of_birth ?? null;
  const access = await getPriorityAccess(supabase, session, accessibleIds);
  const inScope = new Set(targetCompanyIds);

  // everything the person may see, for every company, so reminders are worked out on the whole picture; the page then narrows to the chosen company
  const [allPayables, allTasks, people, otherApprovalsAll, eventsAll, settings, notes] = await Promise.all([
    access.canSeePayments ? loadPayables(supabase, access.adminCompanyIds, today) : Promise.resolve([]),
    loadTasks(supabase, accessibleIds),
    loadPeople(supabase),
    access.canSeePayments ? loadOtherPendingApprovals(supabase, access.adminCompanyIds) : Promise.resolve([]),
    access.canSeePayments ? loadEventsNeedingDecision(supabase, access.adminCompanyIds, today) : Promise.resolve([]),
    loadReminderSettings(supabase, session.userId),
    supabase.from("priority_notifications").select("id, severity, title, body, href, created_at").eq("user_id", session.userId).is("read_at", null).order("created_at", { ascending: false }).limit(50),
  ]);

  // create the reminders that are due now (never twice for the same item and period), then read them
  let notifications = notes.data ?? [];
  try {
    await syncWithData(supabase, { access, payables: allPayables, tasks: allTasks }, now);
    const { data } = await supabase.from("priority_notifications").select("id, severity, title, body, href, created_at").eq("user_id", session.userId).is("read_at", null).order("created_at", { ascending: false }).limit(50);
    notifications = data ?? [];
  } catch (err) {
    console.warn("Priority Centre reminders could not be created:", err instanceof Error ? err.message : err);
  }

  const payables = allPayables.filter((p) => inScope.has(p.companyId));
  const tasks = allTasks.filter((t) => inScope.has(t.company_id));
  const names = new Map(people.map((p) => [p.id, p.name]));
  const isAdminOf = (companyId: string) => access.adminCompanyIds.includes(companyId);

  // ───────── figures (all from the records above) ─────────
  // the briefing and the figures are about the person's OWN tasks (given to them, or created by them and not given to anybody);
  // the checklist below still lists every task of the companies they manage
  const myTasks = tasks.filter((t) => t.responsible_id === session.userId || (!t.responsible_id && t.created_by === session.userId));
  const taskSummary = summariseTasks(myTasks, now, today);
  const paySummary = summarisePayables(payables);

  const toCard = (t: PriorityTask): TaskCard => {
    const admin = isAdminOf(t.company_id);
    const mine = t.responsible_id === session.userId || t.created_by === session.userId;
    return {
      id: t.id,
      companyId: t.company_id,
      companyName: t.companies?.name ?? "—",
      title: t.title,
      description: t.description,
      responsibleId: t.responsible_id,
      responsibleName: t.responsible_id ? (names.get(t.responsible_id) ?? "—") : null,
      department: t.department,
      priority: t.priority as TaskPriority,
      status: t.status as TaskStatus,
      startDate: t.start_date,
      dueAt: t.due_at,
      reminderAt: t.reminder_at,
      documentId: t.document_id,
      documentName: t.document?.original_filename ?? null,
      createdByName: t.created_by ? (names.get(t.created_by) ?? "—") : null,
      createdAt: t.created_at,
      completedByName: t.completed_by ? (names.get(t.completed_by) ?? "—") : null,
      completedAt: t.completed_at,
      bucket: dueBucket(t, now, today),
      // everybody looks after their own tasks (given to them or created by them); the admins after every task of their companies
      perm: { edit: admin || mine, status: admin || mine, remove: (admin || mine) && t.status !== "completed" },
    };
  };

  // ───────── task filters ─────────
  // the responsible person can be one or several people: "me", "none" (not assigned) or user ids, separated by commas
  const chosenPeople = (params.tResp ?? "").split(",").map((v) => v.trim()).filter(Boolean);
  const tStatus = params.tStatus ?? "open";
  const weekEnd = new Date(Date.parse(`${today}T00:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10);
  const taskCards = sortTasks(
    tasks.filter((t) => {
      if (chosenPeople.length > 0 && !chosenPeople.some((v) => (v === "me" ? t.responsible_id === session.userId : v === "none" ? !t.responsible_id : t.responsible_id === v))) return false;
      if (params.tPriority && t.priority !== params.tPriority) return false;
      if (tStatus === "open" ? !isOpenStatus(t.status) : tStatus !== "all" && t.status !== tStatus) return false;
      if (params.tDue) {
        const b = dueBucket(t, now, today);
        if (params.tDue === "overdue" && b !== "overdue") return false;
        if (params.tDue === "today" && b !== "today") return false;
        if (params.tDue === "tomorrow" && b !== "tomorrow") return false;
        if (params.tDue === "week") {
          const day = t.due_at ? new Date(Date.parse(t.due_at) + 8 * 3_600_000).toISOString().slice(0, 10) : null;
          if (!isOpenStatus(t.status) || !day || day > weekEnd) return false;
        }
        if (params.tDue === "none" && !!t.due_at) return false;
      }
      return true;
    }),
  ).map(toCard);

  // ───────── payment filters ─────────
  const payRows = filterPayables(payables, {
    supplier: params.supplier,
    priority: params.pPriority,
    status: params.pStatus,
    approval: params.pApproval,
    dueFrom: params.dueFrom,
    dueTo: params.dueTo,
    includePaid: params.pStatus === "paid",
  });

  const approvalItems: ApprovalItem[] = payables.flatMap((p) =>
    p.openRequests
      .filter((l) => l.status === "pending")
      .map((l) => ({
        paymentId: l.id,
        supplierName: p.supplierName,
        companyName: p.companyName,
        amount: l.amount,
        reference: p.reference,
        requestedAt: l.createdAt,
        waitingDays: Math.max(0, daysBetween(malaysiaDateOf(l.createdAt), today)),
        note: l.notes,
        outstanding: p.outstanding,
        verified: p.verification === "verified",
        dueDate: p.dueDate,
      })),
  );

  const opsAlerts = payables.filter((p) => p.outstanding > 0 && p.control?.opsAlertType);
  const urgentPayments = payables.filter((p) => p.outstanding > 0 && (p.priority === "urgent" || p.priority === "high") && p.statusKey !== "on_hold").slice(0, 5);
  const overdueTasks = myTasks.filter((t) => dueBucket(t, now, today) === "overdue").slice(0, 5).map(toCard);
  const events = eventsAll.filter((e) => inScope.has(e.company_id));
  const otherApprovals = otherApprovalsAll.filter((a) => !a.company_id || inScope.has(a.company_id));
  const eventOptions: EventOption[] = events.map((e) => ({ id: e.id, name: e.event_name, date: e.event_date }));
  const companyOptions = accessibleCompanies.map((c) => ({ id: c.id, name: c.name }));
  const peopleOptions = people;

  const carry: Params = { ...params };
  const q = (extra: Record<string, string>) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...(params.company ? { company: params.company } : {}), ...extra })) sp.set(k, v);
    return `?${sp.toString()}`;
  };
  const clearTasks = q(Object.fromEntries(PAY_KEYS.filter((k) => params[k]).map((k) => [k, params[k] as string])));
  const clearPays = q(Object.fromEntries(TASK_KEYS.filter((k) => params[k]).map((k) => [k, params[k] as string])));
  const tasksFiltered = TASK_KEYS.some((k) => params[k]);
  const paysFiltered = PAY_KEYS.some((k) => params[k]);

  // ───────── the dashboard at the top (all from the records above) ─────────
  const hour = new Date(now + 8 * 3_600_000).getUTCHours();
  const [todayY, todayM, todayD] = today.split("-").map(Number);
  const dayAgo = (n: number) => new Date(Date.parse(`${today}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
  const weekDays = [6, 5, 4, 3, 2, 1, 0].map((n) => {
    const date = dayAgo(n);
    const label = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(`${date}T00:00:00Z`).getUTCDay()];
    return { label, value: myTasks.filter((t) => t.status === "completed" && t.completed_at && malaysiaDateOf(t.completed_at) === date).length };
  });
  const monthPrefix = today.slice(0, 7);
  const marks: Record<number, { tasks: number; payments: number }> = {};
  const mark = (date: string | null | undefined, kind: "tasks" | "payments") => {
    if (!date || !date.startsWith(monthPrefix)) return;
    const day = Number(date.slice(8, 10));
    marks[day] = { tasks: marks[day]?.tasks ?? 0, payments: marks[day]?.payments ?? 0, [kind]: (marks[day]?.[kind] ?? 0) + 1 };
  };
  for (const t of myTasks) if (isOpenStatus(t.status) && t.due_at) mark(malaysiaDateOf(t.due_at), "tasks");
  for (const p of payables) if (p.outstanding > 0) mark(p.dueDate, "payments");

  const deptMap = new Map<string, { done: number; total: number }>();
  for (const t of tasks) {
    if (t.status === "cancelled") continue;
    const name = t.department?.trim() || "General";
    const cur = deptMap.get(name) ?? { done: 0, total: 0 };
    cur.total += 1;
    if (t.status === "completed") cur.done += 1;
    deptMap.set(name, cur);
  }
  const deptRows = Array.from(deptMap, ([name, v]) => ({ name, ...v })).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name)).slice(0, 4);

  const topTasks: TopTask[] = sortTasks(myTasks.filter((t) => isOpenStatus(t.status)))
    .slice(0, 5)
    .map((t) => {
      const c = toCard(t);
      return { id: c.id, title: c.title, priority: c.priority, priorityLabel: TASK_PRIORITY_LABEL[c.priority], dueLabel: c.dueAt ? formatDue(c.dueAt) : "No due date", canComplete: c.perm.status };
    });

  const reminderRows: (ReminderRow & { at: number })[] = [
    ...myTasks
      .filter((t) => isOpenStatus(t.status) && t.due_at && Date.parse(t.due_at) >= now)
      .map((t) => ({ key: `t${t.id}`, icon: "🔔", title: t.title, when: formatDue(t.due_at), at: Date.parse(t.due_at as string) })),
    ...payables
      .filter((p) => p.outstanding > 0 && p.dueDate && p.dueDate >= today)
      .map((p) => ({ key: `p${p.type}${p.id}`, icon: "💳", title: p.supplierName, when: `Due ${p.dueDate!.split("-").reverse().join("/")}`, amount: formatPrice(p.outstanding), at: Date.parse(`${p.dueDate}T00:00:00+08:00`) })),
  ]
    .sort((a, b) => a.at - b.at)
    .slice(0, 5);

  return (
    <SoftPage>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <DashGreeting name={shortName(session.fullName)} hour={hour} />
        <nav aria-label="Sections" className="flex flex-wrap gap-2 text-[13.5px] font-semibold">
          <a href="#tasks" className={BTN_GHOST}>{access.canSeePayments ? "To-Do Checklist" : "My Tasks"}</a>
          {access.canSeePayments && <a href="#payments" className={BTN_GHOST}>Urgent Supplier Payments</a>}
          <a href="#approvals" className={BTN_GHOST}>{access.canSeePayments ? "Reminders & Pending Approvals" : "My Reminders"}</a>
        </nav>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatTile tint="lavender" icon="📋" label="My tasks due today" value={taskSummary.dueToday} />
        <StatTile tint="pink" icon="⏰" label="My overdue tasks" value={taskSummary.overdue} />
        {access.canSeePayments && (
          <>
            <StatTile tint="peach" icon="🚩" label="Urgent supplier payments" value={paySummary.urgentCount} />
            <StatTile
              tint="yellow"
              icon="💰"
              label="Confirmed outstanding supplier balance"
              value={<span className="text-[22px]">{formatPrice(paySummary.confirmedOutstanding)}</span>}
              sub={
                <>
                  {paySummary.pendingVerificationCount > 0 && <span className="block">+ {formatPrice(paySummary.pendingVerification)} Pending Verification ({paySummary.pendingVerificationCount})</span>}
                  {paySummary.onHoldCount > 0 && <span className="block">{formatPrice(paySummary.onHold)} disputed / on hold ({paySummary.onHoldCount})</span>}
                  {paySummary.pendingVerificationCount === 0 && paySummary.onHoldCount === 0 && <span>{paySummary.confirmedCount} verified payable(s)</span>}
                </>
              }
            />
            <StatTile tint="sky" icon="✍️" label="Payments awaiting Madam Penny" value={paySummary.awaitingApprovalCount} sub={paySummary.awaitingApprovalCount > 0 ? formatPrice(paySummary.awaitingApprovalAmount) : undefined} />
          </>
        )}
        <StatTile tint="green" icon="⭐" label="My tasks completed this week" value={taskSummary.completedThisWeek} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.7fr_1fr]">
        <WeekChart title="Tasks finished this week" days={weekDays} />
        <MonthCalendar title={`${MONTH_LABEL[todayM - 1]} ${todayY}`} year={todayY} month={todayM} todayDay={todayD} marks={marks} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-[1fr_1.1fr_1fr]">
        <ProgressList title="Progress by department" rows={deptRows} empty="No task yet." />
        <TopTasks title="Top tasks" tasks={topTasks} empty="No open task right now." />
        <div className="flex flex-col gap-4">
          <UpcomingReminders title="Upcoming reminders" rows={reminderRows} empty="Nothing is due soon." />
          <CheerCard cheer={dailyCheer(today, birthDate)} />
        </div>
      </div>

      {/* ───────── daily briefing ───────── */}
      <section aria-labelledby="briefing" className="overflow-hidden rounded-3xl border border-border bg-surface shadow-sm">
        <div className="bg-navy-900 px-5 py-4 text-white">
          <h2 id="briefing" className="text-[18px] font-extrabold">{access.canSeePayments ? "Madam Penny's Daily Briefing" : "My Day"}</h2>
          <p className="mt-0.5 text-[13.5px] text-white/75">Today&apos;s priorities, taken from the records in the system.</p>
        </div>
        <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-2">
          {access.canSeePayments && (
            <div>
              <h3 className="mb-2 text-[14px] font-bold text-text">Most urgent supplier payments</h3>
              {urgentPayments.length === 0 ? (
                <p className="text-[14px] text-text-secondary">No urgent or high-priority supplier payment right now.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {urgentPayments.map((p) => (
                    <li key={`${p.type}:${p.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2.5">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          {p.priority && <Pill tone={PRIORITY_TONE[p.priority]}>{PRIORITY_LABEL[p.priority]}</Pill>}
                          <span className="text-[14px] font-semibold text-text">{p.supplierName}</span>
                        </div>
                        <div className="text-[12.5px] text-text-secondary">{p.companyName} · {p.priorityReason} · {PAYMENT_STATUS_LABEL[p.statusKey]}</div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[15px] font-extrabold tabular-nums text-text">{formatPrice(p.outstanding)}</span>
                        <a href="#payments" className="text-[13px] font-semibold text-primary hover:underline">Review Payment</a>
                        <Link href={viewHref(p)} className="text-[13px] font-semibold text-primary hover:underline">View Invoice</Link>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div>
            <h3 className="mb-2 text-[14px] font-bold text-text">My overdue tasks requiring action</h3>
            {overdueTasks.length === 0 ? (
              <p className="text-[14px] text-text-secondary">No overdue task.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {overdueTasks.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-danger-bg/40 px-3 py-2.5">
                    <div className="min-w-0">
                      <div className="text-[14px] font-semibold text-text">{t.title}</div>
                      <div className="text-[12.5px] text-text-secondary">{t.responsibleName ?? "Not assigned"} · was due {formatDue(t.dueAt)}</div>
                    </div>
                    {t.perm.status && <BriefingTaskCheck id={t.id} title={t.title} />}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {access.canSeePayments && (
            <div className="lg:col-span-2">
              <h3 className="mb-2 text-[14px] font-bold text-text">Payment requests waiting for approval ({approvalItems.length})</h3>
              <ApprovalList items={approvalItems.slice(0, 3)} canDecide={access.isApprover} />
              {approvalItems.length > 3 && <a href="#approvals" className="mt-2 inline-block text-[13px] font-semibold text-primary hover:underline">See all {approvalItems.length}</a>}
            </div>
          )}

          {access.canSeePayments && (opsAlerts.length > 0 || events.length > 0) && (
            <div className="lg:col-span-2 grid gap-5 lg:grid-cols-2">
              <div>
                <h3 className="mb-2 text-[14px] font-bold text-text">Important operational issues</h3>
                {opsAlerts.length === 0 ? (
                  <p className="text-[14px] text-text-secondary">No operational issue recorded.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {opsAlerts.map((p) => (
                      <li key={`${p.type}:${p.id}`} className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2.5 text-[13.5px]">
                        <div className="font-bold text-danger">⚠ {OPS_ALERT_LABEL[p.control!.opsAlertType!]}</div>
                        <div className="text-text">{p.supplierName} · {formatPrice(p.outstanding)} outstanding</div>
                        {p.control?.opsAlertNote && <div className="text-text-secondary">{p.control.opsAlertNote}</div>}
                        <div className="text-[12px] text-text-muted">Recorded {formatMalaysiaDateTime(p.control?.opsAlertAt)}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <h3 className="mb-2 text-[14px] font-bold text-text">Upcoming events needing a decision</h3>
                {events.length === 0 ? (
                  <p className="text-[14px] text-text-secondary">No event in the next 7 days is waiting for confirmation.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {events.map((e) => (
                      <li key={e.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2.5 text-[13.5px]">
                        <div>
                          <Link href={`/catering/${e.id}`} className="font-semibold text-text hover:underline">{e.event_name}</Link>
                          <div className="text-[12.5px] text-text-secondary">{e.event_date.split("-").reverse().join("/")} · {daysBetween(today, e.event_date) === 0 ? "today" : `in ${daysBetween(today, e.event_date)} day(s)`} · still {e.status === "enquiry" ? "an enquiry" : "only quoted"}</div>
                        </div>
                        <Pill tone="warning">Decision needed</Pill>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2 border-t border-border bg-surface-alt px-5 py-3">
          <Link href={`${q({ new: "1" })}#tasks`} className={BTN}>{access.adminCompanyIds.length > 0 ? "Assign Task" : "Add my task"}</Link>
          <Link href={`${q({ new: "1" })}#tasks`} className={BTN_GHOST}>Add Reminder</Link>
          {access.canSeePayments && <a href="#payments" className={BTN_GHOST}>Review Payment</a>}
          {access.isApprover && <a href="#approvals" className={BTN_GHOST}>Approve / Reject ({approvalItems.length})</a>}
        </div>
      </section>

      {/* ───────── to-do checklist ───────── */}
      <SectionBox id="tasks" title={access.canSeePayments ? "To-Do Checklist" : "My To-Do List"} subtitle={access.adminCompanyIds.length > 0 ? "Every task of the companies you manage, and the tasks assigned to you." : "The tasks assigned to you or created by you."}>
        <form method="get" className="mb-4 grid grid-cols-2 items-end gap-3 md:grid-cols-3 xl:grid-cols-7 print:hidden">
          <Hidden params={carry} keys={PAY_KEYS} />
          <div>
            <label className={LABEL} htmlFor="f-company">Company</label>
            <Select id="f-company" name="company" defaultValue={params.company ?? ""} className={FIELD}>
              <option value="">All companies</option>
              {accessibleCompanies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className={LABEL} htmlFor="f-resp">Responsible person</label>
            <MultiPersonFilter
              id="f-resp"
              name="tResp"
              initial={chosenPeople}
              options={[{ value: "me", label: "Me" }, { value: "none", label: "Not assigned" }, ...people.map((p) => ({ value: p.id, label: p.name }))]}
            />
          </div>
          <div>
            <label className={LABEL} htmlFor="f-prio">Priority</label>
            <Select id="f-prio" name="tPriority" defaultValue={params.tPriority ?? ""} className={FIELD}>
              <option value="">All priorities</option>
              {TASK_PRIORITIES.map((p) => (
                <option key={p} value={p}>{TASK_PRIORITY_LABEL[p]}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className={LABEL} htmlFor="f-status">Status</label>
            <Select id="f-status" name="tStatus" defaultValue={tStatus} className={FIELD}>
              <option value="open">Not finished</option>
              <option value="all">All, including finished</option>
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>{TASK_STATUS_LABEL[s]}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className={LABEL} htmlFor="f-due">Due date</label>
            <Select id="f-due" name="tDue" defaultValue={params.tDue ?? ""} className={FIELD}>
              <option value="">Any time</option>
              <option value="overdue">Overdue</option>
              <option value="today">Due today</option>
              <option value="tomorrow">Due tomorrow</option>
              <option value="week">Due within 7 days</option>
              <option value="none">No due date</option>
            </Select>
          </div>
          <button type="submit" className={BTN}>Apply</button>
          {tasksFiltered && <Link href={clearTasks} className="flex h-10 items-center text-[14px] font-semibold text-text-secondary hover:text-text">Clear</Link>}
        </form>
        <TaskBoard tasks={taskCards} companies={companyOptions} people={peopleOptions} canAssignTo={access.adminCompanyIds} currentUserId={session.userId} startOpen={params.new === "1"} />
      </SectionBox>

      {/* ───────── urgent supplier payments ───────── */}
      {access.canSeePayments ? (
        <SectionBox id="payments" title="Urgent Supplier Payments – For Madam Penny" subtitle="Sorted by priority, then the earliest due date. A balance counts as confirmed only after Finance has verified it; approval alone never marks anything as paid.">
          {opsAlerts.length > 0 && (
            <div role="alert" className="mb-4 rounded-xl border border-danger/30 bg-danger-bg p-4">
              <div className="text-[14px] font-extrabold text-danger">Operational alert: a supplier payment may affect operations</div>
              <ul className="mt-2 flex flex-col gap-1 text-[13.5px] text-text">
                {opsAlerts.map((p) => (
                  <li key={`${p.type}:${p.id}`}>
                    <strong>{p.supplierName}</strong> ({formatPrice(p.outstanding)}): {OPS_ALERT_LABEL[p.control!.opsAlertType!]}.
                    {p.control?.opsAlertNote ? ` ${p.control.opsAlertNote}` : ""}
                    <span className="text-text-muted"> Recorded {formatMalaysiaDateTime(p.control?.opsAlertAt)}.</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {approvalItems.length > 0 && (
            <div className="mb-4 rounded-xl border border-warning/30 bg-warning-bg px-4 py-3 text-[13.5px] font-semibold text-warning">
              {approvalItems.length} payment request(s) waiting for Madam Penny&apos;s confirmation — <a href="#approvals" className="underline">see below</a>.
            </div>
          )}
          <form method="get" className="mb-4 grid grid-cols-2 items-end gap-3 md:grid-cols-4 xl:grid-cols-8 print:hidden">
            <Hidden params={carry} keys={TASK_KEYS} />
            <div>
              <label className={LABEL} htmlFor="p-company">Company</label>
              <Select id="p-company" name="company" defaultValue={params.company ?? ""} className={FIELD}>
                <option value="">All companies</option>
                {accessibleCompanies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className={LABEL} htmlFor="p-supplier">Supplier</label>
              <input id="p-supplier" name="supplier" defaultValue={params.supplier ?? ""} className={FIELD} placeholder="Name" />
            </div>
            <div>
              <label className={LABEL} htmlFor="p-prio">Priority</label>
              <Select id="p-prio" name="pPriority" defaultValue={params.pPriority ?? ""} className={FIELD}>
                <option value="">All</option>
                {(["urgent", "high", "medium", "low"] as const).map((l) => (
                  <option key={l} value={l}>{PRIORITY_LABEL[l]}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className={LABEL} htmlFor="p-status">Payment status</label>
              <Select id="p-status" name="pStatus" defaultValue={params.pStatus ?? ""} className={FIELD}>
                <option value="">Still to pay</option>
                {Object.entries(PAYMENT_STATUS_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className={LABEL} htmlFor="p-appr">Approval</label>
              <Select id="p-appr" name="pApproval" defaultValue={params.pApproval ?? ""} className={FIELD}>
                <option value="">All</option>
                {Object.entries(APPROVAL_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className={LABEL} htmlFor="p-from">Due from</label>
              <input id="p-from" type="date" name="dueFrom" defaultValue={params.dueFrom ?? ""} className={FIELD} />
            </div>
            <div>
              <label className={LABEL} htmlFor="p-to">Due to</label>
              <input id="p-to" type="date" name="dueTo" defaultValue={params.dueTo ?? ""} className={FIELD} />
            </div>
            <div className="flex gap-2">
              <button type="submit" className={BTN}>Apply</button>
              {paysFiltered && <Link href={clearPays} className="flex h-10 items-center text-[14px] font-semibold text-text-secondary hover:text-text">Clear</Link>}
            </div>
          </form>
          <PayablesTable rows={payRows} isApprover={access.isApprover} events={eventOptions} />
          <p className="mt-3 text-[12.5px] text-text-muted">
            {payRows.length} shown · sources: Finance supplier payments and supplier invoices. Nothing here sends money: payments are always made by a person and then recorded.
          </p>
        </SectionBox>
      ) : (
        <p className="rounded-xl border border-border bg-surface px-4 py-3 text-[13.5px] text-text-secondary">Supplier payments are shown to Finance and Admin users only.</p>
      )}

      {/* ───────── reminders and approvals ───────── */}
      <SectionBox id="approvals" title={access.canSeePayments ? "Reminders & Pending Approvals" : "My Reminders"}>
        <div className="grid gap-6 xl:grid-cols-2">
          <div className="flex flex-col gap-6">
            {access.canSeePayments && (
              <div>
                <h3 className="mb-2 text-[15px] font-bold text-text">Payment requests waiting for approval ({approvalItems.length})</h3>
                <ApprovalList items={approvalItems} canDecide={access.isApprover} />
              </div>
            )}
            {access.canSeePayments && (
              <div>
                <h3 className="mb-2 text-[15px] font-bold text-text">Other approvals waiting ({otherApprovals.length})</h3>
                {otherApprovals.length === 0 ? (
                  <p className="text-[14px] text-text-secondary">Nothing else is waiting for approval.</p>
                ) : (
                  <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border text-[13.5px]">
                    {otherApprovals.map((a) => (
                      <li key={a.id} className="flex items-center justify-between gap-2 px-3.5 py-2.5">
                        <span className="font-semibold text-text">{a.module} · {a.related_table.replace(/_/g, " ")}</span>
                        <span className="text-text-muted">since {formatMalaysiaDateTime(a.created_at)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-6">
            <div>
              <h3 className="mb-2 text-[15px] font-bold text-text">Reminders ({notifications.length})</h3>
              <NotificationList items={notifications.map((n) => ({ id: n.id, severity: n.severity as "danger" | "warning" | "info", title: n.title, body: n.body, href: n.href, createdAt: n.created_at }))} />
            </div>
            <div>
              <h3 className="mb-2 text-[15px] font-bold text-text">Reminder timing</h3>
              <ReminderSettingsForm daysBefore={settings.settings.daysBefore} remindAfterDeadline={settings.settings.remindAfterDeadline} />
            </div>
          </div>
        </div>
      </SectionBox>
    </SoftPage>
  );
}
