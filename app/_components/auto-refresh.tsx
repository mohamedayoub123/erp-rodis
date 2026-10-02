"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Force une donnee fraiche quand la page affichee vient du cache du
// navigateur (retour arriere, onglet restaure) - evite d'afficher une
// version perimee du Dashboard apres une action faite ailleurs (ex: sortie
// de stock produit fini dans Mouvements) qui ne revalide pas cette page
// directement.
//
// Avant, ce rafraichissement partait a CHAQUE arrivee - y compris sur une
// page que le serveur venait de generer a l'instant - ce qui obligeait le
// serveur a calculer le Dashboard (lourd) 2 fois d'affilee a chaque visite,
// recherche ou enregistrement. renderedAt = instant de generation cote
// serveur : une page toute fraiche n'a rien a rafraichir. Valeur absolue,
// donc une horloge locale decalee retombe simplement sur l'ancien
// comportement (toujours rafraichir).
const FRAICHEUR_MS = 10_000;

export function AutoRefresh({ renderedAt }: { renderedAt: number }) {
  const router = useRouter();

  useEffect(() => {
    if (Math.abs(Date.now() - renderedAt) < FRAICHEUR_MS) return;
    router.refresh();
  }, [router, renderedAt]);

  return null;
}
