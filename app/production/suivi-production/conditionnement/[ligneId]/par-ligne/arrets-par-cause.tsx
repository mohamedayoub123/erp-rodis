"use client";

import { useState } from "react";

const NB_CELLULES = 6;

type Cause = { field: string; label: string };

function enNombre(valeur: string): number {
  const brut = valeur.trim().replace(",", ".");
  if (!brut) return 0;
  const nombre = Number(brut);
  return Number.isFinite(nombre) && nombre > 0 ? nombre : 0;
}

function formater(valeur: number) {
  return valeur.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

// Temps d'arret de l'Entrer par ligne : pour chaque cause, 6 cellules (une par arret, en minutes) et une cellule TOTAL qui se
// calcule toute seule. Seul le total est envoye au serveur (champ arret_xxx de la cause) : l'enregistrement ne change pas.
export function ArretsParCause({ causes, classeChamp }: { causes: readonly Cause[]; classeChamp: string }) {
  const [valeurs, setValeurs] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(causes.map((cause) => [cause.field, Array(NB_CELLULES).fill("")]))
  );

  function changer(champ: string, index: number, valeur: string) {
    setValeurs((courant) => {
      const copie = [...(courant[champ] ?? Array(NB_CELLULES).fill(""))];
      copie[index] = valeur;
      return { ...courant, [champ]: copie };
    });
  }

  const totaux = Object.fromEntries(
    causes.map((cause) => [cause.field, (valeurs[cause.field] ?? []).reduce((somme, valeur) => somme + enNombre(valeur), 0)])
  );
  const totalGeneral = Object.values(totaux).reduce((somme, valeur) => somme + valeur, 0);

  return (
    <div className="grid gap-3">
      {causes.map((cause) => (
        <div key={cause.field} className="grid gap-2 rounded-2xl border border-slate-200 p-3 lg:grid-cols-[minmax(14rem,1fr)_auto] lg:items-center">
          <p className="text-xs font-semibold text-slate-600">{cause.label}</p>
          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: NB_CELLULES }, (_, index) => (
              <input
                key={index}
                type="number"
                step="1"
                min="0"
                inputMode="numeric"
                aria-label={`${cause.label} - arret ${index + 1} (minutes)`}
                placeholder={`${index + 1}`}
                value={valeurs[cause.field]?.[index] ?? ""}
                onChange={(event) => changer(cause.field, index, event.target.value)}
                className={`${classeChamp} w-full min-w-0 px-2 py-2 text-center`}
              />
            ))}
            {/* Valeur envoyee au serveur : nombre brut (le champ affiche, lui, est mis en forme) */}
            <input type="hidden" name={cause.field} value={String(totaux[cause.field] ?? 0)} />
            <input
              type="text"
              readOnly
              tabIndex={-1}
              aria-label={`${cause.label} - total (minutes)`}
              value={formater(totaux[cause.field] ?? 0)}
              className={`${classeChamp} w-full min-w-0 bg-sky-50 px-2 py-2 text-center font-bold text-sky-800`}
            />
          </div>
        </div>
      ))}
      <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 text-sm">
        <span className="font-semibold text-slate-600">Total de tous les arrets</span>
        <span className="font-black tabular-nums text-slate-900">{formater(totalGeneral)} min</span>
      </div>
    </div>
  );
}
