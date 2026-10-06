"use client";

import { useEffect, useRef } from "react";
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
// serveur : une page toute fraiche n'a rien a rafraichir.
//
// UN SEUL rafraichissement par affichage de la page. Sans cette garde, un
// ordinateur dont l'horloge est decalee de plus de 10 s (ou une page qui met
// plus de 10 s a arriver) relancait un rafraichissement apres chaque
// rafraichissement : le Dashboard se rechargeait en boucle, jour et nuit,
// tant que l'onglet restait ouvert (des centaines de milliers d'appels par
// jour a la base, qui finissait par ne plus repondre).
const FRAICHEUR_MS = 10_000;

export function AutoRefresh({ renderedAt }: { renderedAt: number }) {
  const router = useRouter();
  const dejaRafraichi = useRef(false);

  useEffect(() => {
    if (dejaRafraichi.current) return;
    if (Math.abs(Date.now() - renderedAt) < FRAICHEUR_MS) return;
    dejaRafraichi.current = true;
    router.refresh();
  }, [router, renderedAt]);

  return null;
}
