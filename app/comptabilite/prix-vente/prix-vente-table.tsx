"use client";

import { useMemo, useState } from "react";
import { matchesArticleSearch } from "@/lib/article-search";
import { PrixVenteRow, type ClientOption, type Special } from "./prix-vente-row";

export type ArticlePrixRow = {
  articleId: number;
  nomArticle: string;
  code: string;
  coutParCarton: number | null;
  prixVente: number | null;
  speciaux: Special[];
};

export type { ClientOption };

export function PrixVenteTable({
  rows,
  clients,
  canWrite,
}: {
  rows: ArticlePrixRow[];
  clients: ClientOption[];
  canWrite: boolean;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return rows;
    return rows.filter((r) => matchesArticleSearch(r.nomArticle, trimmed) || r.code.toLowerCase().includes(trimmed.toLowerCase()));
  }, [rows, query]);

  return (
    <div className="grid gap-4">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Ecrire un article ou un code..."
        className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
      />

      <div className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Article</th>
                <th className="px-4 py-3 font-semibold">Prix de revient</th>
                <th className="px-4 py-3 font-semibold">Prix de vente</th>
                <th className="px-4 py-3 font-semibold">Marge</th>
                <th className="px-4 py-3 font-semibold">Prix clients speciaux</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">
                    Aucun article ne correspond.
                  </td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <PrixVenteRow
                    key={row.articleId}
                    articleId={row.articleId}
                    nomArticle={row.nomArticle}
                    code={row.code}
                    coutParCarton={row.coutParCarton}
                    prixVente={row.prixVente}
                    speciaux={row.speciaux}
                    clients={clients}
                    canWrite={canWrite}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-slate-500">
        {filtered.length.toLocaleString("fr-FR")} article(s) affiche(s) sur {rows.length.toLocaleString("fr-FR")}.
      </p>
    </div>
  );
}
