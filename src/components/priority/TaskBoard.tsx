"use client";

import { SearchSelect } from "@/components/ui/SearchSelect";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createTask, deleteTask, setTaskStatus, updateTask, type TaskInput } from "@/lib/priority/taskActions";
import { getHistory } from "@/lib/priority/historyActions";
import type { ActionResult } from "@/lib/actionResult";
import { fileTypeFromMime, uploadDocument } from "@/lib/documents/upload";
import { formatDue, TASK_PRIORITIES, TASK_PRIORITY_LABEL, TASK_PRIORITY_TONE, TASK_STATUS_LABEL, type TaskPriority, type TaskStatus } from "@/lib/priority/tasks";
import { DocumentViewLink } from "@/components/shared/DocumentViewLink";
import { AREA, BTN, BTN_GHOST, BTN_SM_GHOST, Dialog, ErrorLine, FIELD, LABEL, Pill } from "@/components/priority/ui";
import { Select } from "@/components/ui/Select";

export type TaskCard = {
  id: string;
  companyId: string;
  companyName: string;
  title: string;
  description: string | null;
  responsibleId: string | null;
  responsibleName: string | null;
  department: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  startDate: string | null;
  dueAt: string | null;
  reminderAt: string | null;
  documentId: string | null;
  documentName: string | null;
  createdByName: string | null;
  createdAt: string;
  completedByName: string | null;
  completedAt: string | null;
  bucket: "overdue" | "today" | "tomorrow" | "later" | "none";
  perm: { edit: boolean; status: boolean; remove: boolean };
};

type Option = { id: string; name: string };

const DEPARTMENTS = ["Admin", "Finance", "HR", "Kitchen", "Catering", "Procurement", "Operations", "Marketing"];

/** ISO instant → "YYYY-MM-DDTHH:mm" in Malaysia time, for a datetime-local input. */
function toMalaysiaLocal(iso: string | null): string {
  return iso ? new Date(Date.parse(iso) + 8 * 3_600_000).toISOString().slice(0, 16) : "";
}


const BUCKET: Record<TaskCard["bucket"], { label: string; tone: "danger" | "warning" | "info" | "neutral" } | null> = {
  overdue: { label: "Overdue", tone: "danger" },
  today: { label: "Due today", tone: "warning" },
  tomorrow: { label: "Due tomorrow", tone: "info" },
  later: null,
  none: null,
};

