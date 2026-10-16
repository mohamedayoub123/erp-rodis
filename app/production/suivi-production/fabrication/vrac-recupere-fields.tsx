"use client";

import { useRef, useState } from "react";
import { LotSearchField } from "@/app/depots/transfer-order/lot-search-field";
import { MAX_RECUPERATIONS, nomChampRecuperation, type Recuperation } from "@/lib/vrac-recuperations";

type Lot = { numeroLot: string; solde: number; libelle?: string };
type Ligne = { cle: number; code: string; quantite: string };

function formater(valeur: number) {
  return valeur.toLocaleString("fr-FR", { maximumFractionDigits: 3 });
}

function nombre(texte: string): number {
  const valeur = Number(texte.replace(",", "."));
  return Number.isFinite(valeur) ? valeur : 0;
}

// Champs "Qt a recuperer" + "Code vrac recupere" de la Fabrication (fiche Entrer et nouvelle fiche +). On peut recuperer le vrac de
// PLUSIEURS codes : le bouton "Ajouter une autre recuperation" ajoute une ligne (code + quantite). Pour chaque ligne la quantite ne
// peut pas depasser le stock du lot choisi (affiche sous le champ) ; si le meme code est mis sur 2 lignes, leurs quantites s'additionnent.
// Les lots a 0 ne sont pas dans la liste. A utiliser comme 2 elements d'une grille (fragment). recuperationsInitiales = ce que CETTE
// fiche avait deja recupere : remplace a l'enregistrement, donc reste disponible pour une correction.
export function VracRecupereFields({
  lots,
  recuperationsInitiales = [],
  classeChamp,
}: {
  lots: Lot[];
  recuperationsInitiales?: Recuperation[];
  classeChamp: string;
}) {
  const prochaineCle = useRef(Math.max(1, recuperationsInitiales.length));
  const dejaPrisParCode = new Map(recuperationsInitiales.map((element) => [element.code.trim().toLowerCase(), element.quantite]));
  const [lignes, setLignes] = useState<Ligne[]>(
    recuperationsInitiales.length > 0
      ? recuperationsInitiales.map((element, index) => ({ cle: index, code: element.code, quantite: String(element.quantite) }))
      : [{ cle: 0, code: "", quantite: "0" }]
  );

  function modifier(cle: number, changement: Partial<Ligne>) {
    setLignes((courantes) => courantes.map((ligne) => (ligne.cle === cle ? { ...ligne, ...changement } : ligne)));
  }

  function disponiblePour(index: number): number {
    const code = lignes[index].code.trim().toLowerCase();
    if (!code) return 0;
    const lot = lots.find((candidat) => candidat.numeroLot.trim().toLowerCase() === code) ?? null;
    const reprise = dejaPrisParCode.get(code) ?? 0;
    const autres = lignes.reduce(
      (somme, ligne, i) => (i !== index && ligne.code.trim().toLowerCase() === code ? somme + nombre(ligne.quantite) : somme),
      0
    );
    return Math.max(0, Math.round(((lot?.solde ?? 0) + reprise - autres) * 1000) / 1000);
  }

  function champsDeLaLigne(index: number) {
    const ligne = lignes[index];
    const rang = index + 1;
    const saisi = ligne.code.trim().toLowerCase();
    const disponible = disponiblePour(index);
    const depasse = nombre(ligne.quantite) > disponible + 1e-9;
    const suffixe = rang > 1 ? ` (${rang})` : "";
    return (
      <>
        <label className="grid gap-1 text-xs font-semibold text-slate-500">
          {`Qt a recuperer${suffixe}`}
          <input
            type="number"
            step="0.01"
            min="0"
            max={disponible}
            name={nomChampRecuperation("qt", rang)}
            value={ligne.quantite}
            onChange={(event) => modifier(ligne.cle, { quantite: event.target.value })}
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
          {`Code vrac recupere${suffixe}`}
          <LotSearchField
            name={nomChampRecuperation("code", rang)}
            defaultValue={ligne.code}
            lots={lots}
            strict
            compact
            onChange={(valeur) => modifier(ligne.cle, { code: valeur })}
          />
        </label>
      </>
    );
  }

  return (
    <>
      {champsDeLaLigne(0)}
      {lignes.slice(1).map((ligne, position) => (
        <div key={ligne.cle} className="col-span-full grid items-start gap-4 md:grid-cols-[1fr_1fr_auto]">
          {champsDeLaLigne(position + 1)}
          <button
            type="button"
            onClick={() => setLignes((courantes) => courantes.filter((element) => element.cle !== ligne.cle))}
            className="mt-5 rounded-full border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100"
          >
            Retirer
          </button>
        </div>
      ))}
      {lignes.length < MAX_RECUPERATIONS ? (
        <div className="col-span-full">
          <button
            type="button"
            onClick={() => {
              const cle = prochaineCle.current++;
              setLignes((courantes) => [...courantes, { cle, code: "", quantite: "0" }]);
            }}
            className="rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-xs font-semibold text-sky-800 hover:bg-sky-100"
          >
            + Ajouter une autre recuperation (autre code)
          </button>
        </div>
      ) : null}
    </>
  );
}
