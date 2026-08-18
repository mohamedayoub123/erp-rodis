"use client";

import { useState, useTransition } from "react";
import { deleteProgrammeLigneDashboardAction } from "../actions";

// Supprime TOUT le programme (pas juste ce code) - message de confirmation
// explicite la-dessus pour eviter qu'un clic supprime a tort les autres
// codes/etapes deja saisis pour la meme ligne (demande explicite : toujours
// demander oui/non avant de supprimer).
export function DeleteProgrammeLigneButton({ ligneId, produit }: { ligneId: number; produit: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function handleClick() {
    const confirmed = window.confirm(
      `Supprimer tout le programme "${produit}" ? Ca efface la ligne ET tout ce qui a deja ete saisi dessus (Fabrication, Conditionnement, Emballage, tous les codes). Cette action est definitive.`
    );
    if (!confirmed) return;

    setError("");
    startTransition(async () => {
      const formData = new FormData();
      formData.set("ligne_id", String(ligneId));
      try {
        await deleteProgrammeLigneDashboardAction(formData);
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
        title="Supprimer tout ce programme"
        aria-label="Supprimer tout ce programme"
        className="flex h-8 w-8 items-center justify-center rounded-full border border-red-200 text-red-700 transition hover:bg-red-50 disabled:opacity-60"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
          <path d="M3 6h18" />
          <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          <path d="M10 11v6" />
          <path d="M14 11v6" />
        </svg>
      </button>
      {error ? <span className="text-xs font-semibold text-red-700">{error}</span> : null}
    </div>
  );
}