export function TaskForm({
  companies,
  people,
  canAssignTo,
  currentUserId,
  task,
  onClose,
}: {
  companies: Option[];
  people: Option[];
  /** Company ids where the person is an admin (and so may assign to anybody); elsewhere only to themselves. */
  canAssignTo: string[];
  currentUserId: string;
  task?: TaskCard;
  onClose: () => void;
}) {
  const router = useRouter();
  const [companyId, setCompanyId] = useState(task?.companyId ?? companies[0]?.id ?? "");
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [responsibleId, setResponsibleId] = useState(task?.responsibleId ?? currentUserId);
  const [department, setDepartment] = useState(task?.department ?? "");
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? "medium");
  const [startDate, setStartDate] = useState(task?.startDate ?? "");
  const [dueAt, setDueAt] = useState(toMalaysiaLocal(task?.dueAt ?? null));
  const [reminderAt, setReminderAt] = useState(toMalaysiaLocal(task?.reminderAt ?? null));
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const admin = canAssignTo.includes(companyId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      let documentId = task?.documentId ?? undefined;
      if (file) documentId = (await uploadDocument({ companyId, module: "priority_tasks", fileType: fileTypeFromMime(file), file })).id;
      const input: TaskInput = {
        companyId,
        title,
        description,
        responsibleId: admin ? responsibleId || undefined : currentUserId,
        department,
        priority,
        startDate: startDate || undefined,
        dueAt: dueAt || undefined,
        reminderAt: reminderAt || undefined,
        documentId,
      };
      const result = task ? await updateTask(task.id, input) : await createTask(input);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the task.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title={task ? "Edit task" : "Add task"} onClose={onClose} wide>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={LABEL} htmlFor="task-title">Task title</label>
          <input id="task-title" className={FIELD} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required autoFocus />
        </div>
        <div className="sm:col-span-2">
          <label className={LABEL} htmlFor="task-description">Details</label>
          <textarea id="task-description" className={AREA} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div>
          <label className={LABEL} htmlFor="task-company">Company</label>
          <Select id="task-company" className={FIELD} value={companyId} onChange={(e) => setCompanyId(e.target.value)} disabled={!!task}>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </div>
        <div>
          <label className={LABEL} htmlFor="task-department">Department</label>
          <SearchSelect id="task-department" className={FIELD} options={DEPARTMENTS} value={department} onChange={setDepartment} />
        </div>
        <div>
          <label className={LABEL} htmlFor="task-responsible">Responsible person</label>
          <Select id="task-responsible" className={FIELD} value={admin ? responsibleId : currentUserId} onChange={(e) => setResponsibleId(e.target.value)} disabled={!admin}>
            <option value="">Not assigned</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>{p.id === currentUserId ? `${p.name} (me)` : p.name}</option>
            ))}
          </Select>
          {!admin && <p className="mt-1 text-[12px] text-text-muted">Only an admin can assign a task to someone else.</p>}
        </div>
        <div>
          <label className={LABEL} htmlFor="task-priority">Priority</label>
          <Select id="task-priority" className={FIELD} value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
            {TASK_PRIORITIES.map((p) => (
              <option key={p} value={p}>{TASK_PRIORITY_LABEL[p]}</option>
            ))}
          </Select>
        </div>
        <div>
          <label className={LABEL} htmlFor="task-start">Start date</label>
          <input id="task-start" type="date" className={FIELD} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div>
          <label className={LABEL} htmlFor="task-due">Due date and time (Malaysia)</label>
          <input id="task-due" type="datetime-local" className={FIELD} value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
        </div>
        <div>
          <label className={LABEL} htmlFor="task-reminder">Reminder date and time (Malaysia)</label>
          <input id="task-reminder" type="datetime-local" className={FIELD} value={reminderAt} onChange={(e) => setReminderAt(e.target.value)} />
        </div>
        <div>
          <label className={LABEL} htmlFor="task-file">Attachment or supporting document</label>
          <input id="task-file" type="file" accept="application/pdf,image/*,.xlsx,.xls,.csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-[13px] text-text-secondary file:mr-3 file:rounded-md file:border file:border-border-strong file:bg-surface file:px-3 file:py-1.5 file:text-[13px] file:font-semibold" />
          {task?.documentName && !file && <p className="mt-1 text-[12px] text-text-muted">Current: {task.documentName}</p>}
        </div>
        <div className="sm:col-span-2">
          <ErrorLine message={error} />
        </div>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <button type="button" className={BTN_GHOST} onClick={onClose}>Cancel</button>
          <button type="submit" className={BTN} disabled={busy}>{busy ? "Saving..." : task ? "Save changes" : "Add task"}</button>
        </div>
      </form>
    </Dialog>
  );
}

/** The change history of a record (who did what, and when), loaded when it is opened. */
export function HistoryDialog({ relatedTable, relatedId, title, onClose }: { relatedTable: string; relatedId: string; title: string; onClose: () => void }) {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof getHistory>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    getHistory(relatedTable, relatedId).then(
      (r) => !cancelled && setRows(r),
      (e) => !cancelled && setError(e instanceof Error ? e.message : "Could not load the history."),
    );
    return () => {
      cancelled = true;
    };
  }, [relatedTable, relatedId]);
  return (
    <Dialog title={title} onClose={onClose} wide>
      <ErrorLine message={error} />
      {!rows && !error && <p className="text-[14px] text-text-secondary">Loading...</p>}
      {rows && rows.length === 0 && <p className="text-[14px] text-text-secondary">No changes recorded yet.</p>}
      {rows && rows.length > 0 && (
        <ol className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.id} className="py-2.5 text-[13.5px]">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold text-text">{r.action.replace(/_/g, " ")}</span>
                <span className="text-[12.5px] text-text-muted">{r.performerName} · {formatDue(r.created_at)}</span>
              </div>
              {(r.previous_value || r.new_value) && (
                <div className="text-text-secondary">
                  {r.previous_value ? `${r.previous_value} → ` : ""}
                  {r.new_value}
                </div>
              )}
              {r.reason && <div className="text-text-secondary">Reason: {r.reason}</div>}
            </li>
          ))}
        </ol>
      )}
    </Dialog>
  );
}

