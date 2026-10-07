"use client";

import { useState } from "react";
import {
  NB_CASIERS_MAX,
  NB_RELEVES,
  calculerCartonsCasiers,
  moyenne,
} from "@/lib/conditionnement-par-ligne";

const CHAMP =
  "rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none";

function enNombre(valeur: string): number | null {
  const brut = valeur.trim().replace(",", ".");
  if (!brut) return null;
  const nombre = Number(brut);
  return Number.isFinite(nombre) ? nombre : null;
}

function formater(valeur: number) {
  return valeur.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

// Partie "Production" de l'Entree par ligne : casiers coches (1 a 200) + pieces par casier -> cartons
// calcules en direct ; 10 releves de cadence (toutes les 15 min) et 10 releves de poids -> moyennes.
// Ce que l'on voit ici n'est qu'un apercu : l'action serveur recalcule tout a l'enregistrement.
export function ParLigneProduction({
  piecesParCarton,
  apresCasiers,
}: {
  piecesParCarton: number | null;
  // Affiche juste apres le comptage des casiers (ex: Temps arret batch), avant Cadence et Poids.
  apresCasiers?: React.ReactNode;
}) {
  const [casiers, setCasiers] = useState<Set<number>>(new Set());
  const [piecesParCasier, setPiecesParCasier] = useState("");
  const [cadence, setCadence] = useState<string[]>(() => Array(NB_RELEVES).fill(""));
  const [poids, setPoids] = useState<string[]>(() => Array(NB_RELEVES).fill(""));

  function basculerCasier(numero: number) {
    setCasiers((courant) => {
      const suivant = new Set(courant);
      if (suivant.has(numero)) suivant.delete(numero);
      else suivant.add(numero);
      return suivant;
    });
  }

  function changerReleve(
    liste: string[],
    setListe: (valeurs: string[]) => void,
    index: number,
    valeur: string
  ) {
    const copie = [...liste];
    copie[index] = valeur;
    setListe(copie);
  }

  const { pieces, cartons } = calculerCartonsCasiers({
    nbCasiers: casiers.size,
    piecesParCasier: enNombre(piecesParCasier),
    piecesParCarton,
  });
  const moyenneCadence = moyenne(cadence.map(enNombre));
  const moyennePoids = moyenne(poids.map(enNombre));

  return (
    <div className="grid gap-6">
      <div>
        <h3 className="mb-1 text-base font-bold text-slate-900">Casiers sortis</h3>
        <p className="mb-3 text-xs text-slate-500">
          Chaque fois qu&apos;un casier sort de la ligne, coche son numero (de 1 a {NB_CASIERS_MAX}). Le nombre de
          cartons se calcule tout seul : casiers coches x pieces par casier / pieces par carton
          {piecesParCarton ? ` (${formater(piecesParCarton)} pieces par carton pour cet article)` : ""}.
        </p>

        <div className="mb-4 grid gap-4 md:grid-cols-3">
          <label className="grid gap-1 text-xs font-semibold text-slate-500">
            Pieces dans un casier
            <input
              type="number"
              step="any"
              min="0"
              name="pieces_par_casier"
              value={piecesParCasier}
              onChange={(event) => setPiecesParCasier(event.target.value)}
              required
              className={CHAMP}
            />
          </label>
          <div className="grid gap-1 text-xs font-semibold text-slate-500">
            Casiers sortis / pieces
            <div className={`${CHAMP} bg-slate-50`}>
              {casiers.size} / {NB_CASIERS_MAX} casiers - {formater(pieces)} pieces
            </div>
          </div>
          <div className="grid gap-1 text-xs font-semibold text-slate-500">
            Carton fabriquer (calcule)
            <div className={`${CHAMP} bg-sky-50 font-bold text-sky-800`} aria-live="polite">
              {formater(cartons)}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Casiers sortis">
          {Array.from({ length: NB_CASIERS_MAX }, (_, index) => index + 1).map((numero) => {
            const coche = casiers.has(numero);
            return (
              <label
                key={numero}
                className={`flex h-11 w-11 cursor-pointer select-none items-center justify-center rounded-xl border text-sm font-semibold transition focus-within:ring-2 focus-within:ring-sky-400 ${
                  coche
                    ? "border-sky-700 bg-sky-700 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                <input
                  type="checkbox"
                  name="casier"
                  value={numero}
                  checked={coche}
                  onChange={() => basculerCasier(numero)}
                  className="sr-only"
                />
                {numero}
              </label>
            );
          })}
        </div>
        {!piecesParCarton ? (
          <p className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800">
            Le nombre de pieces par carton de cet article est inconnu : les cartons ne peuvent pas etre calcules.
          </p>
        ) : null}
      </div>

      {apresCasiers}

      <ReleveGrille
        titre="Cadence"
        aide="Un releve toutes les 15 minutes - la moyenne des cases remplies est enregistree."
        prefixe="cadence"
        valeurs={cadence}
        moyenneCalculee={moyenneCadence}
        onChange={(index, valeur) => changerReleve(cadence, setCadence, index, valeur)}
      />

      <ReleveGrille
        titre="Releve poids reel"
        aide="Jusqu'a 10 releves - la moyenne des cases remplies est enregistree."
        prefixe="poids"
        valeurs={poids}
        moyenneCalculee={moyennePoids}
        onChange={(index, valeur) => changerReleve(poids, setPoids, index, valeur)}
      />
    </div>
  );
}

function ReleveGrille({
  titre,
  aide,
  prefixe,
  valeurs,
  moyenneCalculee,
  onChange,
}: {
  titre: string;
  aide: string;
  prefixe: string;
  valeurs: string[];
  moyenneCalculee: number;
  onChange: (index: number, valeur: string) => void;
}) {
  return (
    <div>
      <h3 className="mb-1 text-base font-bold text-slate-900">{titre}</h3>
      <p className="mb-3 text-xs text-slate-500">{aide}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {valeurs.map((valeur, index) => (
          <label key={index} className="grid gap-1 text-xs font-semibold text-slate-500">
            Releve {index + 1}
            <input
              type="number"
              step="any"
              name={`${prefixe}_${index + 1}`}
              value={valeur}
              onChange={(event) => onChange(index, event.target.value)}
              className={CHAMP}
            />
          </label>
        ))}
      </div>
      <p className="mt-3 text-sm font-semibold text-slate-700">
        Moyenne : <span className="text-sky-800">{formater(moyenneCalculee)}</span>
      </p>
    </div>
  );
}
