"use client";

import { useState, useTransition } from "react";
import { deleteSuiviProductionRowAction } from "./actions";

export function DeleteRowButton({
  fabricationId,
  conditionnementId,
  emballageId,
  rapportId,
  ligneId,
  code,
}: {
  fabricationId?: number | null;
  conditionnementId?: number | null;
  emballageId?: number | null;
  rapportId?: number | null;
  ligneId: number;
  code: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function handleClick() {
    if (!window.confirm("Supprimer cette ligne ?")) return;
    setError("");
    startTransition(async () => {
      try {
        await deleteSuiviProductionRowAction({
          fabricationId,
          conditionnementId,
          emballageId,
          rapportId,
          ligneId,
          code,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur pendant la suppression.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="rounded-xl border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-60"
      >
        {isPending ? "..." : "Supprimer"}
      </button>
      {error ? <span className="text-xs font-semibold text-red-700">{error}</span> : null}
    </div>
  );
}
