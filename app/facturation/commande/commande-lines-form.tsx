"use client";

import { useState } from "react";
import { ProduitPickerField } from "@/app/production/suivi-production/produit-picker-field";

// Meme motif que TransferOrderLinesForm (app/depots/transfer-order/) :
// lignes dynamiques ajout/retrait, article_id[]/quantite_demandee[]
// (getAll() indexe) - pas de verification de stock a la saisie, le stock
// n'est verifie/pris qu'au FIFO puis reellement sorti qu'a la Livraison,
// bien plus tard dans le cycle.
export function CommandeLinesForm({ articlesPf }: { articlesPf: { id: number; label: string }[] }) {
  const [rowKeys, setRowKeys] = useState<number[]>([0]);
  const [nextKey, setNextKey] = useState(1);

  return (
    <div className="grid gap-3">
      {rowKeys.map((key) => (
        <div key={key} className="grid gap-3 rounded-2xl border border-slate-200 p-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
          <label className="grid gap-1 text-xs font-semibold text-slate-500">
            Article
            <ProduitPickerField articles={articlesPf} hiddenName="article_id" textName="produit" />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-500">
            Quantite demandee
            <input
              type="number"
              step="0.001"
              min="0"
              name="quantite_demandee"
              required
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            />
          </label>
          {rowKeys.length > 1 ? (
            <button
              type="button"
              onClick={() => setRowKeys(rowKeys.filter((k) => k !== key))}
              className="rounded-full border border-red-200 px-4 py-3 text-xs font-semibold text-red-700 transition hover:bg-red-50"
            >
              Retirer
            </button>
          ) : null}
        </div>
      ))}
      <div>
        <button
          type="button"
          onClick={() => {
            setRowKeys([...rowKeys, nextKey]);
            setNextKey(nextKey + 1);
          }}
          className="rounded-full border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400"
        >
          + Ajouter un article
        </button>
      </div>
    </div>
  );
}
