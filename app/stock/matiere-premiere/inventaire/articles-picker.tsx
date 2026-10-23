"use client";

import { useMemo, useState } from "react";
import { matchesArticleSearch } from "@/lib/article-search";

type ArticleOption = { id: number; label: string; lots: number };

const MAX_RESULTATS = 30;

// Choix d'articles precis pour un inventaire MP : on tape une partie du nom, on clique sur l'article pour
// l'ajouter, il apparait en pastille (cliquer dessus le retire). Chaque article choisi part avec le formulaire
// (champ "article_id").
export function ArticlesPicker({ options }: { options: ArticleOption[] }) {
  const [recherche, setRecherche] = useState("");
  const [choisis, setChoisis] = useState<number[]>([]);

  const parId = useMemo(() => new Map(options.map((option) => [option.id, option])), [options]);
  const choisisSet = useMemo(() => new Set(choisis), [choisis]);

  const resultats = useMemo(() => {
    const texte = recherche.trim();
    if (!texte) return [];
    return options.filter((option) => !choisisSet.has(option.id) && matchesArticleSearch(option.label, texte));
  }, [recherche, options, choisisSet]);

  const totalLots = choisis.reduce((somme, id) => somme + (parId.get(id)?.lots ?? 0), 0);

  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-slate-700">
        Articles precis (optionnel) - tape le nom d&apos;un article, clique dessus pour l&apos;ajouter
      </p>
      <input
        type="text"
        value={recherche}
        onChange={(event) => setRecherche(event.target.value)}
        onKeyDown={(event) => {
          // Entree dans la recherche ne doit pas lancer l'inventaire : elle ajoute le 1er resultat.
          if (event.key !== "Enter") return;
          event.preventDefault();
          const premier = resultats[0];
          if (premier) {
            setChoisis((courant) => [...courant, premier.id]);
            setRecherche("");
          }
        }}
        placeholder="Rechercher un article (ex: alcool, parfum...)"
        className="w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />

      {recherche.trim() ? (
        <div className="mt-2 max-h-64 max-w-md overflow-auto rounded-lg border border-slate-200 bg-white">
          {resultats.length === 0 ? (
            <p className="px-3 py-2 text-sm text-slate-500">Aucun article en stock ne correspond.</p>
          ) : (
            resultats.slice(0, MAX_RESULTATS).map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  setChoisis((courant) => [...courant, option.id]);
                  setRecherche("");
                }}
                className="flex w-full items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-emerald-50"
              >
                <span>{option.label}</span>
                <span className="shrink-0 text-slate-400">
                  {option.lots} lot{option.lots > 1 ? "s" : ""}
                </span>
              </button>
            ))
          )}
          {resultats.length > MAX_RESULTATS ? (
            <p className="px-3 py-2 text-xs text-slate-500">
              {resultats.length - MAX_RESULTATS} autre(s) resultat(s) - precise la recherche.
            </p>
          ) : null}
        </div>
      ) : null}

      {choisis.length > 0 ? (
        <div className="mt-3">
          <div className="flex flex-wrap gap-2">
            {choisis.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setChoisis((courant) => courant.filter((autre) => autre !== id))}
                title="Retirer cet article"
                className="flex items-center gap-2 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-900 hover:bg-emerald-100"
              >
                {parId.get(id)?.label ?? `Article ${id}`}
                <span className="font-bold text-emerald-700">×</span>
              </button>
            ))}
          </div>
          {choisis.map((id) => (
            <input key={`champ-${id}`} type="hidden" name="article_id" value={id} />
          ))}
          <p className="mt-2 text-sm text-slate-600">
            {choisis.length} article{choisis.length > 1 ? "s" : ""} choisi{choisis.length > 1 ? "s" : ""} -{" "}
            {totalLots} lot{totalLots > 1 ? "s" : ""} a compter. L&apos;inventaire ne portera que sur eux.
          </p>
        </div>
      ) : null}
    </div>
  );
}
