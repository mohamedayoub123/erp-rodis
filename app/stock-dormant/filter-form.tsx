"use client";

import Link from "next/link";
import { SearchableFilterInput } from "@/app/_components/searchable-filter-input";

export function DormantFilterForm({
  defaultArticle,
  defaultGamme,
  defaultCouleur,
  articleOptions,
  gammeOptions,
  couleurOptions,
  allTypeOptions,
  selectedTypes,
}: {
  defaultArticle: string;
  defaultGamme: string;
  defaultCouleur: string;
  articleOptions: { id: number; label: string }[];
  gammeOptions: { id: number; label: string }[];
  couleurOptions: { id: number; label: string }[];
  allTypeOptions: string[];
  selectedTypes: string[];
}) {
  return (
    <form className="grid gap-3 border-b border-slate-100 px-6 py-5 md:grid-cols-[1.2fr_1fr_1fr_auto_auto]">
      <SearchableFilterInput
        name="article"
        placeholder="Ecrire article..."
        defaultValue={defaultArticle}
        options={articleOptions}
      />
      <SearchableFilterInput
        name="gamme"
        placeholder="Ecrire gamme..."
        defaultValue={defaultGamme}
        options={gammeOptions}
      />
      <SearchableFilterInput
        name="couleur"
        placeholder="Filtrer couleur..."
        defaultValue={defaultCouleur}
        options={couleurOptions}
      />
      <button
        type="submit"
        className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
      >
        Filtrer
      </button>
      <Link
        href="/stock-dormant"
        className="rounded-2xl border border-slate-200 px-5 py-3 text-center text-sm font-semibold text-slate-700"
      >
        Effacer
      </Link>

      {allTypeOptions.length > 0 ? (
        <div className="md:col-span-5 flex flex-wrap gap-3">
          {allTypeOptions.map((option) => (
            <label
              key={option}
              className="flex items-center gap-2 rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-700"
            >
              <input
                type="checkbox"
                name="type"
                value={option}
                defaultChecked={selectedTypes.includes(option)}
                className="h-4 w-4"
              />
              {option}
            </label>
          ))}
        </div>
      ) : null}
    </form>
  );
}
