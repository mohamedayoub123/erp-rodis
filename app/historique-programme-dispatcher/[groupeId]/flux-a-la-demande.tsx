"use client";

import { useState, useTransition } from "react";
import { CodeFluxCard } from "@/app/_components/code-flux-card";
import type { CodeFlux } from "@/lib/production-code-flux";
import { chargerFluxPdAction } from "./actions";

// Bloc "Flux - matiere premiere et produit fini par code" : replie par defaut, et son calcul (plusieurs secondes) ne se lance que
// quand on le deplie pour la premiere fois - la page de la PD s'ouvre donc tout de suite.
export function FluxALaDemande({ groupeId, nbCodes }: { groupeId: number; nbCodes: number }) {
  const [flux, setFlux] = useState<CodeFlux[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, demarrer] = useTransition();

  function charger() {
    if (flux !== null || chargement) return;
    setErreur(null);
    demarrer(async () => {
      const reponse = await chargerFluxPdAction(groupeId);
      if (reponse.ok) setFlux(reponse.flux);
      else setErreur(reponse.message);
    });
  }

  return (
    <details
      onToggle={(event) => {
        if ((event.currentTarget as HTMLDetailsElement).open) charger();
      }}
      className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]"
    >
      <summary className="cursor-pointer px-6 py-4 text-sm font-bold text-slate-900">
        Flux - matiere premiere et produit fini par code
        <span className="ml-2 font-normal text-slate-500">
          ({nbCodes} code{nbCodes > 1 ? "s" : ""} - clique pour afficher)
        </span>
      </summary>
      <div className="space-y-3 border-t border-slate-100 px-6 py-4">
        {chargement ? <p className="text-sm text-slate-500">Chargement du flux...</p> : null}
        {erreur ? (
          <p className="text-sm font-semibold text-red-700">
            {erreur}{" "}
            <button type="button" onClick={charger} className="underline">
              Reessayer
            </button>
          </p>
        ) : null}
        {flux !== null && flux.length === 0 ? <p className="text-sm text-slate-500">Aucun flux trouve pour ces codes.</p> : null}
        {flux?.map((element) => (
          <CodeFluxCard key={element.code} flux={element} />
        ))}
      </div>
    </details>
  );
}