function TaskRow({ t, onEdit, onHistory }: { t: TaskCard; onEdit: () => void; onHistory: () => void }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [open, setOpen] = useState(false);
  const done = t.status === "completed";
  const closed = done || t.status === "cancelled";
  const bucket = BUCKET[t.bucket];

  async function run(fn: () => Promise<ActionResult>) {
    setBusy(true);
    setError(null);
    try {
      const result = await fn();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the task.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className={`border-b border-border px-4 py-3.5 last:border-b-0 ${t.bucket === "overdue" ? "bg-danger-bg/40" : ""}`}>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={done}
          disabled={busy || !t.perm.status || t.status === "cancelled"}
          onChange={(e) => void run(() => setTaskStatus(t.id, e.target.checked ? "completed" : "todo"))}
          aria-label={done ? `Reopen: ${t.title}` : `Mark as completed: ${t.title}`}
          className="mt-1 h-5 w-5 shrink-0 accent-[var(--color-success)]"
        />
        <div className="min-w-0 flex-1">
          <button type="button" onClick={() => setOpen((v) => !v)} className="text-left" aria-expanded={open}>
            <span className={`text-[15px] font-semibold ${closed ? "text-text-muted line-through" : "text-text"}`}>{t.title}</span>
          </button>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Pill tone={TASK_PRIORITY_TONE[t.priority]}>{TASK_PRIORITY_LABEL[t.priority]}</Pill>
            <Pill tone={done ? "success" : t.status === "cancelled" ? "neutral" : t.status === "waiting_approval" ? "warning" : "info"}>{TASK_STATUS_LABEL[t.status]}</Pill>
            {bucket && <Pill tone={bucket.tone}>{bucket.label}</Pill>}
            <span className="text-[13px] text-text-secondary">{t.companyName}{t.department ? ` · ${t.department}` : ""}</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[13px] text-text-secondary">
            <span>Responsible: <strong className="font-semibold text-text">{t.responsibleName ?? "Not assigned"}</strong></span>
            <span>Due: <strong className="font-semibold text-text">{formatDue(t.dueAt)}</strong></span>
            {done && t.completedAt && <span>Completed: <strong className="font-semibold text-success">{formatDue(t.completedAt)}</strong>{t.completedByName ? ` by ${t.completedByName}` : ""}</span>}
          </div>
          {open && (
            <div className="mt-3 grid gap-2 rounded-lg border border-border bg-surface-alt p-3 text-[13.5px] text-text-secondary sm:grid-cols-2">
              {t.description && <p className="whitespace-pre-line sm:col-span-2">{t.description}</p>}
              <span>Start date: {t.startDate ?? "—"}</span>
              <span>Reminder: {formatDue(t.reminderAt)}</span>
              <span>Created by: {t.createdByName ?? "—"} · {formatDue(t.createdAt)}</span>
              {t.documentId && (
                <span>
                  Attachment: <DocumentViewLink documentId={t.documentId} label={t.documentName ?? "View"} />
                </span>
              )}
            </div>
          )}
          {error && <div className="mt-2"><ErrorLine message={error} /></div>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <div className="flex flex-wrap justify-end gap-1.5">
            {t.perm.edit && !done && <button type="button" className={BTN_SM_GHOST} onClick={onEdit}>Edit</button>}
            <button type="button" className={BTN_SM_GHOST} onClick={onHistory}>History</button>
            {t.perm.remove && !confirming && <button type="button" className="inline-flex h-8 items-center rounded-md border border-danger/40 px-3 text-[12.5px] font-semibold text-danger hover:bg-danger-bg" onClick={() => setConfirming(true)}>Delete</button>}
          </div>
          {confirming && (
            <div className="flex items-center gap-1.5 rounded-md border border-danger/40 bg-danger-bg px-2 py-1 text-[12.5px] text-danger">
              <span className="font-semibold">Delete this task?</span>
              <button type="button" disabled={busy} className="font-bold underline" onClick={() => void run(() => deleteTask(t.id))}>Yes, delete</button>
              <button type="button" className="font-semibold" onClick={() => setConfirming(false)}>No</button>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

export function TaskBoard({
  tasks,
  companies,
  people,
  canAssignTo,
  currentUserId,
  startOpen,
}: {
  tasks: TaskCard[];
  companies: Option[];
  people: Option[];
  canAssignTo: string[];
  currentUserId: string;
  startOpen?: boolean;
}) {
  const [form, setForm] = useState<{ task?: TaskCard } | null>(startOpen ? {} : null);
  const [history, setHistory] = useState<TaskCard | null>(null);
  return (
    <>
      <div className="flex justify-end pb-3">
        <button type="button" className={BTN} onClick={() => setForm({})}>+ Add task</button>
      </div>
      {tasks.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-strong px-4 py-8 text-center text-[14px] text-text-secondary">No tasks match these filters.</div>
      ) : (
        <ul className="overflow-hidden rounded-lg border border-border">
          {tasks.map((t) => (
            <TaskRow key={t.id} t={t} onEdit={() => setForm({ task: t })} onHistory={() => setHistory(t)} />
          ))}
        </ul>
      )}
      {form && <TaskForm companies={companies} people={people} canAssignTo={canAssignTo} currentUserId={currentUserId} task={form.task} onClose={() => setForm(null)} />}
      {history && <HistoryDialog relatedTable="priority_tasks" relatedId={history.id} title={`History: ${history.title}`} onClose={() => setHistory(null)} />}
    </>
  );
}
