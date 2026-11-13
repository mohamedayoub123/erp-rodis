"use client";

import { useState } from "react";

function nombre(texte: string): number {
  const valeur = Number(texte.replace(",", "."));
  return Number.isFinite(valeur) ? valeur : 0;
}

function formater(valeur: number) {
  return valeur.toLocaleString("fr-FR", { maximumFractionDigits: 3 });
}

// Champ "Qt mise en recuperation" de la Fabrication (fiche Entrer et fiche +) : la partie du vrac fabrique qu'on n'utilise PAS pour ce
// code. A l'enregistrement elle entre au Depot B (module "Vrac a recuperer") sous le MEME code que la fiche - donc proposee ensuite dans
// "Code vrac recupere" - et n'est pas envoyee au Conditionnement. vracFabrique (fiche Entrer : somme des cuves) plafonne la quantite et
// affiche ce qui reste pour ce code ; absent (fiche + : vrac saisi a la main) = pas de plafond cote navigateur, le serveur controle.
// A utiliser comme 1 ou 2 elements d'une grille (fragment).
export function VracMisEnRecuperationField({
  code,
  quantiteInitiale = 0,
  vracFabrique,
  classeChamp,
}: {
  code?: string;
  quantiteInitiale?: number;
  vracFabrique?: number;
  classeChamp: string;
}) {
  const [quantite, setQuantite] = useState(String(quantiteInitiale));
  const mise = nombre(quantite);
  const depasse = vracFabrique !== undefined && mise > vracFabrique + 1e-9;
  const utilisee = vracFabrique !== undefined ? Math.max(0, Math.round((vracFabrique - mise) * 1000) / 1000) : null;

  return (
    <>
      <label className="grid gap-1 text-xs font-semibold text-slate-500">
        Qt mise en recuperation (kg)
        <input
          type="number"
          step="0.01"
          min="0"
          max={vracFabrique}
          name="qt_mise_en_recuperation"
          value={quantite}
          onChange={(event) => setQuantite(event.target.value)}
          required
          className={classeChamp}
        />
        <span className={`text-xs font-normal ${depasse ? "font-semibold text-red-700" : "text-slate-400"}`}>
          {depasse
            ? `Plus que le vrac fabrique (${formater(vracFabrique ?? 0)} kg)`
            : `Entre au Depot B (Vrac a recuperer) sous ${code ? `le code ${code}` : "le code de cette fiche"} - pas envoye au Conditionnement`}
        </span>
      </label>
      {utilisee !== null ? (
        <label className="grid gap-1 text-xs font-semibold text-slate-500">
          Qt utilisee pour ce code (auto)
          <input type="number" step="0.01" value={utilisee} readOnly className={`${classeChamp} bg-slate-50 text-slate-600`} />
          <span className="text-xs font-normal text-slate-400">
            Vrac fabrique - mise en recuperation = envoye au Conditionnement (le vrac recupere d&apos;un autre code, plus bas, s&apos;ajoute en plus)
          </span>
        </label>
      ) : null}
    </>
  );
}
