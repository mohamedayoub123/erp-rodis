"use client";

import { useEffect, useRef, useState } from "react";
import { ProduitPickerField } from "@/app/production/suivi-production/produit-picker-field";

type Ligne = {
  key: number;
  articleId: number | null;
  quantite: string;
  pourcent: string;
};

function round(value: number, decimals = 3) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

// Quantite totale du lot (kg de vrac produit / nb de cartons produits) +
// lignes MP dont Quantite et % sont relies : changer l'un recalcule l'autre
// a partir de ce total. La quantite est toujours ce qui part au serveur
// (name="quantite_ligne") - le % n'est qu'une aide de saisie cote client,
// jamais stocke tel quel.
export function NouvelleRecetteLignes({
  articles,
  uniteBase,
  quantiteBaseName = "quantite_recette_base",
  defaultQuantiteBase,
}: {
  articles: { id: number; label: string }[];
  uniteBase: string;
  quantiteBaseName?: string;
  defaultQuantiteBase?: number | null;
}) {
  const [quantiteTotale, setQuantiteTotale] = useState(
    defaultQuantiteBase !== null && defaultQuantiteBase !== undefined ? String(defaultQuantiteBase) : ""
  );
  const [lignes, setLignes] = useState<Ligne[]>([{ key: 0, articleId: null, quantite: "", pourcent: "" }]);
  const nextKey = useRef(1);

  // Si le total change, on recalcule les % a partir des quantites deja
  // saisies (la quantite reste la valeur de reference, le % suit).
  useEffect(() => {
    const total = Number(quantiteTotale);
    if (!total || Number.isNaN(total)) return;
    setLignes((current) =>
      current.map((ligne) => {
        const q = Number(ligne.quantite);
        if (!ligne.quantite || Number.isNaN(q)) return ligne;
        return { ...ligne, pourcent: String(round((q / total) * 100, 2)) };
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quantiteTotale]);

  function updateQuantite(key: number, rawQuantite: string) {
    const total = Number(quantiteTotale);
    const q = Number(rawQuantite);
    const pourcent = total > 0 && rawQuantite && !Number.isNaN(q) ? String(round((q / total) * 100, 2)) : "";
    setLignes((current) =>
      current.map((ligne) => (ligne.key === key ? { ...ligne, quantite: rawQuantite, pourcent } : ligne))
    );
  }

  function updatePourcent(key: number, rawPourcent: string) {
    const total = Number(quantiteTotale);
    const p = Number(rawPourcent);
    const quantite = total > 0 && rawPourcent && !Number.isNaN(p) ? String(round((p / 100) * total, 3)) : "";
    setLignes((current) =>
      current.map((ligne) => (ligne.key === key ? { ...ligne, pourcent: rawPourcent, quantite } : ligne))
    );
  }

  function updateArticleId(key: number, articleId: number | null) {
    setLignes((current) => current.map((ligne) => (ligne.key === key ? { ...ligne, articleId } : ligne)));
  }

  return (
    <div className="grid gap-4">
      <label className="grid gap-1 text-xs font-semibold text-slate-500">
        Quantite totale du lot ({uniteBase})
        <input
          type="number"
          step="0.001"
          min="0"
          name={quantiteBaseName}
          value={quantiteTotale}
          onChange={(event) => setQuantiteTotale(event.target.value)}
          placeholder={`Ex: 100 ${uniteBase}`}
          className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
        />
      </label>

      <div className="grid gap-3">
        {lignes.map((ligne) => {
          // Un article deja choisi sur une autre ligne ne doit plus pouvoir
          // etre repris sur celle-ci (evite les doublons dans la meme
          // recette) - sa propre selection reste visible.
          const articlesDisponibles = articles.filter(
            (article) => article.id === ligne.articleId || !lignes.some((autre) => autre.key !== ligne.key && autre.articleId === article.id)
          );
          return (
          <div key={ligne.key} className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto] sm:items-start">
            <ProduitPickerField
              articles={articlesDisponibles}
              hiddenName="mp_article_id"
              textName="mp_produit"
              onSelect={(articleId) => updateArticleId(ligne.key, articleId)}
            />
            <input
              type="number"
              step="0.001"
              min="0"
              name="quantite_ligne"
              value={ligne.quantite}
              onChange={(event) => updateQuantite(ligne.key, event.target.value)}
              placeholder="Quantite"
              required
              className="w-32 rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            />
            <input
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={ligne.pourcent}
              onChange={(event) => updatePourcent(ligne.key, event.target.value)}
              placeholder="%"
              className="w-24 rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            />
            <button
              type="button"
              onClick={() => setLignes((current) => current.filter((item) => item.key !== ligne.key))}
              disabled={lignes.length <= 1}
              className="rounded-2xl border border-red-200 px-4 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Retirer
            </button>
          </div>
          );
        })}
      </div>

      <div>
        <button
          type="button"
          onClick={() => {
            setLignes((current) => [
              ...current,
              { key: nextKey.current, articleId: null, quantite: "", pourcent: "" },
            ]);
            nextKey.current += 1;
          }}
          className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400"
        >
          + Ajouter une ligne
        </button>
      </div>
    </div>
  );
}
