"use client";

import { useMemo, useState } from "react";

export type CompteOption = { code: string; libelle: string; classe: number };

// Recherche cote client sur la liste complete (2000+ comptes, chargee une
// seule fois par la page) - un <datalist> classique devient illisible/lent
// passe quelques centaines d'options, donc suggestions maison filtrees en
// direct (par prefixe de code OU sous-chaine du libelle), fermees des
// qu'un compte est choisi ou que le champ perd le focus.
export function CompteSearch({
  comptes,
  value,
  onChange,
  placeholder,
}: {
  comptes: CompteOption[];
  value: string;
  onChange: (code: string) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState(() => {
    const found = comptes.find((c) => c.code === value);
    return found ? `${found.code} - ${found.libelle}` : value;
  });
  const [ouvert, setOuvert] = useState(false);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const parQ = comptes.filter(
      (c) => c.code.startsWith(q) || c.libelle.toLowerCase().includes(q)
    );
    return parQ.slice(0, 20);
  }, [comptes, query]);

  function choisir(compte: CompteOption) {
    onChange(compte.code);
    setQuery(`${compte.code} - ${compte.libelle}`);
    setOuvert(false);
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={query}
        placeholder={placeholder || "Code ou nom du compte..."}
        onChange={(event) => {
          setQuery(event.target.value);
          onChange("");
          setOuvert(true);
        }}
        onFocus={() => setOuvert(true)}
        onBlur={() => setTimeout(() => setOuvert(false), 150)}
        className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
      />
      {ouvert && suggestions.length > 0 ? (
        <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-lg">
          {suggestions.map((compte) => (
            <li key={compte.code}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choisir(compte)}
                className="flex w-full flex-col items-start px-4 py-2 text-left text-sm hover:bg-slate-50"
              >
                <span className="font-semibold text-slate-900">{compte.code}</span>
                <span className="text-xs text-slate-600">{compte.libelle}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
