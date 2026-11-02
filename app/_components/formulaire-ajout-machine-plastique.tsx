"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/app/_components/submit-button";
import {
  ajouterMachinePlastiqueAction,
  type EtatAjoutMachine,
} from "@/app/_components/statistique-article-plastique-actions";

// Ligne "+ Machine" d'un article dans Statistique Article Plastique (E3) : le nom de la machine (pris dans la liste des
// equipements) et ses cavites. Une erreur (machine absente de la liste, champ vide, cavites invalides) s'affiche ICI,
// sous la ligne, au lieu de faire planter la page.
export function FormulaireAjoutMachinePlastique({
  articleId,
  aDesMachines,
}: {
  articleId: number;
  aDesMachines: boolean;
}) {
  const [etat, action] = useActionState<EtatAjoutMachine, FormData>(ajouterMachinePlastiqueAction, null);

  return (
    <form action={action} className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-1">
        <input type="hidden" name="article_id" value={articleId} />
        <input
          type="text"
          name="equipement"
          list="equipements-e3"
          placeholder={aDesMachines ? "+ Une autre machine..." : "+ Machine..."}
          autoComplete="off"
          maxLength={100}
          aria-label="Ajouter une machine (nom pris dans la liste des equipements)"
          className="w-40 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm outline-none"
        />
        <input
          type="number"
          name="nb_cavites"
          placeholder="Cav."
          min="1"
          max="999"
          step="1"
          aria-label="Cavites de cette machine"
          className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm outline-none"
        />
        <SubmitButton
          pendingLabel="..."
          className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white transition hover:bg-slate-800"
        >
          Ajouter
        </SubmitButton>
      </div>
      {etat?.erreur ? (
        <p role="alert" className="max-w-xs rounded-lg bg-red-50 px-2 py-1 text-xs font-medium text-red-700">
          {etat.erreur}
        </p>
      ) : null}
    </form>
  );
}
