import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { SearchableFilterInput } from "@/app/_components/searchable-filter-input";
import { matchesArticleSearch } from "@/lib/article-search";
import { computeStockByArticleDepot, stockKey } from "@/lib/depot-stock";

const PAGE_SIZE = 100;

type DepotRow = { id: number; nom: string };
type ArticlePfRow = { id: number; nom_article: string; nature: string | null; depot_id: number | null };
type ArticleMpRow = { id: number; nom_article: string; depot_id: number | null };
type LotRow = { article_id: number | null; qte_entree: number; qte_sortie: number; depot_id: number | null };

type ProduitRow = {
  type: "PF" | "MP";
  id: number;
  nom: string;
  typeLabel: string;
};

async function fetchAll<T>(table: string, select: string) {
  const rows: T[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer.from(table).select(select).range(from, from + pageSize - 1);
    if (error) return { rows, error };
    rows.push(...((data ?? []) as T[]));
    if ((data ?? []).length < pageSize) break;
    from += pageSize;
  }

  return { rows, error: null };
}

function formatNumber(value: number) {
  return value.toLocaleString("fr-FR", { maximumFractionDigits: 3 });
}

type SearchParams = Promise<{ page?: string; q?: string; type?: string }>;

export default async function ProduitListPage({ searchParams }: { searchParams: SearchParams }) {
  noStore();
  const params = await searchParams;
  const currentPage = Math.max(1, Number(params.page || "1") || 1);
  const q = (params.q || "").trim();
  const typeFilter = (params.type || "").trim();

  const [{ rows: depots }, { rows: articlesPf }, { rows: articlesMp }, { rows: lotsPf }, { rows: lotsMp }] =
    await Promise.all([
      fetchAll<DepotRow>("depots", "id, nom"),
      fetchAll<ArticlePfRow>("articles", "id, nom_article, nature, depot_id"),
      fetchAll<ArticleMpRow>("articles_matiere_premiere", "id, nom_article, depot_id"),
      fetchAll<LotRow>("lots_stock", "article_id, qte_entree, qte_sortie, depot_id"),
      fetchAll<LotRow>("lots_stock_matiere_premiere", "article_id, qte_entree, qte_sortie, depot_id"),
    ]);

  const sortedDepots = [...depots].sort((a, b) => a.nom.localeCompare(b.nom, "fr", { sensitivity: "base" }));

  const defaultDepotByPfId = new Map(articlesPf.map((a) => [a.id, a.depot_id]));
  const defaultDepotByMpId = new Map(articlesMp.map((a) => [a.id, a.depot_id]));
  const stockPfMap = computeStockByArticleDepot(lotsPf, defaultDepotByPfId);
  const stockMpMap = computeStockByArticleDepot(lotsMp, defaultDepotByMpId);

  const allRows: ProduitRow[] = [
    ...articlesPf.map((a) => ({
      type: "PF" as const,
      id: a.id,
      nom: a.nom_article,
      typeLabel: a.nature === "vrac" ? "Vrac" : "Fini",
    })),
    ...articlesMp.map((a) => ({ type: "MP" as const, id: a.id, nom: a.nom_article, typeLabel: "MP" })),
  ];

  const qLower = q.toLowerCase();
  const filteredRows = allRows.filter((row) => {
    if (qLower && !matchesArticleSearch(row.nom, qLower)) return false;
    if (typeFilter && row.typeLabel !== typeFilter) return false;
    return true;
  });

  const sortedRows = [...filteredRows].sort((a, b) => a.nom.localeCompare(b.nom, "fr", { sensitivity: "base" }));

  const totalRows = sortedRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const from = (currentPage - 1) * PAGE_SIZE;
  const pageRows = sortedRows.slice(from, from + PAGE_SIZE);

  const qsFor = (page: number) =>
    `?page=${page}&q=${encodeURIComponent(q)}&type=${encodeURIComponent(typeFilter)}`;

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">
                ERP Rodis
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Produit</h1>
              <p className="mt-2 text-sm text-slate-600">
                Tous les articles (Fini, Vrac, Matiere premiere) avec le stock reel dans chaque
                depot. Clique un article pour voir le detail et les statistiques de mouvement.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <BackButton href="/" label="Retour accueil" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <form className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
            <SearchableFilterInput
              name="q"
              defaultValue={q}
              options={allRows.map((row, index) => ({ id: index, label: row.nom }))}
              placeholder="Rechercher un article..."
            />
            <select
              name="type"
              defaultValue={typeFilter}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            >
              <option value="">Tous les types</option>
              <option value="Fini">Fini</option>
              <option value="Vrac">Vrac</option>
              <option value="MP">MP</option>
            </select>
            <button
              type="submit"
              className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Filtrer
            </button>
          </form>
        </section>

        <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          {pageRows.length === 0 ? (
            <div className="px-6 py-8 text-sm text-slate-500">Aucun article trouve pour le moment.</div>
          ) : (
            <>
              <div className="max-h-[75vh] overflow-auto">
                <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
                  <thead className="bg-slate-50 text-slate-950">
                    <tr>
                      <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Article</th>
                      <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Type</th>
                      {sortedDepots.map((depot) => (
                        <th key={depot.id} className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">
                          Stock {depot.nom}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((row) => {
                      const stockMap = row.type === "PF" ? stockPfMap : stockMpMap;
                      return (
                        <tr key={`${row.type}-${row.id}`} className="border-t border-slate-100">
                          <td className="px-6 py-4 font-medium text-slate-900">
                            <Link
                              href={`/produit/${row.type.toLowerCase()}/${row.id}`}
                              className="text-sky-700 underline"
                            >
                              {row.nom}
                            </Link>
                          </td>
                          <td className="px-6 py-4 text-slate-600">{row.typeLabel}</td>
                          {sortedDepots.map((depot) => (
                            <td key={depot.id} className="px-6 py-4 text-slate-600">
                              {formatNumber(stockMap.get(stockKey(row.id, depot.id)) ?? 0)}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4 text-sm">
                <p className="text-slate-500">
                  Lignes {from + 1} a {Math.min(from + PAGE_SIZE, totalRows)} sur {totalRows}
                </p>

                <div className="flex gap-3">
                  <Link
                    href={qsFor(1)}
                    className={`rounded-full px-4 py-2 font-semibold ${
                      currentPage === 1
                        ? "pointer-events-none bg-slate-100 text-slate-400"
                        : "bg-white text-slate-900 ring-1 ring-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    Premiere
                  </Link>
                  <Link
                    href={qsFor(Math.max(1, currentPage - 1))}
                    className={`rounded-full px-4 py-2 font-semibold ${
                      currentPage === 1
                        ? "pointer-events-none bg-slate-100 text-slate-400"
                        : "bg-slate-900 text-white hover:bg-slate-800"
                    }`}
                  >
                    Precedent
                  </Link>
                  <Link
                    href={qsFor(Math.min(totalPages, currentPage + 1))}
                    className={`rounded-full px-4 py-2 font-semibold ${
                      currentPage >= totalPages
                        ? "pointer-events-none bg-slate-100 text-slate-400"
                        : "bg-slate-900 text-white hover:bg-slate-800"
                    }`}
                  >
                    Suivant
                  </Link>
                  <Link
                    href={qsFor(totalPages)}
                    className={`rounded-full px-4 py-2 font-semibold ${
                      currentPage >= totalPages
                        ? "pointer-events-none bg-slate-100 text-slate-400"
                        : "bg-white text-slate-900 ring-1 ring-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    Derniere
                  </Link>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
