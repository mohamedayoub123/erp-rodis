"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { supprimerLigneCommandeArticlePlastiqueAction } from "./actions";

// Bouton "Supprimer" d'UN article d'une commande : demande confirmation, retire la ligne, puis recharge la page.
export function SupprimerLigneCommandeButton({
  ligneId,
  nomArticle,
  code,
}: {
  ligneId: number;
  nomArticle: string;
  code: string;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  function supprimer() {
    if (
      !window.confirm(
        `Retirer ${nomArticle} de la commande ${code} ? Sa quantite ne comptera plus dans la colonne "A fabriquer" de Statistique Article Plastique.`
      )
    ) {
      return;
    }
    setMessage(null);
    demarrer(async () => {
      try {
        const reponse = await supprimerLigneCommandeArticlePlastiqueAction(ligneId);
        if (!reponse.ok) {
          setMessage(reponse.message);
          return;
        }
        router.refresh();
      } catch {
        setMessage("Suppression impossible (session fermee ?). Recharge la page.");
      }
    });
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={supprimer}
        disabled={enCours}
        className="rounded-full border border-red-200 px-3 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
      >
        {enCours ? "Suppression..." : "Supprimer"}
      </button>
      {message ? <span className="max-w-xs text-right text-xs font-semibold text-red-600">{message}</span> : null}
    </span>
  );
}
