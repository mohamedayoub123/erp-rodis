"use client";

import { useMemo, useRef, useState } from "react";
import { matchesArticleSearch } from "@/lib/article-search";

// Meme motif que ProduitCell (Programme par ligne) : autoComplete="off" pour
// ne pas laisser le navigateur proposer ses propres suggestions "deja
// saisies", remplace par un menu qui liste toutes les options et se filtre
// au fur et a mesure de la saisie. Fleches haut/bas pour deplacer la
// selection dans la liste, Entree pour choisir l'option en surbrillance
// (par defaut la premiere) - la meme selection reste possible a la souris.
export function SearchableFilterInput({
  name,
  defaultValue,
  options,
  placeholder,
}: {
  name: string;
  defaultValue: string;
  options: { id: number; label: string }[];
  placeholder: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const query = value.trim().toLowerCase();
    if (!query) return options.slice(0, 50);
    return options.filter((option) => matchesArticleSearch(option.label, query));
  }, [value, options]);

  function selectOption(label: string) {
    setValue(label);
    setShowDropdown(false);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!showDropdown || filtered.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightIndex((i) => (i + 1) % filtered.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightIndex((i) => (i - 1 + filtered.length) % filtered.length);
    } else if (event.key === "Enter") {
      // Choisit l'option en surbrillance (ou la premiere par defaut) plutot
      // que de soumettre tout de suite le formulaire avec un texte tape a
      // moitie - une seconde pression sur Entree (dropdown deja ferme)
      // soumet normalement.
      event.preventDefault();
      selectOption(filtered[highlightIndex]?.label ?? filtered[0].label);
    } else if (event.key === "Escape") {
      setShowDropdown(false);
    }
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        name={name}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setShowDropdown(true);
          setHighlightIndex(0);
        }}
        onKeyDown={handleKeyDown}
        onFocus={() => setShowDropdown(true)}
        onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
      />
      {showDropdown && filtered.length > 0 ? (
        <div className="absolute left-0 top-full z-50 mt-1 max-h-64 w-full min-w-[16rem] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.12)]">
          {filtered.map((option, index) => (
            <button
              key={option.id}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setHighlightIndex(index)}
              onClick={() => selectOption(option.label)}
              className={`block w-full px-3 py-2 text-left text-sm ${
                index === highlightIndex ? "bg-sky-50 text-sky-900" : "text-slate-800 hover:bg-slate-100"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
