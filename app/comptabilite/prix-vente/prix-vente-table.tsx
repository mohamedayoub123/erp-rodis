"use client";

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

// La recherche/pagination se fait cote serveur (voir page.tsx) - seuls les
// articles de la page courante arrivent ici, jamais les ~800 articles finis
// entiers (c'etait la cause reelle de la lenteur : le cout de revient etait
// calcule pour tous, meme jamais affiches).
export function PrixVenteTable({
  rows,
  clients,
  canWrite,
}: {
  rows: ArticlePrixRow[];
  clients: ClientOption[];
  canWrite: boolean;
}) {
  return (
    <div className="grid gap-4">
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
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">
                    Aucun article ne correspond.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
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
    </div>
  );
}
