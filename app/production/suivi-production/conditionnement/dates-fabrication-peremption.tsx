"use client";

import { useState } from "react";
import { DateJmaInput, MOIS_OPTIONS } from "@/app/_components/date-jma-input";
import { ajouterAnnees } from "@/lib/date-peremption";

function libelleDate(dateIso: string) {
  const [annee, mois, jour] = dateIso.split("-");
  const nomMois = MOIS_OPTIONS.find((option) => option.value === mois)?.label;
  return annee && nomMois && jour ? `${Number(jour)} ${nomMois} ${annee}` : "";
}

// Date de fabrication (pre-remplie, modifiable) + date de peremption AUTOMATIQUE = fabrication + 3 ans
// (5 ans pour gel douche / savon / huile / serum / pommade, voir lib/date-peremption.ts) - jamais
// modifiable : l'action serveur la recalcule de toute facon, rien n'est envoye pour la peremption.
export function DatesFabricationPeremption({
  defaultFabrication,
  dureeAns,
}: {
  defaultFabrication: string;
  // null = produit pas encore choisi (Nouvelle fiche) : la date est calculee a l'enregistrement.
  dureeAns: 3 | 5 | null;
}) {
  const [fabrication, setFabrication] = useState(defaultFabrication);
  const peremption = fabrication && dureeAns ? ajouterAnnees(fabrication, dureeAns) : "";

  // Deux cases a placer dans la grille du parent (a cote de Nb de journaliers / Temps demarage lot).
  return (
    <>
      <div className="grid gap-1 text-xs font-semibold text-slate-500">
        Date de fabrication
        <span className="font-normal normal-case text-slate-500">
          Remplie automatiquement - tu peux la changer.
        </span>
        <DateJmaInput value={fabrication} onChange={setFabrication} required />
        <input type="hidden" name="date_fabrication_conditionnement" value={fabrication} />
      </div>
      <div className="grid gap-1 text-xs font-semibold text-slate-500">
        Date de peremption
        <span className="font-normal normal-case text-slate-500">
          {dureeAns
            ? `Automatique : date de fabrication + ${dureeAns} ans - non modifiable.`
            : "Automatique - non modifiable."}
        </span>
        <div
          className="w-fit min-w-56 max-w-md rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700"
          aria-live="polite"
        >
          {dureeAns
            ? peremption
              ? libelleDate(peremption)
              : "-"
            : "Calculee a l'enregistrement : fabrication + 3 ans (5 ans pour gel douche, savon, huile, serum, pommade)."}
        </div>
      </div>
    </>
  );
}
