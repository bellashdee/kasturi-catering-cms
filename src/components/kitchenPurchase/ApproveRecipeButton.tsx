"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { approveRecipe, approveRecipes } from "@/lib/kitchenPurchase/recipeActions";

/** A chef approves a draft recipe as an official company recipe. */
export function ApproveRecipeButton({ recipeId }: { recipeId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function approve() {
    if (!window.confirm("I have reviewed this recipe and it matches how our kitchen cooks it. Approve it as a company recipe?")) return;
    setBusy(true);
    setError(null);
    try {
      const r = await approveRecipe(recipeId);
      if (!r.ok) setError(r.error);
      else router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button type="button" disabled={busy} onClick={approve} className="h-11 rounded-lg bg-primary px-5 text-[14px] font-bold text-white disabled:opacity-60">
        {busy ? "Approving..." : "Approve this recipe"}
      </button>
      {error && (
        <span role="alert" className="text-[12.5px] text-danger">
          {error}
        </span>
      )}
    </div>
  );
}

/** A chef approves every draft recipe shown in the list, after checking them. */
export function ApproveDraftsButton({ ids }: { ids: string[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function approveAll() {
    if (!window.confirm(`I have checked these ${ids.length} recipes and they match how our kitchen cooks. Approve all ${ids.length} as company recipes?`)) return;
    setBusy(true);
    setMessage(null);
    try {
      const r = await approveRecipes(ids);
      setMessage(r.ok ? `${r.count} recipes approved.` : r.error);
      if (r.ok) router.refresh();
    } catch {
      setMessage("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button type="button" disabled={busy} onClick={approveAll} className="h-11 w-fit rounded-lg bg-primary px-5 text-[14px] font-bold text-white disabled:opacity-60">
        {busy ? "Approving..." : `Approve all ${ids.length} shown`}
      </button>
      {message && <span role="status" className="text-[12.5px]">{message}</span>}
    </div>
  );
}
