"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// Meme motif que ProduitCell (Programme par ligne) : texte libre qui se
// filtre au fur et a mesure sur la liste complete des articles,
// autoComplete="off" pour ne pas laisser le navigateur proposer ses
// suggestions "deja saisies". article_id part en champ cache a part.
export function ProduitPickerField({
  articles,
  defaultValue = "",
}: {
  articles: { id: number; label: string }[];
  defaultValue?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const [articleId, setArticleId] = useState<number | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const words = value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return articles.slice(0, 50);
    return articles.filter((article) => {
      const label = article.label.toLowerCase();
      return words.every((word) => label.includes(word));
    });
  }, [value, articles]);

  // "article_id" (champ cache) ne participe pas a la validation native du
  // navigateur - sans ca, taper un texte SANS cliquer une suggestion
  // laissait valider le formulaire avec un produit texte jamais relie a un
  // vrai article. setCustomValidity sur le champ VISIBLE force le blocage
  // (avec l'infobulle native, au bon endroit) tant qu'aucune suggestion n'a
  // ete cliquee.
  useEffect(() => {
    if (!inputRef.current) return;
    inputRef.current.setCustomValidity(
      value.trim() && articleId === null ? "Choisis un article dans la liste (clique une suggestion)." : ""
    );
  }, [value, articleId]);

  return (
    <div className="relative">
      <input type="hidden" name="article_id" value={articleId ?? ""} />
      <input
        ref={inputRef}
        type="text"
        name="produit"
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setArticleId(null);
          setShowDropdown(true);
        }}
        onFocus={() => setShowDropdown(true)}
        onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
        placeholder="Ecris puis choisis..."
        autoComplete="off"
        required
        className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
      />
      {showDropdown && filtered.length > 0 ? (
        <div className="absolute left-0 top-full z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.12)]">
          {filtered.map((article) => (
            <button
              key={article.id}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setValue(article.label);
                setArticleId(article.id);
                setShowDropdown(false);
              }}
              className="block w-full px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-100"
            >
              {article.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
