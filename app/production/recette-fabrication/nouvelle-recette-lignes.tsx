"use client";

import { useState } from "react";
import { ProduitPickerField } from "@/app/production/suivi-production/produit-picker-field";

// Plusieurs lignes MP dans un seul formulaire : chaque ligne ecrit sous les
// memes noms de champs ("mp_article_id" / "quantite_ligne"), le serveur les
// relit avec formData.getAll() dans l'ordre du DOM (les deux tableaux se
// correspondent par position).
export function NouvelleRecetteLignes({ articles }: { articles: { id: number; label: string }[] }) {
  const [lignes, setLignes] = useState<number[]>([0]);
  const [nextKey, setNextKey] = useState(1);

  return (
    <div className="grid gap-3">
      {lignes.map((key) => (
        <div key={key} className="grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-start">
          <ProduitPickerField articles={articles} hiddenName="mp_article_id" textName="mp_produit" />
          <input
            type="number"
            step="0.001"
            min="0"
            name="quantite_ligne"
            placeholder="Quantite"
            required
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
          />
          <button
            type="button"
            onClick={() => setLignes((current) => current.filter((item) => item !== key))}
            disabled={lignes.length <= 1}
            className="rounded-2xl border border-red-200 px-4 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Retirer
          </button>
        </div>
      ))}

      <div>
        <button
          type="button"
          onClick={() => {
            setLignes((current) => [...current, nextKey]);
            setNextKey((current) => current + 1);
          }}
          className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400"
        >
          + Ajouter une ligne
        </button>
      </div>
    </div>
  );
}
