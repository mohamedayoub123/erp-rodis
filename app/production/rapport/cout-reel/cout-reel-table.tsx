"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { matchesArticleSearch } from "@/lib/article-search";

export type CoutReelArticleRow = {
  articleId: number;
  code: string;
  nomArticle: string;
  quantite: number;
  coutTotal: number;
  venteTotale: number | null;
  marge: number | null;
  // Sert uniquement au tri cote serveur (meme organisation que la page
  // Articles Produit Fini) - jamais affiche directement ici.
  _gamme?: string | null;
};

function formatFcfa(value: number | null) {
  if (value === null) return "-";
  return `${value.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} FCFA`;
}

// Filtrage EN DIRECT (pas de rechargement de page) - les couts sont deja
// tous calcules cote serveur, ce composant ne fait que montrer/cacher les
// lignes selon le texte tape, comme ArticlesProduitFiniTable.
export function CoutReelTable({ rows }: { rows: CoutReelArticleRow[] }) {
  const [query, setQuery] = useState("");
  const router = useRouter();

  const filteredRows = useMemo(
    () =>
      rows.filter(
        (row) => matchesArticleSearch(row.nomArticle, query) || matchesArticleSearch(row.code, query)
      ),
    [rows, query]
  );

  return (
    <>
      <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filtrer par nom ou code..."
          className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
        />
      </section>

      <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
        <div className="max-h-[75vh] overflow-auto">
          <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="sticky top-0 z-10 bg-slate-50 px-6 py-3 font-semibold">Article</th>
                <th className="sticky top-0 z-10 bg-slate-50 px-6 py-3 font-semibold">Qte fabriquee (cartons)</th>
                <th className="sticky top-0 z-10 bg-slate-50 px-6 py-3 font-semibold">Cout</th>
                <th className="sticky top-0 z-10 bg-slate-50 px-6 py-3 font-semibold">Vente</th>
                <th className="sticky top-0 z-10 bg-slate-50 px-6 py-3 font-semibold">Marge</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-6 text-center text-sm text-slate-500">
                    Aucun article ne correspond a &quot;{query}&quot;.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr
                    key={row.articleId}
                    onClick={() => router.push(`/production/rapport/cout-reel/${row.articleId}`)}
                    className="cursor-pointer border-t border-slate-100 transition hover:bg-sky-50/60"
                  >
                    <td className="px-6 py-3 font-semibold text-slate-900">
                      {row.code !== "-" ? `${row.code} - ` : ""}
                      {row.nomArticle}
                    </td>
                    <td className="px-6 py-3 text-slate-600">{row.quantite.toLocaleString("fr-FR")}</td>
                    <td className="px-6 py-3 text-slate-600">{formatFcfa(row.coutTotal)}</td>
                    <td className="px-6 py-3 text-slate-600">{formatFcfa(row.venteTotale)}</td>
                    <td
                      className={`px-6 py-3 font-semibold ${
                        row.marge !== null && row.marge < 0 ? "text-red-600" : "text-emerald-700"
                      }`}
                    >
                      {formatFcfa(row.marge)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
