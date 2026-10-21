"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteRecipe } from "@/lib/kitchen/actions";

/** Delete a recipe (after a confirmation); production orders made from it keep their record. */
export function RecipeDeleteButton({ recipeId, recipeName, redirectTo }: { recipeId: string; recipeName: string; redirectTo: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (!window.confirm(`Delete the recipe "${recipeName}" and all its ingredient lines? This cannot be undone.`)) return;
    setBusy(true);
    setError(null);
    try {
      await deleteRecipe(recipeId);
      router.push(redirectTo);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button type="button" onClick={handleClick} disabled={busy} className="rounded-lg border border-danger/40 bg-surface px-4 py-2.5 text-[13px] font-semibold text-danger disabled:opacity-60">
        {busy ? "Deleting..." : "Delete Recipe"}
      </button>
      {error && <span className="text-[12px] font-semibold text-danger">{error}</span>}
    </span>
  );
}
