"use client";

import { useEffect, useRef, useState } from "react";
import { messageVracInsuffisant } from "@/lib/vrac-surplus";
import { useSituationVrac } from "./use-situation-vrac";

// Entree simple du Conditionnement : affiche tout de suite, sous le champ des cartons, le message "le vrac est insuffisant" quand les cartons
// tapes depassent le vrac des codes choisis de plus de 15 cartons - SANS attendre d'appuyer sur Enregistrer (le serveur refuse de toute facon,
// avec le meme message). Ecoute le champ de la meme fiche (nomChamp). quantiteInitiale : cartons de la fournee deja saisie qu'on rouvre ; la
// laisser telle quelle est une simple correction (rien n'est ajoute, pas de controle), comme cote serveur.
export function AlerteSurplusVrac({
  ligneId,
  code,
  nomChamp,
  quantiteInitiale,
}: {
  ligneId: number;
  code: string;
  nomChamp: string;
  quantiteInitiale: number | null;
}) {
  // Le vrac des codes choisis est lu en arriere-plan apres l'ouverture du formulaire (quelques secondes)
  const situation = useSituationVrac(ligneId, code);
  const racine = useRef<HTMLDivElement>(null);
  const [saisi, setSaisi] = useState<number>(quantiteInitiale ?? 0);

  useEffect(() => {
    const champ = racine.current?.closest("form")?.querySelector<HTMLInputElement>(`input[name="${nomChamp}"]`);
    if (!champ) return;
    const lire = () => setSaisi(Number(champ.value.replace(",", ".")) || 0);
    lire();
    champ.addEventListener("input", lire);
    champ.addEventListener("change", lire);
    return () => {
      champ.removeEventListener("input", lire);
      champ.removeEventListener("change", lire);
    };
  }, [nomChamp]);

  const correctionSansChangement = quantiteInitiale !== null && Math.abs(saisi - quantiteInitiale) < 1e-9;
  const message = correctionSansChangement || !situation ? null : messageVracInsuffisant(situation, saisi);

  return (
    <div ref={racine}>
      {message ? (
        <p role="alert" className="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {message}
        </p>
      ) : null}
    </div>
  );
}
