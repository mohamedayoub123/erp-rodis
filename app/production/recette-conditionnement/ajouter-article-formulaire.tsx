"use client";

import { useState } from "react";
import { ProduitPickerField } from "@/app/production/suivi-production/produit-picker-field";

// Meme convention que RecetteConditionnementFormulaire (page "nouvelle") :
// id negatif = vrac (articles.id inverse), id positif = article MP. Un seul
// picker propose les deux, le composant cote serveur (addRecetteOuVracAction)
// route vers recettes_pf ou articles.vrac_article_id selon le signe.
export function AjouterArticleFormulaire({
  mpOptions,
  vracOptions,
}: {
  mpOptions: { id: number; label: string }[];
  vracOptions: { id: number; label: string }[];
}) {
  const [articleId, setArticleId] = useState<number | null>(null);
  const estVrac = articleId !== null && articleId < 0;

  const combined = [
    ...mpOptions,
    ...vracOptions.map((article) => ({ id: -article.id, label: `${article.label} (vrac)` })),
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
      <ProduitPickerField articles={combined} onSelect={setArticleId} />
      <input
        type="number"
        step="0.001"
        min="0"
        name="quantite"
        placeholder="Quantite"
        required={!estVrac}
        disabled={estVrac}
        title={estVrac ? "Le vrac n'a pas de quantite a saisir ici, elle se calcule automatiquement." : undefined}
        className="w-32 rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none disabled:bg-slate-50"
      />
      <button
        type="submit"
        className="rounded-2xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-500"
      >
        Ajouter
      </button>
    </div>
  );
}
