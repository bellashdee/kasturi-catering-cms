"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createMember } from "@/lib/users/actions";
import { ModulePicker } from "@/components/settings/ModulePicker";
import { CompanyPicker } from "@/components/settings/CompanyPicker";
import { PasswordInput } from "@/components/shared/PasswordInput";
import { ROLE_LABEL } from "@/lib/users/constants";
import type { Database } from "@/lib/supabase/types";
import { Select } from "@/components/ui/Select";

type Company = { id: string; name: string };
type UserRole = Database["public"]["Enums"]["user_role"];

const inputClass =
  "mt-1.5 h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";
const labelClass = "text-[12.5px] font-semibold text-text-secondary";

function randomPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export function AddMemberForm({ companies, defaultCompanyId }: { companies: Company[]; defaultCompanyId?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState(randomPassword());
  const [role, setRole] = useState<UserRole>("staff");
  const [allCompanies, setAllCompanies] = useState(false);
  const [companyIds, setCompanyIds] = useState<string[]>(defaultCompanyId ? [defaultCompanyId] : []);
  const [modules, setModules] = useState<string[] | null>(null);
  const [dashboard, setDashboard] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ fullName: string; username: string; email: string; password: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await createMember({
        fullName,
        username,
        email,
        password,
        role,
        allCompanies,
        companyIds,
        allowedModules: modules,
        canViewMainDashboard: role === "super_admin" || dashboard,
      });
      setCreated({ fullName, username, email, password });
      setFullName("");
      setUsername("");
      setEmail("");
      setPassword(randomPassword());
      setRole("staff");
      setAllCompanies(false);
      setCompanyIds(defaultCompanyId ? [defaultCompanyId] : []);
      setDashboard(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create member.");
    } finally {
      setSaving(false);
    }
  }

  if (created) {
    return (
      <div className="rounded-xl border border-success/30 bg-success-bg p-5">
        <div className="text-[14px] font-bold text-text">{created.fullName}&apos;s account is ready</div>
        <p className="mt-1 text-[12.5px] text-text-secondary">Share these credentials with them securely — this is the only time the password is shown.</p>
        <div className="mt-3 flex flex-col gap-1.5 rounded-lg bg-surface p-3 text-[13px]">
          <div><span className="font-semibold text-text-secondary">Username:</span> {created.username}</div>
          {created.email && <div><span className="font-semibold text-text-secondary">Email:</span> {created.email}</div>}
          <div><span className="font-semibold text-text-secondary">Password:</span> {created.password}</div>
        </div>
        <button onClick={() => setCreated(null)} className="mt-3 rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white">
          Add Another Member
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-white">
        + Add Member
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5 shadow-sm">
      {error && <div className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">{error}</div>}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Full Name *</label>
          <input required value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Username *</label>
          <input required value={username} onChange={(e) => setUsername(e.target.value)} className={inputClass} placeholder="e.g. nabilah" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Email (optional)</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Password *</label>
          <div className="mt-1.5 flex gap-2">
            <PasswordInput required value={password} onChange={setPassword} className="h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none" />
            <button type="button" onClick={() => setPassword(randomPassword())} className="whitespace-nowrap rounded-lg border border-border-strong px-3 text-xs font-semibold text-text">
              Generate
            </button>
          </div>
        </div>
      </div>

      <div>
        <label className={labelClass}>Role *</label>
        <Select value={role} onChange={(e) => setRole(e.target.value as UserRole)} className={inputClass}>
          {Object.entries(ROLE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select>
      </div>

      <CompanyPicker
        companies={companies}
        allCompanies={allCompanies}
        companyIds={companyIds}
        forceAll={role === "super_admin"}
        onChange={(next) => {
          setAllCompanies(next.allCompanies);
          setCompanyIds(next.companyIds);
        }}
      />

      <ModulePicker value={modules} onChange={setModules} />
      <label className="mt-2 flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2.5 text-[12.5px] text-text">
        <input type="checkbox" checked={role === "super_admin" || dashboard} disabled={role === "super_admin"} onChange={(e) => setDashboard(e.target.checked)} />
        Can view the Main Dashboard (the company figures)
      </label>

      <div className="flex justify-end gap-2.5">
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-text">
          Cancel
        </button>
        <button type="submit" disabled={saving} className="rounded-lg bg-primary px-5 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-60">
          {saving ? "Creating..." : "Create Member"}
        </button>
      </div>
    </form>
  );
}
