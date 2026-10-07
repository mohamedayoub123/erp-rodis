"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { matchesArticleSearch } from "@/lib/article-search";

// Filtre a choix multiples pour un formulaire GET (Categorie, Sous famille...) : un bouton qui ouvre une
// liste a cocher avec recherche. Chaque valeur cochee est envoyee sous le meme nom (?categorie=A&categorie=B),
// y compris celles que la recherche masque momentanement. Rien n'est envoye tant que rien n'est coche.
export function MultiSelectFilter({
  name,
  placeholder,
  options,
  selected,
}: {
  name: string;
  placeholder: string;
  options: string[];
  selected: string[];
}) {
  const [choisis, setChoisis] = useState<string[]>(selected);
  const [ouvert, setOuvert] = useState(false);
  const [recherche, setRecherche] = useState("");
  const conteneur = useRef<HTMLDivElement>(null);

  // Ferme la liste en cliquant ailleurs ou avec Echap.
  useEffect(() => {
    if (!ouvert) return;

    function fermerSiClicExterieur(event: MouseEvent) {
      if (conteneur.current && !conteneur.current.contains(event.target as Node)) setOuvert(false);
    }
    function fermerSiEchap(event: KeyboardEvent) {
      if (event.key === "Escape") setOuvert(false);
    }

    document.addEventListener("mousedown", fermerSiClicExterieur);
    document.addEventListener("keydown", fermerSiEchap);
    return () => {
      document.removeEventListener("mousedown", fermerSiClicExterieur);
      document.removeEventListener("keydown", fermerSiEchap);
    };
  }, [ouvert]);

  const visibles = useMemo(() => {
    const requete = recherche.trim();
    return requete ? options.filter((option) => matchesArticleSearch(option, requete)) : options;
  }, [recherche, options]);

  function basculer(valeur: string) {
    setChoisis((courant) => (courant.includes(valeur) ? courant.filter((v) => v !== valeur) : [...courant, valeur]));
  }

  function toutCocherVisibles() {
    setChoisis((courant) => [...new Set([...courant, ...visibles])]);
  }

  const libelle =
    choisis.length === 0 ? placeholder : choisis.length === 1 ? choisis[0] : `${placeholder} (${choisis.length})`;

  return (
    <div ref={conteneur} className="relative">
      {choisis.map((valeur) => (
        <input key={valeur} type="hidden" name={name} value={valeur} />
      ))}

      <button
        type="button"
        onClick={() => setOuvert((courant) => !courant)}
        aria-expanded={ouvert}
        className={`flex w-full items-center justify-between gap-2 rounded-2xl border px-4 py-3 text-left text-sm outline-none ${
          choisis.length > 0
            ? "border-sky-300 bg-sky-50 font-semibold text-sky-900"
            : "border-slate-200 bg-white text-slate-500"
        }`}
      >
        <span className="truncate">{libelle}</span>
        <span aria-hidden="true" className="shrink-0 text-xs">
          {ouvert ? "▲" : "▼"}
        </span>
      </button>

      {ouvert ? (
        <div className="absolute left-0 top-full z-50 mt-1 w-full min-w-[18rem] rounded-2xl border border-slate-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.12)]">
          <div className="space-y-2 border-b border-slate-100 p-3">
            <input
              type="text"
              value={recherche}
              onChange={(event) => setRecherche(event.target.value)}
              onKeyDown={(event) => {
                // Entree ne doit pas envoyer le formulaire pendant la recherche.
                if (event.key === "Enter") event.preventDefault();
              }}
              placeholder="Rechercher..."
              autoComplete="off"
              autoFocus
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
            />
            <div className="flex items-center justify-between text-xs font-semibold">
              <button type="button" onClick={toutCocherVisibles} className="text-sky-700 hover:underline">
                Tout cocher{recherche.trim() ? " (resultats)" : ""}
              </button>
              <button
                type="button"
                onClick={() => setChoisis([])}
                disabled={choisis.length === 0}
                className="text-slate-600 hover:underline disabled:cursor-default disabled:text-slate-300 disabled:no-underline"
              >
                Tout decocher
              </button>
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto py-1">
            {visibles.length === 0 ? (
              <p className="px-4 py-3 text-sm text-slate-500">Aucun resultat.</p>
            ) : (
              visibles.map((option) => (
                <label
                  key={option}
                  className="flex cursor-pointer items-center gap-3 px-4 py-2 text-sm text-slate-800 hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={choisis.includes(option)}
                    onChange={() => basculer(option)}
                    className="h-4 w-4 shrink-0"
                  />
                  <span>{option}</span>
                </label>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
