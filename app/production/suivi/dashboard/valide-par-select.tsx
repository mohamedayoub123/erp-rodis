"use client";

import { useState, useTransition } from "react";
import { VALIDEURS_TEST_LABO } from "@/lib/valideurs-test-labo";
import { enregistrerValideParTestLaboAction } from "../actions";

// Colonne "Valide par" du Test labo : liste de noms, enregistree des qu'on choisit. Rendu seulement pour qui a le droit
// de saisir le Test labo (les autres voient le nom en texte dans la page). L'action est importee ici (et non passee en
// prop a chaque ligne) : une reference d'action serveur recopiee sur chaque ligne alourdit la page.
export function ValideParSelect({ ligneId, code, valeur }: { ligneId: number; code: string; valeur: string }) {
  const [choisi, setChoisi] = useState(valeur);
  const [erreur, setErreur] = useState("");
  const [enCours, startTransition] = useTransition();

  function changer(nouveau: string) {
    const ancien = choisi;
    setChoisi(nouveau);
    setErreur("");
    startTransition(async () => {
      const resultat = await enregistrerValideParTestLaboAction(ligneId, code, nouveau);
      if (!resultat.ok) {
        setChoisi(ancien);
        setErreur(resultat.message || "Erreur pendant l'enregistrement.");
      }
    });
  }

  // Un nom enregistre qui ne serait plus dans la liste reste affiche tel quel
  const noms: string[] = [...VALIDEURS_TEST_LABO];
  if (choisi && !noms.includes(choisi)) noms.push(choisi);

  return (
    <div className="flex flex-col items-start gap-1">
      <select
        value={choisi}
        onChange={(evenement) => changer(evenement.target.value)}
        disabled={enCours}
        aria-label="Test labo validé par"
        className={`rounded-lg border px-2 py-1 text-xs font-semibold focus:outline-none disabled:opacity-60 ${
          choisi ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-500"
        }`}
      >
        <option value="">Choisir...</option>
        {noms.map((nom) => (
          <option key={nom} value={nom}>
            {nom}
          </option>
        ))}
      </select>
      {erreur ? <span className="max-w-[14rem] text-xs font-semibold text-red-700">{erreur}</span> : null}
    </div>
  );
}
