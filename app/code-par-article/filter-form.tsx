"use client";

import Link from "next/link";
import { SearchableFilterInput } from "@/app/_components/searchable-filter-input";

export function CodeParArticleFilterForm({
  defaultArticle,
  defaultGamme,
  defaultCodeAuto,
  defaultCodeManu,
  articleOptions,
  gammeOptions,
  codeAutoOptions,
  codeManuOptions,
}: {
  defaultArticle: string;
  defaultGamme: string;
  defaultCodeAuto: string;
  defaultCodeManu: string;
  articleOptions: { id: number; label: string }[];
  gammeOptions: { id: number; label: string }[];
  codeAutoOptions: { id: number; label: string }[];
  codeManuOptions: { id: number; label: string }[];
}) {
  return (
    <form className="grid gap-3 border-b border-slate-100 px-6 py-5 lg:grid-cols-[1.2fr_1fr_1fr_1fr_auto_auto]">
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
        name="code_auto"
        placeholder="Ecrire code auto..."
        defaultValue={defaultCodeAuto}
        options={codeAutoOptions}
      />
      <SearchableFilterInput
        name="code_manu"
        placeholder="Ecrire code manuel..."
        defaultValue={defaultCodeManu}
        options={codeManuOptions}
      />
      <button
        type="submit"
        className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
      >
        Filtrer
      </button>
      <Link
        href="/code-par-article"
        className="rounded-2xl border border-slate-200 px-5 py-3 text-center text-sm font-semibold text-slate-700"
      >
        Effacer
      </Link>
    </form>
  );
}
