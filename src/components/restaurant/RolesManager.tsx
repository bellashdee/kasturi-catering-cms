"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addRestaurantRole, removeRestaurantRole } from "@/lib/restaurant/actions";
import { RESTAURANT_ROLES } from "@/lib/restaurant/constants";
import { StatusBadge } from "@/components/StatusBadge";

export type PersonRoles = {
  userId: string;
  name: string;
  login: string;
  hasModule: boolean;
  roles: { id: string; role: string }[];
};

/** Admins give each person their restaurant roles (what the person may DO); the module list in Settings decides what appears in their menu. */
export function RolesManager({ companyId, people }: { companyId: string; people: PersonRoles[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(p: PersonRoles, role: string) {
    const existing = p.roles.find((r) => r.role === role);
    setBusy(`${p.userId}:${role}`);
    setError(null);
    try {
      const r = existing ? await removeRestaurantRole(existing.id) : await addRestaurantRole(companyId, p.userId, role);
      if (!r.ok) setError(r.error);
      else router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <div role="alert" className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-[13px] text-danger">{error}</div>}
      <div className="rounded-3xl border border-border bg-surface shadow-sm">
        <div className="overflow-x-auto p-2 sm:p-4">
          <table className="w-full text-[13.5px]">
            <thead>
              <tr className="border-b border-border text-left text-[12px] text-text-muted">
                <th className="px-2 py-2 font-semibold">Person</th>
                <th className="px-2 py-2 font-semibold">Restaurant menu</th>
                {RESTAURANT_ROLES.map((r) => <th key={r.key} className="px-2 py-2 text-center font-semibold">{r.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.userId} className="border-b border-border last:border-0">
                  <td className="px-2 py-2"><div className="font-semibold">{p.name}</div><div className="text-[12px] text-text-muted">{p.login}</div></td>
                  <td className="px-2 py-2">{p.hasModule ? <StatusBadge tone="success">On</StatusBadge> : <StatusBadge tone="warning">Off</StatusBadge>}</td>
                  {RESTAURANT_ROLES.map((r) => {
                    const on = p.roles.some((x) => x.role === r.key);
                    return (
                      <td key={r.key} className="px-2 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={busy === `${p.userId}:${r.key}`}
                          onChange={() => toggle(p, r.key)}
                          aria-label={`${p.name}: ${r.label}`}
                          className="h-5 w-5 accent-[var(--color-primary)]"
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="rounded-2xl border border-border bg-surface px-5 py-4 text-[13px] text-text-secondary">
        <div className="mb-1.5 font-bold text-text">What each role may do</div>
        <ul className="flex flex-col gap-1">
          {RESTAURANT_ROLES.map((r) => <li key={r.key}><span className="font-semibold text-text">{r.label}:</span> {r.note}.</li>)}
        </ul>
        <p className="mt-2">The Owner and Admin (Super Admin and Company Admin) can do everything without a role here. A person whose Restaurant menu is Off cannot open these pages: switch the Restaurant module on for them in Settings.</p>
      </div>
    </div>
  );
}
