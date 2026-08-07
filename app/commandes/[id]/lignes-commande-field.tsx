"use client";

import { useMemo, useState } from "react";
import { matchesArticleSearch } from "@/lib/article-search";

type ArticleOption = { value: string; label: string };

// Le formulaire "Modifier cette commande" attend une ligne par produit,
// texte libre "Nom article | Quantite" (voir parseLines cote serveur) -
// jusqu'ici il fallait taper le nom EXACT a la main pour ajouter un
// produit. Garde le meme format texte (aucun changement cote serveur) mais
// ajoute un picker qui l'ecrit a la bonne place, pour ne plus avoir a
// retaper un nom d'article de memoire.
export function LignesCommandeField({
  articles,
  defaultValue,
}: {
  articles: ArticleOption[];
  defaultValue: string;
}) {
  const [lignesValue, setLignesValue] = useState(defaultValue);
  const [articleInput, setArticleInput] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [quantite, setQuantite] = useState("");

  const selectedArticle = useMemo(
    () => articles.find((article) => article.label === articleInput) ?? null,
    [articleInput, articles]
  );

  const filteredArticles = useMemo(() => {
    if (!articleInput.trim()) return articles.slice(0, 50);
    return articles.filter((article) => matchesArticleSearch(article.label, articleInput));
  }, [articleInput, articles]);

  function addLigne() {
    const qty = Number(quantite.replace(",", "."));
    if (!selectedArticle || !qty || qty <= 0) return;

    setLignesValue((current) => {
      const trimmed = current.replace(/\s+$/, "");
      return `${trimmed}${trimmed ? "\n" : ""}${selectedArticle.label} | ${qty}`;
    });

    setArticleInput("");
    setQuantite("");
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
        <label className="relative grid gap-1 text-xs font-semibold text-slate-500">
          Ajouter un produit
          <input
            value={articleInput}
            onChange={(event) => {
              setArticleInput(event.target.value);
              setShowDropdown(true);
            }}
            onFocus={() => setShowDropdown(true)}
            onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
            placeholder="Ecris puis choisis..."
            autoComplete="off"
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal outline-none"
          />
          {showDropdown && filteredArticles.length > 0 ? (
            <div className="absolute left-0 top-full z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.12)]">
              {filteredArticles.map((article) => (
                <button
                  key={article.value}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setArticleInput(article.label);
                    setShowDropdown(false);
                  }}
                  className="block w-full px-4 py-2 text-left text-sm text-slate-800 hover:bg-slate-100"
                >
                  {article.label}
                </button>
              ))}
            </div>
          ) : null}
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate-500">
          Quantite
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={quantite}
            onChange={(event) => setQuantite(event.target.value)}
            className="w-28 rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
          />
        </label>
        <div className="flex items-end">
          <button
            type="button"
            onClick={addLigne}
            disabled={!selectedArticle || !quantite}
            className="rounded-full bg-sky-700 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Ajouter a la liste
          </button>
        </div>
      </div>

      <textarea
        name="lignes"
        rows={8}
        value={lignesValue}
        onChange={(event) => setLignesValue(event.target.value)}
        className="rounded-[1.5rem] border border-slate-200 px-4 py-4 text-sm outline-none"
        required
      />
    </div>
  );
}
