"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Meme motif que ProduitCell (Programme par ligne) : texte libre qui se
// filtre au fur et a mesure sur la liste complete des articles,
// autoComplete="off" pour ne pas laisser le navigateur proposer ses
// suggestions "deja saisies". article_id part en champ cache a part.
//
// La liste de suggestions part en portail (document.body) positionnee en
// "fixed" via getBoundingClientRect du champ, au lieu d'un simple
// "absolute" dans le flux normal : ce champ est parfois utilise dans une
// cellule de tableau entouree d'un conteneur "overflow-x-auto" (ex:
// Programme), qui coupe tout ce qui deborde verticalement - un dropdown
// "absolute" y serait invisible.
export function ProduitPickerField({
  articles,
  defaultValue = "",
  defaultArticleId = null,
  hiddenName = "article_id",
  textName = "produit",
  onSelect,
}: {
  articles: { id: number; label: string }[];
  defaultValue?: string;
  defaultArticleId?: number | null;
  hiddenName?: string;
  textName?: string;
  onSelect?: (articleId: number | null, label?: string) => void;
}) {
  const [value, setValue] = useState(defaultValue);
  const [articleId, setArticleId] = useState<number | null>(defaultArticleId);
  const [showDropdown, setShowDropdown] = useState(false);
  const [dropdownRect, setDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const [rawHighlightedIndex, setRawHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  // Liste vide tant que rien n'est tape - ne propose pas d'articles au
  // hasard juste en cliquant dans le champ, seulement une fois qu'on
  // cherche vraiment quelque chose.
  const filtered = useMemo(() => {
    const words = value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return [];
    return articles.filter((article) => {
      const label = article.label.toLowerCase();
      return words.every((word) => label.includes(word));
    });
  }, [value, articles]);

  // La liste filtree change a chaque frappe - un index qui reste sur une
  // ancienne position (potentiellement hors bornes de la nouvelle liste, ou
  // pointant sur un tout autre article) preterait a confusion. Valeur
  // derivee au rendu (pas un effet+setState) : hors bornes -> -1 (rien en
  // surbrillance) sans avoir a re-render exprès pour ca.
  const highlightedIndex = rawHighlightedIndex < filtered.length ? rawHighlightedIndex : -1;

  function selectArticle(article: { id: number; label: string }) {
    setValue(article.label);
    setArticleId(article.id);
    setShowDropdown(false);
    onSelect?.(article.id, article.label);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!showDropdown || filtered.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setRawHighlightedIndex((highlightedIndex + 1) % filtered.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setRawHighlightedIndex(highlightedIndex <= 0 ? filtered.length - 1 : highlightedIndex - 1);
    } else if (event.key === "Enter" && highlightedIndex >= 0) {
      event.preventDefault();
      selectArticle(filtered[highlightedIndex]);
    } else if (event.key === "Escape") {
      setShowDropdown(false);
    }
  }

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

  useEffect(() => {
    if (!showDropdown) return;

    function updatePosition() {
      if (!inputRef.current) return;
      const rect = inputRef.current.getBoundingClientRect();
      setDropdownRect({ top: rect.bottom, left: rect.left, width: rect.width });
    }

    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [showDropdown]);

  return (
    <div className="relative">
      <input type="hidden" name={hiddenName} value={articleId ?? ""} />
      <input
        ref={inputRef}
        type="text"
        name={textName}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setArticleId(null);
          setShowDropdown(true);
          onSelect?.(null);
        }}
        onFocus={() => setShowDropdown(true)}
        onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
        onKeyDown={handleKeyDown}
        placeholder="Ecris puis choisis..."
        autoComplete="off"
        required
        className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
      />
      {showDropdown && filtered.length > 0 && dropdownRect
        ? createPortal(
            <div
              style={{ top: dropdownRect.top, left: dropdownRect.left, width: dropdownRect.width }}
              className="fixed z-50 mt-1 max-h-64 overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.12)]"
            >
              {filtered.map((article, index) => (
                <button
                  key={article.id}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setRawHighlightedIndex(index)}
                  onClick={() => selectArticle(article)}
                  className={`block w-full px-3 py-2 text-left text-sm ${
                    index === highlightedIndex ? "bg-sky-100 text-sky-900" : "text-slate-800 hover:bg-slate-100"
                  }`}
                >
                  {article.label}
                </button>
              ))}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
