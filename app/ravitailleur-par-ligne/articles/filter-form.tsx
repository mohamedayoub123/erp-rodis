"use client";

import Link from "next/link";
import { SearchableFilterInput } from "@/app/_components/searchable-filter-input";

export function RavitailleurArticlesFilterForm({
  defaultArticle,
  defaultCode,
  articleOptions,
  codeOptions,
}: {
  defaultArticle: string;
  defaultCode: string;
  articleOptions: { id: number; label: string }[];
  codeOptions: { id: number; label: string }[];
}) {
  return (
    <form className="grid gap-3 border-b border-slate-100 px-6 py-5 lg:grid-cols-[1.2fr_1fr_auto_auto]">
      <SearchableFilterInput
        name="article"
        placeholder="Ecrire article..."
        defaultValue={defaultArticle}
        options={articleOptions}
      />
      <SearchableFilterInput
        name="code"
        placeholder="Ecrire code..."
        defaultValue={defaultCode}
        options={codeOptions}
      />
      <button
        type="submit"
        className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
      >
        Filtrer
      </button>
      <Link
        href="/ravitailleur-par-ligne/articles"
        className="rounded-2xl border border-slate-200 px-5 py-3 text-center text-sm font-semibold text-slate-700"
      >
        Effacer
      </Link>
    </form>
  );
}
