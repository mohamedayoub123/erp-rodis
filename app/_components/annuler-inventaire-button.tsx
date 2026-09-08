"use client";

import { useFormStatus } from "react-dom";

// Abandonne une session d'inventaire en cours - demande explicite
// ("possibilite d'annuler si je veux"). Confirmation avant envoi, meme
// principe que DeleteIconButton/SyncStockButton : toute action qui arrete
// un travail en cours doit d'abord demander une confirmation oui/non.
export function AnnulerInventaireButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(event) => {
        if (
          !window.confirm(
            "Annuler cet inventaire ? Le comptage en cours sera abandonne (rien n'est supprime, mais tu devras recommencer une nouvelle session pour continuer). Continuer ?"
          )
        ) {
          event.preventDefault();
        }
      }}
      className="rounded-full border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Annulation..." : "Annuler l'inventaire"}
    </button>
  );
}
