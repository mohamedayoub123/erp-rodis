"use client";

import { useState } from "react";
import { LotSearchField } from "@/app/depots/transfer-order/lot-search-field";

type Lot = { numeroLot: string; solde: number; libelle?: string };

function formater(valeur: number) {
  return valeur.toLocaleString("fr-FR", { maximumFractionDigits: 3 });
}

// Champs "Qt a recuperer" + "Code vrac recupere" de la Fabrication (fiche Entrer et nouvelle fiche +) : la quantite ne peut pas
// depasser le stock du lot choisi (affiche sous le champ). Les lots a 0 ne sont pas dans la liste. A utiliser comme 2 elements
// d'une grille (fragment). dejaPris = quantite que CETTE fiche avait deja retiree de ce lot (remplacee a l'enregistrement : elle
// reste donc disponible pour une correction).
export function VracRecupereFields({
  lots,
  codeInitial = "",
  quantiteInitiale = "0",
  dejaPris = 0,
  classeChamp,
}: {
  lots: Lot[];
  codeInitial?: string;
  quantiteInitiale?: string | number;
  dejaPris?: number;
  classeChamp: string;
}) {
  const [code, setCode] = useState(codeInitial);
  const [quantite, setQuantite] = useState(String(quantiteInitiale));

  const saisi = code.trim().toLowerCase();
  const lot = lots.find((candidat) => candidat.numeroLot.trim().toLowerCase() === saisi) ?? null;
  const reprise = saisi !== "" && saisi === codeInitial.trim().toLowerCase() ? dejaPris : 0;
  const disponible = saisi ? Math.max(0, Math.round(((lot?.solde ?? 0) + reprise) * 1000) / 1000) : 0;
  const depasse = Number(quantite.replace(",", ".")) > disponible + 1e-9;

  return (
    <>
      <label className="grid gap-1 text-xs font-semibold text-slate-500">
        Qt a recuperer
        <input
          type="number"
          step="0.01"
          min="0"
          max={disponible}
          name="qt_vrac_recupere"
          value={quantite}
          onChange={(event) => setQuantite(event.target.value)}
          required
          className={classeChamp}
        />
        <span className={`text-xs font-normal ${depasse ? "font-semibold text-red-700" : "text-slate-400"}`}>
          {saisi
            ? `Stock disponible de ce lot : ${formater(disponible)} kg${depasse ? " - quantite trop grande" : ""}`
            : "Choisis d'abord le code vrac (a droite) pour voir son stock"}
        </span>
      </label>
      <label className="grid gap-1 text-xs font-semibold text-slate-500">
        Code vrac recupere
        <LotSearchField name="code_vrac_recupere" defaultValue={codeInitial} lots={lots} strict compact onChange={setCode} />
      </label>
    </>
  );
}
