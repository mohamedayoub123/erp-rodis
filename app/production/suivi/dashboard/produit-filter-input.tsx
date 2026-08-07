"use client";

import { useMemo, useState } from "react";

// Meme motif que ProduitCell (Programme par ligne) : autoComplete="off" pour
// ne pas laisser le navigateur proposer ses propres suggestions "deja
// saisies", remplace par un menu qui liste tous les articles et se filtre
// au fur et a mesure de la saisie.
export function ProduitFilterInput({
  name,
  defaultValue,
  articles,
  placeholder,
}: {
  name: string;
  defaultValue: string;
  articles: { id: number; label: string }[];
  placeholder: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const [showDropdown, setShowDropdown] = useState(false);

  const filtered = useMemo(() => {
    const words = value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return articles.slice(0, 50);

    return articles.filter((article) => {
      const label = article.label.toLowerCase();
      return words.every((word) => label.includes(word));
    });
  }, [value, articles]);

  return (
    <div className="relative">
      <input
        type="text"
        name={name}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setShowDropdown(true);
        }}
        onFocus={() => setShowDropdown(true)}
        onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
      />
      {showDropdown && filtered.length > 0 ? (
        <div className="absolute left-0 top-full z-50 mt-1 max-h-64 w-full min-w-[16rem] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.12)]">
          {filtered.map((article) => (
            <button
              key={article.id}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setValue(article.label);
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
