"use client";

import { useState } from "react";
import { ProduitPickerField } from "@/app/production/suivi-production/produit-picker-field";

// Une ligne de Transfer Order peut porter sur un article MP ou PF - ce choix
// (article_type, radio natif du formulaire) determine simplement quelle
// liste d'articles alimente ProduitPickerField. "key={type}" force
// ProduitPickerField a se remonter au changement de type, pour ne jamais
// garder une selection de l'autre type affichee par erreur.
export function TransferArticlePicker({
  articlesMp,
  articlesPf,
}: {
  articlesMp: { id: number; label: string }[];
  articlesPf: { id: number; label: string }[];
}) {
  const [type, setType] = useState<"MP" | "PF">("MP");

  return (
    <div className="grid gap-2">
      <div className="flex gap-4 text-xs font-semibold text-slate-500">
        <label className="flex items-center gap-1.5">
          <input
            type="radio"
            name="article_type"
            value="MP"
            checked={type === "MP"}
            onChange={() => setType("MP")}
          />
          Matiere premiere
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="radio"
            name="article_type"
            value="PF"
            checked={type === "PF"}
            onChange={() => setType("PF")}
          />
          Produit fini
        </label>
      </div>
      <ProduitPickerField
        key={type}
        articles={type === "MP" ? articlesMp : articlesPf}
        hiddenName="article_id"
        textName="produit"
      />
    </div>
  );
}
