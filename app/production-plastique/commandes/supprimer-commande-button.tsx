"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { supprimerCommandeArticlePlastiqueAction } from "./actions";

// Bouton "Supprimer" d'une commande : demande confirmation, supprime, puis recharge la liste
// (ou revient a la liste quand on est sur la page de la commande).
export function SupprimerCommandeButton({
  commandeId,
  code,
  retourListe = false,
}: {
  commandeId: number;
  code: string;
  retourListe?: boolean;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  function supprimer() {
    if (
      !window.confirm(
        `Supprimer la commande ${code} ? La colonne "A fabriquer" reviendra a la commande precedente.`
      )
    ) {
      return;
    }
    setMessage(null);
    demarrer(async () => {
      try {
        const reponse = await supprimerCommandeArticlePlastiqueAction(commandeId);
        if (!reponse.ok) {
          setMessage(reponse.message);
          return;
        }
        if (retourListe) router.push("/production-plastique/commandes");
        else router.refresh();
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
        className="rounded-full border border-red-200 px-4 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
      >
        {enCours ? "Suppression..." : "Supprimer"}
      </button>
      {message ? <span className="text-xs font-semibold text-red-600">{message}</span> : null}
    </span>
  );
}
