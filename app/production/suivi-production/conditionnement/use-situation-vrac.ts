"use client";

import { useEffect, useState } from "react";
import type { SituationVrac } from "@/lib/vrac-surplus";
import { lireSituationVracAction } from "./situation-vrac-action";

// Situation du vrac des codes choisis pour (ligne, code), chargee en arriere-plan apres l'ouverture du formulaire. null tant qu'elle n'est pas
// la, ou quand il n'y a pas de controle (aucun code vrac choisi) : aucun message n'est affiche, le serveur refuse de toute facon a l'enregistrement.
export function useSituationVrac(ligneId: number, code: string): SituationVrac | null {
  const [situation, setSituation] = useState<SituationVrac | null>(null);

  useEffect(() => {
    let annule = false;
    lireSituationVracAction(ligneId, code)
      .then((resultat) => {
        if (!annule) setSituation(resultat);
      })
      .catch(() => {
        if (!annule) setSituation(null);
      });
    return () => {
      annule = true;
    };
  }, [ligneId, code]);

  return situation;
}
