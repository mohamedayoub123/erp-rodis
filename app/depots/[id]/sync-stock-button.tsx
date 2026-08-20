"use client";

import { useFormStatus } from "react-dom";

// Action irreversible et large (touche TOUS les articles/lots du depot,
// remet a 0 tout ce qui n'est pas reserve) - confirmation explicite avant
// envoi, meme principe que DeleteIconButton. Bouton local (pas SubmitButton
// partage) car il a besoin d'un onClick de confirmation en plus de la
// protection anti-double-clic classique.
export function SyncStockButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(event) => {
        if (
          !window.confirm(
            "Ça va mettre le Stock de TOUS les articles de ce dépôt égal à leur Réservé - tout ce qui n'est PAS réservé passera à 0. Cette action est définitive. Continuer ?"
          )
        ) {
          event.preventDefault();
        }
      }}
      className="rounded-full bg-amber-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:bg-amber-300"
    >
      {pending ? "Alignement..." : "Mettre tout le stock = Reserve"}
    </button>
  );
}
