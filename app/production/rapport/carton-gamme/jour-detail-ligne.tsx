"use client";

import { useState } from "react";

export type ProduitDuJour = { produit: string; total: number };

// Une ligne du "Detail par jour" du Rapport Carton par Gamme : la fleche
// ouvre / ferme la liste des produits fabriques ce jour-la avec leur
// quantite de carton. Les produits s'affichent dans le meme tableau (memes
// colonnes) pour que les quantites restent alignees sous celle du jour.
export function JourDetailLigne({
  jourLabel,
  total,
  produits,
}: {
  jourLabel: string;
  total: number;
  produits: ProduitDuJour[];
}) {
  const [ouvert, setOuvert] = useState(false);

  return (
    <>
      <tr
        className="cursor-pointer border-t border-slate-100 hover:bg-sky-50/40"
        onClick={() => setOuvert((valeur) => !valeur)}
      >
        <td className="px-4 py-3 font-medium text-slate-900">
          <button
            type="button"
            aria-expanded={ouvert}
            aria-label={`${ouvert ? "Cacher" : "Voir"} les produits fabriques le ${jourLabel}`}
            className="flex items-center gap-2 text-left"
          >
            <span
              aria-hidden="true"
              className={`inline-block text-xs text-sky-700 transition-transform ${ouvert ? "rotate-90" : ""}`}
            >
              ▶
            </span>
            {jourLabel}
          </button>
        </td>
        <td className="bg-sky-50/30 px-4 py-3 text-slate-700">{Math.round(total)}</td>
      </tr>
      {ouvert
        ? produits.map((ligne) => (
            <tr key={ligne.produit} className="bg-slate-50/70">
              <td className="py-2 pl-10 pr-4 text-slate-700">{ligne.produit}</td>
              <td className="bg-sky-50/30 px-4 py-2 text-slate-700">{Math.round(ligne.total)}</td>
            </tr>
          ))
        : null}
    </>
  );
}
